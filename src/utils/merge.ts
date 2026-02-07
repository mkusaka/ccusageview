import type { NormalizedEntry } from "./normalize";
import { groupEntries } from "./aggregate";

/**
 * Merge multiple arrays of NormalizedEntry into one.
 * Entries with the same label are combined (numeric fields summed,
 * models unioned, modelBreakdowns merged by modelName).
 */
export function mergeNormalizedEntries(entriesArrays: NormalizedEntry[][]): NormalizedEntry[] {
  if (entriesArrays.length === 0) return [];
  if (entriesArrays.length === 1) return entriesArrays[0];
  return groupEntries(entriesArrays.flat(), (e) => e.label);
}
