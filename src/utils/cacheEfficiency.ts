import type { NormalizedEntry } from "./normalize";
import { groupBreakdowns, type BreakdownMode } from "./breakdown";

export interface CacheEfficiencyInput {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens?: number;
}

export interface CacheEfficiencyMetrics {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheEfficiencyDenominatorTokens: number;
  cacheReadRate: number | null;
}

export interface CacheEfficiencyChartDatum extends CacheEfficiencyMetrics {
  label: string;
}

export type CacheEfficiencyBreakdownMetric =
  | "inputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens"
  | "cacheReadRate";

export type CacheEfficiencyBreakdownChartDatum = {
  label: string;
} & Record<string, string | number | null>;

export function getCacheEfficiencyBreakdownDataKey(
  breakdownKey: string,
  metric: CacheEfficiencyBreakdownMetric,
): string {
  return `${breakdownKey}::${metric}`;
}

export function calculateCacheEfficiency(input: CacheEfficiencyInput): CacheEfficiencyMetrics {
  const cacheCreationTokens = input.cacheCreationTokens ?? 0;
  const cacheEfficiencyDenominatorTokens =
    input.inputTokens + cacheCreationTokens + input.cacheReadTokens;

  return {
    inputTokens: input.inputTokens,
    cacheReadTokens: input.cacheReadTokens,
    cacheCreationTokens,
    cacheEfficiencyDenominatorTokens,
    cacheReadRate:
      cacheEfficiencyDenominatorTokens === 0
        ? null
        : input.cacheReadTokens / cacheEfficiencyDenominatorTokens,
  };
}

export function getCacheReadRate(input: CacheEfficiencyInput): number | null {
  return calculateCacheEfficiency(input).cacheReadRate;
}

export function formatCacheReadRate(rate: number | null): string {
  return rate == null ? "N/A" : `${(rate * 100).toFixed(1)}%`;
}

export function buildCacheEfficiencyChartData(
  entries: readonly NormalizedEntry[],
): CacheEfficiencyChartDatum[] {
  return entries.map((entry) => ({
    label: entry.label,
    ...calculateCacheEfficiency(entry),
  }));
}

export function buildCacheEfficiencyChartDataForBreakdowns(
  entries: readonly NormalizedEntry[],
  visibleBreakdowns: ReadonlySet<string>,
  includeOther: boolean,
  mode: BreakdownMode,
): CacheEfficiencyChartDatum[] {
  return entries.map((entry) => {
    const grouped = groupBreakdowns(entry.modelBreakdowns, mode);

    if (grouped.size === 0) {
      return {
        label: entry.label,
        ...calculateCacheEfficiency(
          includeOther
            ? entry
            : {
                inputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
              },
        ),
      };
    }

    let inputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;

    for (const [key, metrics] of grouped.entries()) {
      if (!visibleBreakdowns.has(key)) continue;
      inputTokens += metrics.inputTokens;
      cacheReadTokens += metrics.cacheReadTokens;
      cacheCreationTokens += metrics.cacheCreationTokens;
    }

    return {
      label: entry.label,
      ...calculateCacheEfficiency({
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      }),
    };
  });
}

export function buildCacheEfficiencyChartDataByBreakdown(
  entries: readonly NormalizedEntry[],
  visibleBreakdowns: readonly string[],
  includeOther: boolean,
  mode: BreakdownMode,
): CacheEfficiencyBreakdownChartDatum[] {
  const visibleBreakdownSet = new Set(visibleBreakdowns);

  return entries.map((entry) => {
    const row: CacheEfficiencyBreakdownChartDatum = { label: entry.label };

    const grouped = groupBreakdowns(entry.modelBreakdowns, mode);
    if (grouped.size === 0) {
      if (includeOther && visibleBreakdownSet.has("Other")) {
        const metrics = calculateCacheEfficiency(entry);
        row[getCacheEfficiencyBreakdownDataKey("Other", "inputTokens")] = metrics.inputTokens;
        row[getCacheEfficiencyBreakdownDataKey("Other", "cacheCreationTokens")] =
          metrics.cacheCreationTokens;
        row[getCacheEfficiencyBreakdownDataKey("Other", "cacheReadTokens")] =
          metrics.cacheReadTokens;
        row[getCacheEfficiencyBreakdownDataKey("Other", "cacheReadRate")] = metrics.cacheReadRate;
      }
      return row;
    }

    for (const [key, metrics] of grouped.entries()) {
      if (!visibleBreakdownSet.has(key)) continue;

      const efficiency = calculateCacheEfficiency(metrics);
      row[getCacheEfficiencyBreakdownDataKey(key, "inputTokens")] = efficiency.inputTokens;
      row[getCacheEfficiencyBreakdownDataKey(key, "cacheCreationTokens")] =
        efficiency.cacheCreationTokens;
      row[getCacheEfficiencyBreakdownDataKey(key, "cacheReadTokens")] = efficiency.cacheReadTokens;
      row[getCacheEfficiencyBreakdownDataKey(key, "cacheReadRate")] = efficiency.cacheReadRate;
    }

    return row;
  });
}
