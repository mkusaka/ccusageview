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

export interface DayBucket {
  day: string;
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
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function parseDayIndex(label: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const date = new Date(label + "T00:00:00");
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function groupEntriesByDay(entries: NormalizedEntry[]): NormalizedEntry[][] {
  const grouped = Array.from({ length: 7 }, () => [] as NormalizedEntry[]);

  for (const entry of entries) {
    const dayIndex = parseDayIndex(entry.label);
    if (dayIndex === null) continue;
    grouped[dayIndex].push(entry);
  }

  return grouped;
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

export function buildDayOfWeekData(
  entries: NormalizedEntry[],
  metric: DayOfWeekMetric,
): DayBucket[] {
  return groupEntriesByDay(entries).map((dayEntries, index) => {
    if (dayEntries.length === 0) {
      return {
        day: DAY_LABELS[index],
        avg: 0,
        max: 0,
        min: 0,
        sum: 0,
        count: 0,
      };
    }

    const values = dayEntries.map((entry) => entry[metric]);
    const sum = values.reduce((total, value) => total + value, 0);

    return {
      day: DAY_LABELS[index],
      avg: sum / dayEntries.length,
      max: Math.max(...values),
      min: Math.min(...values),
      sum,
      count: dayEntries.length,
    };
  });
}

export function buildDayOfWeekByBreakdown(
  entries: NormalizedEntry[],
  metric: DayOfWeekMetric,
  breakdownKeys: string[],
  mode: BreakdownMode,
  aggregation: DayOfWeekAggregation,
): Record<string, string | number>[] {
  const dayEntries = groupEntriesByDay(entries);

  return DAY_LABELS.map((day, index) => {
    const row: Record<string, string | number> = { day };
    const entriesForDay = dayEntries[index];

    if (entriesForDay.length === 0) return row;

    if (aggregation === "max" || aggregation === "min") {
      for (const key of breakdownKeys) {
        row[key] = 0;
      }
      if (
        entriesForDay.some((entry) => !entry.modelBreakdowns || entry.modelBreakdowns.length === 0)
      ) {
        row[OTHER_BREAKDOWN_KEY] = 0;
      }

      const selectedEntry = selectRepresentativeEntry(entriesForDay, metric, aggregation);
      if (!selectedEntry) return row;

      const grouped = groupBreakdowns(selectedEntry.modelBreakdowns, mode);
      if (grouped.size === 0) {
        row[OTHER_BREAKDOWN_KEY] = getBreakdownMetricValue(selectedEntry, metric);
        return row;
      }

      for (const [key, metrics] of grouped.entries()) {
        row[key] = getBreakdownMetricValue(metrics, metric);
      }

      return row;
    }

    const totals = new Map<string, number>();

    for (const entry of entriesForDay) {
      const grouped = groupBreakdowns(entry.modelBreakdowns, mode);
      if (grouped.size === 0) {
        const previous = totals.get(OTHER_BREAKDOWN_KEY) ?? 0;
        totals.set(OTHER_BREAKDOWN_KEY, previous + getBreakdownMetricValue(entry, metric));
        continue;
      }

      for (const [key, metrics] of grouped.entries()) {
        const previous = totals.get(key) ?? 0;
        totals.set(key, previous + getBreakdownMetricValue(metrics, metric));
      }
    }

    for (const key of breakdownKeys) {
      const total = totals.get(key) ?? 0;
      row[key] = aggregation === "avg" ? total / entriesForDay.length : total;
    }

    if (totals.has(OTHER_BREAKDOWN_KEY)) {
      const total = totals.get(OTHER_BREAKDOWN_KEY) ?? 0;
      row[OTHER_BREAKDOWN_KEY] = aggregation === "avg" ? total / entriesForDay.length : total;
    }

    return row;
  });
}
