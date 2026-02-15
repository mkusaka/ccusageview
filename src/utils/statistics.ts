import type { NormalizedEntry } from "./normalize";

/** Numeric fields of NormalizedEntry that statistics can be computed over */
export type StatMetricKey =
  | "cost"
  | "totalTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

export const STAT_METRIC_KEYS: readonly StatMetricKey[] = [
  "cost",
  "totalTokens",
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
] as const;

/** Result of computing descriptive statistics over a single metric */
export interface DescriptiveStats {
  count: number;
  min: number;
  max: number;
  sum: number;
  mean: number;
  median: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  skewness: number;
  p25: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  iqr: number;
}

/** Extract a single metric's values from entries */
export function extractMetric(entries: NormalizedEntry[], key: StatMetricKey): number[] {
  return entries.map((e) => e[key]);
}

/**
 * Compute percentile using linear interpolation (PERCENTILE.INC method).
 * Expects a PRE-SORTED ascending array. p must be in [0, 1].
 */
export function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];

  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;

  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

/** Compute all descriptive statistics for an array of numbers */
export function computeStats(values: number[]): DescriptiveStats {
  const n = values.length;

  if (n === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      sum: 0,
      mean: 0,
      median: 0,
      standardDeviation: 0,
      coefficientOfVariation: NaN,
      skewness: NaN,
      p25: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      iqr: 0,
    };
  }

  const sorted = values.toSorted((a, b) => a - b);

  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];

  // Variance (sample variance, n-1 denominator)
  let sumSqDiff = 0;
  for (const v of sorted) {
    const diff = v - mean;
    sumSqDiff += diff * diff;
  }
  const variance = n > 1 ? sumSqDiff / (n - 1) : 0;
  const standardDeviation = Math.sqrt(variance);

  const coefficientOfVariation = mean !== 0 ? standardDeviation / mean : NaN;

  // Skewness (Fisher-Pearson, adjusted for sample bias)
  let skewness: number;
  if (n < 3 || standardDeviation === 0) {
    skewness = NaN;
  } else {
    let sumCubeDiff = 0;
    for (const v of sorted) {
      const diff = (v - mean) / standardDeviation;
      sumCubeDiff += diff * diff * diff;
    }
    skewness = (n / ((n - 1) * (n - 2))) * sumCubeDiff;
  }

  const median = percentile(sorted, 0.5);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  const p90 = percentile(sorted, 0.9);
  const p95 = percentile(sorted, 0.95);
  const p99 = percentile(sorted, 0.99);
  const iqr = p75 - p25;

  return {
    count: n,
    min,
    max,
    sum,
    mean,
    median,
    standardDeviation,
    coefficientOfVariation,
    skewness,
    p25,
    p75,
    p90,
    p95,
    p99,
    iqr,
  };
}

/**
 * Compute descriptive statistics for each metric across entries.
 */
export function computeAllStats(
  entries: NormalizedEntry[],
): Record<StatMetricKey, DescriptiveStats> {
  const result = {} as Record<StatMetricKey, DescriptiveStats>;
  for (const key of STAT_METRIC_KEYS) {
    result[key] = computeStats(extractMetric(entries, key));
  }
  return result;
}

/** A single point on the distribution curve */
export interface DistributionPoint {
  rank: number; // percentile rank 0–100
  value: number;
}

/**
 * Build sorted distribution data for charting.
 * Each point maps a percentile rank (0–100) to the corresponding value.
 */
export function buildDistribution(
  entries: NormalizedEntry[],
  key: StatMetricKey,
): DistributionPoint[] {
  const values = extractMetric(entries, key);
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];

  return sorted.map((value, i) => ({
    rank: n === 1 ? 100 : Math.round((i / (n - 1)) * 100),
    value,
  }));
}
