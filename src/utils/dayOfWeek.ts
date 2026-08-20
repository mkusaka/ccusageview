import {
  getBreakdownMetricValue,
  groupBreakdowns,
  OTHER_BREAKDOWN_KEY,
  type BreakdownMode,
} from "./breakdown";
import type { NormalizedEntry } from "./normalize";

export type DayOfWeekMetric =
  | "cost"
  | "totalTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

export type DayOfWeekAggregation = "avg" | "max" | "min" | "sum";

export type HourOfDayMetric = DayOfWeekMetric;
export type HourOfDayAggregation = DayOfWeekAggregation;

export interface DayBucket {
  day: string;
  avg: number;
  max: number;
  min: number;
  sum: number;
  count: number;
}

export interface HourBucket {
  hour: number;
  avg: number;
  max: number;
  min: number;
  sum: number;
  count: number;
}

export const DAY_OF_WEEK_AGGREGATIONS = [
  "avg",
  "max",
  "min",
  "sum",
] as const satisfies ReadonlyArray<DayOfWeekAggregation>;

export const HOUR_OF_DAY_AGGREGATIONS = DAY_OF_WEEK_AGGREGATIONS;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);

function parseDayIndex(label: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const date = new Date(label + "T00:00:00");
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function parseHourIndex(label: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(label)) return null;
  const hour = Number(label.slice(11, 13));
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

function groupEntriesByIndex(
  entries: NormalizedEntry[],
  extractIndex: (label: string) => number | null,
  bucketCount: number,
): NormalizedEntry[][] {
  const grouped = Array.from({ length: bucketCount }, () => [] as NormalizedEntry[]);

  for (const entry of entries) {
    const index = extractIndex(entry.label);
    if (index === null || index < 0 || index >= bucketCount) continue;
    grouped[index].push(entry);
  }

  return grouped;
}

function groupEntriesByDay(entries: NormalizedEntry[]): NormalizedEntry[][] {
  return groupEntriesByIndex(entries, parseDayIndex, 7);
}

function groupEntriesByHour(entries: NormalizedEntry[]): NormalizedEntry[][] {
  return groupEntriesByIndex(entries, parseHourIndex, 24);
}

function selectRepresentativeEntry(
  entries: NormalizedEntry[],
  metric: DayOfWeekMetric,
  aggregation: Extract<DayOfWeekAggregation, "max" | "min">,
): NormalizedEntry | null {
  if (entries.length === 0) return null;

  return entries.slice(1).reduce((selected, entry) => {
    if (aggregation === "max" && entry[metric] > selected[metric]) return entry;
    if (aggregation === "min" && entry[metric] < selected[metric]) return entry;
    return selected;
  }, entries[0]);
}

interface BucketStats {
  avg: number;
  max: number;
  min: number;
  sum: number;
  count: number;
}

function computeBucketStats(
  bucketEntries: NormalizedEntry[],
  metric: DayOfWeekMetric,
): BucketStats {
  if (bucketEntries.length === 0) {
    return { avg: 0, max: 0, min: 0, sum: 0, count: 0 };
  }

  const values = bucketEntries.map((entry) => entry[metric]);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    avg: sum / bucketEntries.length,
    max: Math.max(...values),
    min: Math.min(...values),
    sum,
    count: bucketEntries.length,
  };
}

function buildBreakdownRows(
  labels: readonly (string | number)[],
  grouped: NormalizedEntry[][],
  labelKey: string,
  metric: DayOfWeekMetric,
  breakdownKeys: string[],
  mode: BreakdownMode,
  aggregation: DayOfWeekAggregation,
): Record<string, string | number>[] {
  return labels.map((label, index) => {
    const row: Record<string, string | number> = { [labelKey]: label };
    const bucketEntries = grouped[index];

    if (bucketEntries.length === 0) return row;

    if (aggregation === "max" || aggregation === "min") {
      for (const key of breakdownKeys) {
        row[key] = 0;
      }
      if (
        bucketEntries.some((entry) => !entry.modelBreakdowns || entry.modelBreakdowns.length === 0)
      ) {
        row[OTHER_BREAKDOWN_KEY] = 0;
      }

      const selectedEntry = selectRepresentativeEntry(bucketEntries, metric, aggregation);
      if (!selectedEntry) return row;

      const groupedBreakdowns = groupBreakdowns(selectedEntry.modelBreakdowns, mode);
      if (groupedBreakdowns.size === 0) {
        row[OTHER_BREAKDOWN_KEY] = getBreakdownMetricValue(selectedEntry, metric);
        return row;
      }

      for (const [key, metrics] of groupedBreakdowns.entries()) {
        row[key] = getBreakdownMetricValue(metrics, metric);
      }

      return row;
    }

    const totals = new Map<string, number>();

    for (const entry of bucketEntries) {
      const groupedBreakdowns = groupBreakdowns(entry.modelBreakdowns, mode);
      if (groupedBreakdowns.size === 0) {
        const previous = totals.get(OTHER_BREAKDOWN_KEY) ?? 0;
        totals.set(OTHER_BREAKDOWN_KEY, previous + getBreakdownMetricValue(entry, metric));
        continue;
      }

      for (const [key, metrics] of groupedBreakdowns.entries()) {
        const previous = totals.get(key) ?? 0;
        totals.set(key, previous + getBreakdownMetricValue(metrics, metric));
      }
    }

    for (const key of breakdownKeys) {
      const total = totals.get(key) ?? 0;
      row[key] = aggregation === "avg" ? total / bucketEntries.length : total;
    }

    if (totals.has(OTHER_BREAKDOWN_KEY)) {
      const total = totals.get(OTHER_BREAKDOWN_KEY) ?? 0;
      row[OTHER_BREAKDOWN_KEY] = aggregation === "avg" ? total / bucketEntries.length : total;
    }

    return row;
  });
}

export function buildDayOfWeekData(
  entries: NormalizedEntry[],
  metric: DayOfWeekMetric,
): DayBucket[] {
  return groupEntriesByDay(entries).map((dayEntries, index) =>
    Object.assign(computeBucketStats(dayEntries, metric), { day: DAY_LABELS[index] }),
  );
}

export function buildHourOfDayData(
  entries: NormalizedEntry[],
  metric: HourOfDayMetric,
): HourBucket[] {
  return groupEntriesByHour(entries).map((hourEntries, index) =>
    Object.assign(computeBucketStats(hourEntries, metric), { hour: HOUR_LABELS[index] }),
  );
}

export function buildDayOfWeekByBreakdown(
  entries: NormalizedEntry[],
  metric: DayOfWeekMetric,
  breakdownKeys: string[],
  mode: BreakdownMode,
  aggregation: DayOfWeekAggregation,
): Record<string, string | number>[] {
  return buildBreakdownRows(
    DAY_LABELS,
    groupEntriesByDay(entries),
    "day",
    metric,
    breakdownKeys,
    mode,
    aggregation,
  );
}

export function buildHourOfDayByBreakdown(
  entries: NormalizedEntry[],
  metric: HourOfDayMetric,
  breakdownKeys: string[],
  mode: BreakdownMode,
  aggregation: HourOfDayAggregation,
): Record<string, string | number>[] {
  return buildBreakdownRows(
    HOUR_LABELS,
    groupEntriesByHour(entries),
    "hour",
    metric,
    breakdownKeys,
    mode,
    aggregation,
  );
}
