const MODEL_BREAKDOWN_METRICS = [
  "cost",
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
] as const;

export type ModelBreakdownMetric = (typeof MODEL_BREAKDOWN_METRICS)[number];
export type ModelBreakdownSortKey = "label" | "cacheReadRate" | ModelBreakdownMetric;
type ModelBreakdownSortDir = "asc" | "desc";

export interface ModelBreakdownSortState {
  sortCol: ModelBreakdownSortKey;
  sortDir: ModelBreakdownSortDir;
  metric: ModelBreakdownMetric;
}

export function createInitialModelBreakdownSortState(): ModelBreakdownSortState {
  return {
    sortCol: "cost",
    sortDir: "desc",
    metric: "cost",
  };
}

export function getNextModelBreakdownSortState(
  current: ModelBreakdownSortState,
  nextSortCol: ModelBreakdownSortKey,
): ModelBreakdownSortState {
  if (current.sortCol === nextSortCol) {
    return {
      ...current,
      sortDir: current.sortDir === "asc" ? "desc" : "asc",
    };
  }

  if (nextSortCol === "label" || nextSortCol === "cacheReadRate") {
    return {
      ...current,
      sortCol: nextSortCol,
      sortDir: nextSortCol === "label" ? "asc" : "desc",
    };
  }

  return {
    sortCol: nextSortCol,
    sortDir: "desc",
    metric: nextSortCol,
  };
}
