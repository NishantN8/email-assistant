import { EventEmitter } from "events";

export type JobStatus = "waiting" | "active" | "completed" | "failed";

export interface Job<T = unknown, R = unknown> {
  id: string;
  queue: string;
  type: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  result?: R;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class QueueFullError extends Error {
  constructor(queueName: string, depth: number) {
    super(`Queue '${queueName}' is full (depth=${depth})`);
    this.name = "QueueFullError";
  }
}

type JobHandler<T, R> = (job: Job<T, R>) => Promise<R>;

interface QueueConfig {
  concurrency?: number;
  maxAttempts?: number;
  backoffMs?: number;
  maxDepth?: number;
}

export interface QueueStats {
  queue: string;
  waiting: number;
  active: number;
  concurrency: number;
  maxDepth: number;
  total_processed: number;
  dlq_depth: number;
  last_progress_ms: number | null;
}

const DLQ_MAX_SIZE = 100;

class Queue<T = unknown, R = unknown> extends EventEmitter {
  private name: string;
  private waiting: Job<T, R>[] = [];
  private active = 0;
  private concurrency: number;
  private maxAttempts: number;
  private backoffMs: number;
  private maxDepth: number;
  private handler: JobHandler<T, R> | null = null;
  private jobCounter = 0;
  private totalProcessed = 0;
  private dlq: Job<T, R>[] = [];
  private lastProgressAt: number | null = null;

  constructor(name: string, cfg: QueueConfig = {}) {
    super();
    this.name = name;
    this.concurrency = cfg.concurrency ?? 3;
    this.maxAttempts = cfg.maxAttempts ?? 3;
    this.backoffMs = cfg.backoffMs ?? 500;
    this.maxDepth = cfg.maxDepth ?? 200;
  }

  process(handler: JobHandler<T, R>) {
    this.handler = handler;
  }

  async add(type: string, data: T, priority = 0): Promise<Job<T, R>> {
    const effectiveDepth = this.waiting.length + this.active;
    if (effectiveDepth >= this.maxDepth) {
      throw new QueueFullError(this.name, effectiveDepth);
    }

    const job: Job<T, R> = {
      id: `${this.name}:${++this.jobCounter}:${Date.now()}`,
      queue: this.name,
      type,
      data,
      priority,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      status: "waiting",
      createdAt: new Date(),
    };

    const idx = this.waiting.findIndex((j) => j.priority < priority);
    if (idx === -1) {
      this.waiting.push(job);
    } else {
      this.waiting.splice(idx, 0, job);
    }

    this.emit("job:added", job);
    this.tick();
    return job;
  }

  waitForJob(job: Job<T, R>): Promise<R> {
    if (job.status === "completed" && job.result !== undefined) {
      return Promise.resolve(job.result as R);
    }
    if (job.status === "failed") {
      return Promise.reject(new Error(job.error || "job_failed"));
    }

    return new Promise<R>((resolve, reject) => {
      const onCompleted = (completedJob: Job<T, R>) => {
        if (completedJob.id === job.id) {
          cleanup();
          resolve(completedJob.result as R);
        }
      };

      const onFailed = ({ job: failedJob, error }: { job: Job<T, R>; error: string }) => {
        if (failedJob.id === job.id) {
          cleanup();
          reject(new Error(error || "job_failed"));
        }
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error("job_timeout"));
      };

      const timer = setTimeout(onTimeout, 30_000);

      const cleanup = () => {
        clearTimeout(timer);
        this.off("job:completed", onCompleted);
        this.off("job:failed_final", onFailed);
      };

      this.on("job:completed", onCompleted);
      this.on("job:failed_final", onFailed);
    });
  }

  private tick() {
    if (!this.handler || this.active >= this.concurrency || this.waiting.length === 0) return;
    const job = this.waiting.shift()!;
    this.active++;
    this.runJob(job).finally(() => {
      this.active--;
      this.tick();
    });
  }

  private async runJob(job: Job<T, R>): Promise<void> {
    job.status = "active";
    job.startedAt = new Date();
    job.attempts++;
    this.emit("job:active", job);

    try {
      job.result = await this.handler!(job);
      job.status = "completed";
      job.completedAt = new Date();
      this.totalProcessed++;
      this.lastProgressAt = Date.now();
      this.emit("job:completed", job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attempts < job.maxAttempts) {
        job.status = "waiting";
        const delay = this.backoffMs * Math.pow(2, job.attempts - 1);
        this.emit("job:retry", { job, attempt: job.attempts, delayMs: delay });
        await new Promise((r) => setTimeout(r, delay));
        this.waiting.unshift(job);
        this.tick();
      } else {
        job.status = "failed";
        job.error = msg;
        job.completedAt = new Date();
        this.totalProcessed++;
        this.lastProgressAt = Date.now();
        this.dlq.push(job);
        if (this.dlq.length > DLQ_MAX_SIZE) {
          this.dlq.shift();
        }
        this.emit("job:failed_final", { job, error: msg });
      }
    }
  }

  stats(): QueueStats {
    return {
      queue: this.name,
      waiting: this.waiting.length,
      active: this.active,
      concurrency: this.concurrency,
      maxDepth: this.maxDepth,
      total_processed: this.totalProcessed,
      dlq_depth: this.dlq.length,
      last_progress_ms: this.lastProgressAt,
    };
  }
}

const _queues = new Map<string, Queue<any, any>>();

export function getQueue<T, R>(name: string, cfg?: QueueConfig): Queue<T, R> {
  if (!_queues.has(name)) {
    _queues.set(name, new Queue<T, R>(name, cfg));
  }
  return _queues.get(name) as Queue<T, R>;
}

export function allQueueStats(): QueueStats[] {
  return Array.from(_queues.values()).map((q) => q.stats());
}

export const localAiQueue = getQueue("local-ai-queue", { concurrency: 4, maxDepth: 200 });
export const cloudAiQueue = getQueue("cloud-ai-queue", { concurrency: 6, maxDepth: 200 });
