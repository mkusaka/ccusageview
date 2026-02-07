import type { ModelBreakdown } from "../types";
import type { NormalizedEntry } from "./normalize";

/**
 * Merge multiple arrays of NormalizedEntry into one.
 * Entries with the same label are combined (numeric fields summed,
 * models unioned, modelBreakdowns merged by modelName).
 */
export function mergeNormalizedEntries(entriesArrays: NormalizedEntry[][]): NormalizedEntry[] {
  if (entriesArrays.length === 0) return [];
  if (entriesArrays.length === 1) return entriesArrays[0];

  const map = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      totalTokens: number;
      cost: number;
      models: Set<string>;
      modelMap: Map<string, ModelBreakdown>;
      hasBreakdowns: boolean;
    }
  >();

  for (const entries of entriesArrays) {
    for (const entry of entries) {
      let bucket = map.get(entry.label);
      if (!bucket) {
        bucket = {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          cost: 0,
          models: new Set(),
          modelMap: new Map(),
          hasBreakdowns: false,
        };
        map.set(entry.label, bucket);
      }

      bucket.inputTokens += entry.inputTokens;
      bucket.outputTokens += entry.outputTokens;
      bucket.cacheCreationTokens += entry.cacheCreationTokens;
      bucket.cacheReadTokens += entry.cacheReadTokens;
      bucket.totalTokens += entry.totalTokens;
      bucket.cost += entry.cost;
      for (const m of entry.models) bucket.models.add(m);

      if (entry.modelBreakdowns) {
        bucket.hasBreakdowns = true;
        for (const mb of entry.modelBreakdowns) {
          const existing = bucket.modelMap.get(mb.modelName);
          if (existing) {
            existing.inputTokens += mb.inputTokens;
            existing.outputTokens += mb.outputTokens;
            existing.cacheCreationTokens += mb.cacheCreationTokens;
            existing.cacheReadTokens += mb.cacheReadTokens;
            existing.cost += mb.cost;
          } else {
            bucket.modelMap.set(mb.modelName, { ...mb });
          }
        }
      }
    }
  }

  return Array.from(map.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([label, b]) => ({
      label,
      inputTokens: b.inputTokens,
      outputTokens: b.outputTokens,
      cacheCreationTokens: b.cacheCreationTokens,
      cacheReadTokens: b.cacheReadTokens,
      totalTokens: b.totalTokens,
      cost: b.cost,
      models: Array.from(b.models),
      modelBreakdowns: b.hasBreakdowns ? Array.from(b.modelMap.values()) : undefined,
    }));
}
