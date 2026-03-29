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

type JobHandler<T, R> = (job: Job<T, R>) => Promise<R>;

interface QueueConfig {
  concurrency?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

class Queue<T = unknown, R = unknown> extends EventEmitter {
  private name: string;
  private waiting: Job<T, R>[] = [];
  private active = 0;
  private concurrency: number;
  private maxAttempts: number;
  private backoffMs: number;
  private handler: JobHandler<T, R> | null = null;
  private jobCounter = 0;

  constructor(name: string, cfg: QueueConfig = {}) {
    super();
    this.name = name;
    this.concurrency = cfg.concurrency ?? 3;
    this.maxAttempts = cfg.maxAttempts ?? 3;
    this.backoffMs = cfg.backoffMs ?? 500;
  }

  process(handler: JobHandler<T, R>) {
    this.handler = handler;
  }

  async add(type: string, data: T, priority = 0): Promise<Job<T, R>> {
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

    // Insert sorted by priority (higher = earlier)
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
      this.emit("job:completed", job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attempts < job.maxAttempts) {
        job.status = "waiting";
        const delay = this.backoffMs * Math.pow(2, job.attempts - 1);
        this.emit("job:retry", { job, attempt: job.attempts, delayMs: delay });
        await new Promise((r) => setTimeout(r, delay));
        // Re-queue
        this.waiting.unshift(job);
        this.tick();
      } else {
        job.status = "failed";
        job.error = msg;
        job.completedAt = new Date();
        this.emit("job:failed", { job, error: msg });
      }
    }
  }

  stats() {
    return {
      queue: this.name,
      waiting: this.waiting.length,
      active: this.active,
      concurrency: this.concurrency,
    };
  }
}

// ── Queue registry ───────────────────────────────
const _queues = new Map<string, Queue<any, any>>();

export function getQueue<T, R>(name: string, cfg?: QueueConfig): Queue<T, R> {
  if (!_queues.has(name)) {
    _queues.set(name, new Queue<T, R>(name, cfg));
  }
  return _queues.get(name) as Queue<T, R>;
}

export function allQueueStats() {
  return Array.from(_queues.values()).map((q) => q.stats());
}

// Named queues matching the spec
export const localAiQueue = getQueue("local-ai-queue", { concurrency: 4 });
export const cloudAiQueue = getQueue("cloud-ai-queue", { concurrency: 6 });
