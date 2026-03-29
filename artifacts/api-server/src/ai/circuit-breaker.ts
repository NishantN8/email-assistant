export interface CircuitBreakerConfig {
  tripThresholdMs?: number;
  errorRateThreshold?: number;
  windowMs?: number;
  recoveryWindowMs?: number;
  minSamples?: number;
}

type BreakerState = "closed" | "open" | "half-open";

interface CallRecord {
  durationMs: number;
  failed: boolean;
  timestamp: number;
}

export class CircuitBreaker {
  private name: string;
  private _state: BreakerState = "closed";
  private tripThresholdMs: number;
  private errorRateThreshold: number;
  private windowMs: number;
  private recoveryWindowMs: number;
  private minSamples: number;
  private openedAt: number | null = null;
  private records: CallRecord[] = [];
  private _probing = false;

  constructor(name: string, cfg: CircuitBreakerConfig = {}) {
    this.name = name;
    this.tripThresholdMs = cfg.tripThresholdMs ?? 8000;
    this.errorRateThreshold = cfg.errorRateThreshold ?? 0.5;
    this.windowMs = cfg.windowMs ?? 60_000;
    this.recoveryWindowMs = cfg.recoveryWindowMs ?? 30_000;
    this.minSamples = cfg.minSamples ?? 3;
  }

  private transitionToHalfOpen() {
    this._state = "half-open";
    this._probing = false;
  }

  private get effectiveState(): BreakerState {
    if (
      this._state === "open" &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.recoveryWindowMs
    ) {
      this.transitionToHalfOpen();
    }
    return this._state;
  }

  isOpen(): boolean {
    return this.effectiveState === "open";
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.effectiveState;

    if (state === "open") {
      throw new Error(`circuit_open:${this.name}`);
    }

    if (state === "half-open") {
      if (this._probing) {
        throw new Error(`circuit_open:${this.name}`);
      }
      this._probing = true;
    }

    const t0 = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - t0;
      this.handleSuccess(durationMs);
      return result;
    } catch (err) {
      const durationMs = Date.now() - t0;
      this.handleFailure(durationMs);
      throw err;
    }
  }

  private handleSuccess(durationMs: number) {
    if (this._state === "half-open") {
      this._state = "closed";
      this._probing = false;
      this.openedAt = null;
      this.records = [];
      return;
    }

    const now = Date.now();
    this.records.push({ durationMs, failed: false, timestamp: now });
    this.evict(now);
    this.evaluateClosed();
  }

  private handleFailure(durationMs: number) {
    if (this._state === "half-open") {
      this._state = "open";
      this._probing = false;
      this.openedAt = Date.now();
      this.records = [];
      return;
    }

    const now = Date.now();
    this.records.push({ durationMs, failed: true, timestamp: now });
    this.evict(now);
    this.evaluateClosed();
  }

  private evict(now: number) {
    const cutoff = now - this.windowMs;
    this.records = this.records.filter((r) => r.timestamp >= cutoff);
  }

  private evaluateClosed() {
    const n = this.records.length;
    if (n < this.minSamples) return;

    const errorRate = this.records.filter((r) => r.failed).length / n;
    const p95 = this.percentile(
      this.records.map((r) => r.durationMs),
      95
    );

    if (errorRate > this.errorRateThreshold || p95 > this.tripThresholdMs) {
      this._state = "open";
      this.openedAt = Date.now();
      this.records = [];
    }
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getState(): BreakerState {
    return this.effectiveState;
  }

  getStats() {
    const now = Date.now();
    this.evict(now);
    const n = this.records.length;
    const durations = this.records.map((r) => r.durationMs);
    const errors = this.records.filter((r) => r.failed).length;
    return {
      name: this.name,
      state: this.getState(),
      probing: this._probing,
      samples: n,
      errorRate: n > 0 ? errors / n : 0,
      p50Ms: this.percentile(durations, 50),
      p95Ms: this.percentile(durations, 95),
    };
  }
}

const _breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  cfg?: CircuitBreakerConfig
): CircuitBreaker {
  if (!_breakers.has(name)) {
    _breakers.set(name, new CircuitBreaker(name, cfg));
  }
  return _breakers.get(name)!;
}

export function allBreakerStats() {
  return Array.from(_breakers.values()).map((b) => b.getStats());
}
