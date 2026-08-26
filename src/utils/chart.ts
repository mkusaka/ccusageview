import type { NormalizedEntry } from "./normalize";
import {
  collectBreakdownKeys,
  formatBreakdownLabel,
  getBreakdownMetricValue,
  groupBreakdowns,
  OTHER_BREAKDOWN_KEY,
  type BreakdownMode,
} from "./breakdown";

export const MODEL_COLORS = [
  "var(--color-chart-blue)",
  "var(--color-chart-green)",
  "var(--color-chart-orange)",
  "var(--color-chart-purple)",
  "var(--color-chart-teal)",
  "var(--color-chart-red)",
];

export { shortenModelName } from "./breakdown";

export function collectModels(
  entries: NormalizedEntry[],
  mode: BreakdownMode = "model",
  providerFilter?: string,
): string[] {
  return collectBreakdownKeys(entries, mode, providerFilter);
}

export interface SeriesItem {
  key: string;
  label: string;
  color: string;
}

export function buildModelSeries(
  allModels: string[],
  entries: NormalizedEntry[],
  colors: string[] = MODEL_COLORS,
  mode: BreakdownMode = "model",
  providerFilter?: string,
): SeriesItem[] {
  const result = allModels.map((m, i) => ({
    key: m,
    label: formatBreakdownLabel(m, mode),
    color: colors[i % colors.length],
  }));
  if (
    providerFilter === undefined &&
    entries.some((e) => !e.modelBreakdowns || e.modelBreakdowns.length === 0)
  ) {
    result.push({
      key: OTHER_BREAKDOWN_KEY,
      label: OTHER_BREAKDOWN_KEY,
      color: colors[result.length % colors.length],
    });
  }
  return result;
}

type ChartBreakdownMetricKey = "cost" | ModelTokenType;

function buildMetricByBreakdown(
  entries: NormalizedEntry[],
  metric: ChartBreakdownMetricKey,
  mode: BreakdownMode,
  providerFilter?: string,
): Record<string, string | number>[] {
  return entries.map((entry) => {
    const row: Record<string, string | number> = { label: entry.label };
    const grouped = groupBreakdowns(entry.modelBreakdowns, mode, providerFilter);

    if (grouped.size === 0) {
      if (providerFilter === undefined) {
        row[OTHER_BREAKDOWN_KEY] = metric === "cost" ? entry.cost : entry[metric];
      }
      return row;
    }

    for (const [key, metrics] of grouped.entries()) {
      row[key] = getBreakdownMetricValue(metrics, metric);
    }

    return row;
  });
}

export function buildCostByModel(
  entries: NormalizedEntry[],
  mode: BreakdownMode = "model",
  providerFilter?: string,
): Record<string, string | number>[] {
  return buildMetricByBreakdown(entries, "cost", mode, providerFilter);
}

export type ModelTokenType =
  | "totalTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

export type TokenBreakdownChartRow = Record<string, string | number>;

export function buildTokenTypeByModel(
  entries: NormalizedEntry[],
  tokenType: ModelTokenType,
  mode: BreakdownMode = "model",
  providerFilter?: string,
): TokenBreakdownChartRow[] {
  return buildMetricByBreakdown(entries, tokenType, mode, providerFilter);
}

export function getTokenStackKey(
  breakdownKey: string,
  tokenType: Exclude<ModelTokenType, "totalTokens">,
): string {
  return `${breakdownKey}\0${tokenType}`;
}

export function buildTokenTypeStacks(
  entries: NormalizedEntry[],
  mode: BreakdownMode = "model",
  providerFilter?: string,
): TokenBreakdownChartRow[] {
  return entries.map((entry) => {
    const row: Record<string, string | number> = { label: entry.label };
    const grouped = groupBreakdowns(entry.modelBreakdowns, mode, providerFilter);

    if (grouped.size === 0) {
      if (providerFilter === undefined) {
        for (const tokenType of [
          "inputTokens",
          "outputTokens",
          "cacheCreationTokens",
          "cacheReadTokens",
        ] as const) {
          row[getTokenStackKey(OTHER_BREAKDOWN_KEY, tokenType)] = entry[tokenType];
        }
      }
      return row;
    }

    for (const [key, metrics] of grouped.entries()) {
      for (const tokenType of [
        "inputTokens",
        "outputTokens",
        "cacheCreationTokens",
        "cacheReadTokens",
      ] as const) {
        row[getTokenStackKey(key, tokenType)] = getBreakdownMetricValue(metrics, tokenType);
      }
    }
    return row;
  });
}
