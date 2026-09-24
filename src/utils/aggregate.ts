import type { ModelBreakdown } from "../types";
import type { NormalizedEntry, NormalizedTotals } from "./normalize";
import {
  formatBreakdownLabel,
  groupBreakdowns,
  type BreakdownMetrics,
  type BreakdownMode,
} from "./breakdown";

/** 合算対象の数値フィールド（型安全に検証） */
const NUMERIC_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
  "totalTokens",
  "cost",
] as const satisfies ReadonlyArray<keyof NormalizedEntry>;

type NumericKey = (typeof NUMERIC_KEYS)[number];

/** ModelBreakdownの合算対象フィールド */
const MB_NUMERIC_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
  "cost",
] as const satisfies ReadonlyArray<keyof ModelBreakdown>;

const BREAKDOWN_NUMERIC_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
  "cost",
] as const satisfies ReadonlyArray<keyof BreakdownMetrics>;

export interface AggregatedBreakdown extends BreakdownMetrics {
  key: string;
  label: string;
}

/**
 * entries を keyFn でグループ化し、数値フィールドを合算、
 * models を union、modelBreakdowns を modelName 別にマージして返す。
 */
export function groupEntries(
  entries: NormalizedEntry[],
  keyFn: (e: NormalizedEntry) => string | null,
): NormalizedEntry[] {
  const map = new Map<
    string,
    {
      numerics: Record<NumericKey, number>;
      models: Set<string>;
      modelMap: Map<string, ModelBreakdown>;
      agentMap: Map<string, ModelBreakdown>;
      hasBreakdowns: boolean;
      hasAgentBreakdowns: boolean;
    }
  >();

  for (const entry of entries) {
    const key = keyFn(entry);
    if (key === null) continue;

    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        numerics: Object.fromEntries(NUMERIC_KEYS.map((k) => [k, 0])) as Record<NumericKey, number>,
        models: new Set(),
        modelMap: new Map(),
        agentMap: new Map(),
        hasBreakdowns: false,
        hasAgentBreakdowns: false,
      };
      map.set(key, bucket);
    }

    for (const k of NUMERIC_KEYS) bucket.numerics[k] += entry[k];
    for (const m of entry.models) bucket.models.add(m);
    bucket.hasBreakdowns = mergeBreakdowns(
      bucket.modelMap,
      entry.modelBreakdowns,
      bucket.hasBreakdowns,
    );
    bucket.hasAgentBreakdowns = mergeBreakdowns(
      bucket.agentMap,
      entry.agentBreakdowns,
      bucket.hasAgentBreakdowns,
    );
  }

  return Array.from(map.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([label, b]) =>
      Object.assign(b.numerics, {
        label,
        models: Array.from(b.models),
        modelBreakdowns: b.hasBreakdowns ? Array.from(b.modelMap.values()) : undefined,
        ...(b.hasAgentBreakdowns ? { agentBreakdowns: Array.from(b.agentMap.values()) } : {}),
      }),
    );
}

/** breakdowns を modelName でマップにマージ。要素があれば true を返す */
function mergeBreakdowns(
  target: Map<string, ModelBreakdown>,
  breakdowns: ModelBreakdown[] | undefined,
  seen: boolean,
): boolean {
  if (!breakdowns) return seen;
  for (const mb of breakdowns) {
    const existing = target.get(mb.modelName);
    if (existing) {
      for (const k of MB_NUMERIC_KEYS) existing[k] += mb[k];
    } else {
      target.set(mb.modelName, { ...mb });
    }
  }
  return true;
}

/** entries 全体を合算して NormalizedTotals を返す */
export function sumEntries(entries: NormalizedEntry[]): NormalizedTotals {
  const t = Object.fromEntries(NUMERIC_KEYS.map((k) => [k, 0])) as Record<NumericKey, number>;
  for (const e of entries) {
    for (const k of NUMERIC_KEYS) t[k] += e[k];
  }
  return {
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    cacheCreationTokens: t.cacheCreationTokens,
    cacheReadTokens: t.cacheReadTokens,
    totalTokens: t.totalTokens,
    totalCost: t.cost,
  };
}

/** ModelBreakdown[] を modelName 別に合算 */
export function aggregateModelBreakdowns(entries: NormalizedEntry[]): ModelBreakdown[] {
  const map = new Map<string, ModelBreakdown>();
  for (const entry of entries) {
    if (!entry.modelBreakdowns) continue;
    for (const mb of entry.modelBreakdowns) {
      const existing = map.get(mb.modelName);
      if (existing) {
        for (const k of MB_NUMERIC_KEYS) existing[k] += mb[k];
      } else {
        map.set(mb.modelName, { ...mb });
      }
    }
  }
  return Array.from(map.values());
}

export function aggregateBreakdowns(
  entries: NormalizedEntry[],
  mode: BreakdownMode,
  providerFilter?: string,
): AggregatedBreakdown[] {
  const map = new Map<string, BreakdownMetrics>();

  for (const entry of entries) {
    for (const [key, metrics] of groupBreakdowns(entry, mode, providerFilter).entries()) {
      const existing = map.get(key);
      if (existing) {
        for (const metric of BREAKDOWN_NUMERIC_KEYS) {
          existing[metric] += metrics[metric];
        }
        continue;
      }

      map.set(key, { ...metrics });
    }
  }

  return Array.from(map.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, metrics]) =>
      Object.assign({}, metrics, {
        key,
        label: formatBreakdownLabel(key, mode),
      }),
    );
}
