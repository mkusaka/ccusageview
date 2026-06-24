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
  inputPlusCacheReadTokens: number;
  cacheReadRate: number | null;
}

export interface CacheEfficiencyChartDatum extends CacheEfficiencyMetrics {
  label: string;
}

export function calculateCacheEfficiency(input: CacheEfficiencyInput): CacheEfficiencyMetrics {
  const inputPlusCacheReadTokens = input.inputTokens + input.cacheReadTokens;

  return {
    inputTokens: input.inputTokens,
    cacheReadTokens: input.cacheReadTokens,
    cacheCreationTokens: input.cacheCreationTokens ?? 0,
    inputPlusCacheReadTokens,
    cacheReadRate:
      inputPlusCacheReadTokens === 0 ? null : input.cacheReadTokens / inputPlusCacheReadTokens,
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
