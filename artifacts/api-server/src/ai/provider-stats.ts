interface CallRecord {
  provider: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

interface FallbackRecord {
  timestamp: number;
}

const WINDOW_MS = 5 * 60 * 1000;
const MIN_SAMPLES = 3;

const records: CallRecord[] = [];
const fallbackRecords: FallbackRecord[] = [];
const localAttemptRecords: FallbackRecord[] = [];

function evictAll() {
  const cutoff = Date.now() - WINDOW_MS;
  while (records.length > 0 && records[0].timestamp < cutoff) records.shift();
  while (fallbackRecords.length > 0 && fallbackRecords[0].timestamp < cutoff) fallbackRecords.shift();
  while (localAttemptRecords.length > 0 && localAttemptRecords[0].timestamp < cutoff) localAttemptRecords.shift();
}

export function recordProviderCall(provider: string, durationMs: number, success: boolean) {
  records.push({ provider, durationMs, success, timestamp: Date.now() });
  evictAll();
}

export function recordLocalAttempt() {
  localAttemptRecords.push({ timestamp: Date.now() });
  evictAll();
}

export function recordFallbackToCloud() {
  fallbackRecords.push({ timestamp: Date.now() });
  evictAll();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getProviderStats(provider: string) {
  const providerRecords = records.filter((r) => r.provider === provider);
  if (providerRecords.length < MIN_SAMPLES) return null;

  const durations = providerRecords.map((r) => r.durationMs);
  const successCount = providerRecords.filter((r) => r.success).length;

  return {
    successRate: successCount / providerRecords.length,
    avgLatencyMs: durations.reduce((s, d) => s + d, 0) / durations.length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    samples: providerRecords.length,
  };
}

export function compositeScore(provider: string): number | null {
  const stats = getProviderStats(provider);
  if (!stats || stats.avgLatencyMs === 0) return null;
  return stats.successRate / stats.avgLatencyMs;
}

export function sortProvidersByScore<T extends { name: string }>(providers: T[]): T[] {
  evictAll();
  return [...providers].sort((a, b) => {
    const scoreA = compositeScore(a.name);
    const scoreB = compositeScore(b.name);
    if (scoreA === null && scoreB === null) return 0;
    if (scoreA === null) return 1;
    if (scoreB === null) return -1;
    return scoreB - scoreA;
  });
}

export function getAllProviderStats() {
  evictAll();
  const providerNames = [...new Set(records.map((r) => r.provider))];
  return providerNames.map((name) => {
    const stats = getProviderStats(name);
    return {
      provider: name,
      successRate: stats?.successRate ?? null,
      avgLatencyMs: stats?.avgLatencyMs ?? null,
      p50Ms: stats?.p50Ms ?? null,
      p95Ms: stats?.p95Ms ?? null,
      samples: stats?.samples ?? 0,
      compositeScore: compositeScore(name),
    };
  });
}

export function getLocalFallbackRate(): number {
  evictAll();
  const attempts = localAttemptRecords.length;
  if (attempts === 0) return 0;
  return fallbackRecords.length / attempts;
}
