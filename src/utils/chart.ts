import type { NormalizedEntry } from "./normalize";

export const MODEL_COLORS = [
  "var(--color-chart-blue)",
  "var(--color-chart-green)",
  "var(--color-chart-orange)",
  "var(--color-chart-purple)",
  "var(--color-chart-teal)",
  "var(--color-chart-red)",
];

export function shortenModelName(name: string): string {
  const match = name.match(/^claude-(.+)-\d{8}$/);
  return match ? match[1] : name;
}

export function collectModels(entries: NormalizedEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.modelBreakdowns) {
      for (const mb of e.modelBreakdowns) set.add(mb.modelName);
    }
  }
  return Array.from(set).toSorted();
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
): SeriesItem[] {
  const result = allModels.map((m, i) => ({
    key: m,
    label: shortenModelName(m),
    color: colors[i % colors.length],
  }));
  if (entries.some((e) => !e.modelBreakdowns || e.modelBreakdowns.length === 0)) {
    result.push({
      key: "Other",
      label: "Other",
      color: colors[result.length % colors.length],
    });
  }
  return result;
}

export function buildCostByModel(entries: NormalizedEntry[]): Record<string, string | number>[] {
  return entries.map((e) => {
    const d: Record<string, string | number> = { label: e.label };
    if (e.modelBreakdowns && e.modelBreakdowns.length > 0) {
      for (const mb of e.modelBreakdowns) {
        d[mb.modelName] = mb.cost;
      }
    } else {
      d["Other"] = e.cost;
    }
    return d;
  });
}

export type ModelTokenType =
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

export function buildTokenTypeByModel(
  entries: NormalizedEntry[],
  tokenType: ModelTokenType,
): Record<string, string | number>[] {
  return entries.map((e) => {
    const d: Record<string, string | number> = { label: e.label };
    if (e.modelBreakdowns && e.modelBreakdowns.length > 0) {
      for (const mb of e.modelBreakdowns) {
        d[mb.modelName] = mb[tokenType];
      }
    } else {
      d["Other"] = e[tokenType];
    }
    return d;
  });
}
