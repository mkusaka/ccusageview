import type { NormalizedEntry } from "./normalize";
import type { ModelBreakdown } from "../types";

/** Numeric fields of NormalizedEntry that statistics can be computed over */
export type StatMetricKey =
  | "cost"
  | "totalTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

/** Map StatMetricKey to ModelBreakdown field (totalTokens is computed) */
function getModelMetricValue(mb: ModelBreakdown, key: StatMetricKey): number {
  if (key === "totalTokens") {
    return mb.inputTokens + mb.outputTokens + mb.cacheCreationTokens + mb.cacheReadTokens;
  }
  return mb[key];
}

/**
 * Extract a single metric's values for a specific model from entries.
 * Only entries where the model appears in modelBreakdowns are included.
 */
export function extractMetricByModel(
  entries: NormalizedEntry[],
  key: StatMetricKey,
  modelName: string,
): number[] {
  const values: number[] = [];
  for (const e of entries) {
    if (!e.modelBreakdowns) continue;
    const mb = e.modelBreakdowns.find((m) => m.modelName === modelName);
    if (mb) values.push(getModelMetricValue(mb, key));
  }
  return values;
}

/**
 * Compute descriptive statistics for each metric, filtered to a specific model.
 */
export function computeAllStatsByModel(
  entries: NormalizedEntry[],
  modelName: string,
): Record<StatMetricKey, DescriptiveStats> {
  const result = {} as Record<StatMetricKey, DescriptiveStats>;
  for (const key of STAT_METRIC_KEYS) {
    result[key] = computeStats(extractMetricByModel(entries, key, modelName));
  }
  return result;
}

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

/** A metric value paired with the entry label (date) it came from */
export interface LabeledValue {
  label: string;
  value: number;
}

/** Extract a single metric's values with their source labels */
export function extractMetricWithLabels(
  entries: NormalizedEntry[],
  key: StatMetricKey,
): LabeledValue[] {
  return entries.map((e) => ({ label: e.label, value: e[key] }));
}

/** Extract a single metric's values with labels, filtered by model */
export function extractMetricByModelWithLabels(
  entries: NormalizedEntry[],
  key: StatMetricKey,
  modelName: string,
): LabeledValue[] {
  const result: LabeledValue[] = [];
  for (const e of entries) {
    if (!e.modelBreakdowns) continue;
    const mb = e.modelBreakdowns.find((m) => m.modelName === modelName);
    if (mb) result.push({ label: e.label, value: getModelMetricValue(mb, key) });
  }
  return result;
}

/**
 * Find source labels (dates) for stat values that correspond to actual entries.
 * Returns a map from stat field name to matching labels.
 */
export function findStatSourceLabels(
  labeledValues: LabeledValue[],
  stats: DescriptiveStats,
): Partial<Record<string, string[]>> {
  if (stats.count === 0) return {};

  const fieldsToCheck: { field: string; value: number }[] = [
    { field: "min", value: stats.min },
    { field: "max", value: stats.max },
    { field: "median", value: stats.median },
    { field: "p75", value: stats.p75 },
    { field: "p90", value: stats.p90 },
    { field: "p95", value: stats.p95 },
    { field: "p99", value: stats.p99 },
  ];

  const result: Partial<Record<string, string[]>> = {};
  for (const { field, value } of fieldsToCheck) {
    const matches = labeledValues.filter((v) => v.value === value).map((v) => v.label);
    if (matches.length > 0) {
      result[field] = matches;
    }
  }
  return result;
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

/** Build sorted distribution data from raw values */
export function buildDistributionFromValues(values: number[]): DistributionPoint[] {
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];

  return sorted.map((value, i) => ({
    rank: n === 1 ? 100 : Math.round((i / (n - 1)) * 100),
    value,
  }));
}

/**
 * Build sorted distribution data for charting.
 * Each point maps a percentile rank (0–100) to the corresponding value.
 */
export function buildDistribution(
  entries: NormalizedEntry[],
  key: StatMetricKey,
): DistributionPoint[] {
  return buildDistributionFromValues(extractMetric(entries, key));
}
