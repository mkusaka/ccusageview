import type { ModelBreakdown } from "../types";
import { calculateCacheEfficiency } from "./cacheEfficiency";
import { ANALYSIS_AXIS_OPTIONS, type AnalysisAxisId } from "./dashboardCatalog";
import type { NormalizedEntry } from "./normalize";

export interface AxisAnalysisRow extends Record<string, unknown> {
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
  costPerMillion: number | null;
  cacheReadRate: number | null;
}

export interface AxisSource {
  label: string;
  entries: NormalizedEntry[];
}

type UsageRow = Pick<
  AxisAnalysisRow,
  "inputTokens" | "outputTokens" | "cacheCreationTokens" | "cacheReadTokens" | "cost"
>;
type GroupUsage = UsageRow & { totalTokens: number };

function addRow(
  groups: Map<string, GroupUsage>,
  label: string,
  usage: UsageRow,
  totalTokens: number,
) {
  const previous = groups.get(label);
  if (previous) {
    previous.inputTokens += usage.inputTokens;
    previous.outputTokens += usage.outputTokens;
    previous.cacheCreationTokens += usage.cacheCreationTokens;
    previous.cacheReadTokens += usage.cacheReadTokens;
    previous.cost += usage.cost;
    previous.totalTokens += totalTokens;
  } else {
    groups.set(label, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cost: usage.cost,
      totalTokens,
    });
  }
}

/** Aggregate the selected dimension first; ratios are calculated only from complete group totals. */
export function buildAxisAnalysisData(
  entries: readonly NormalizedEntry[],
  axis: AnalysisAxisId,
  sources: readonly AxisSource[] = [],
): AxisAnalysisRow[] {
  const dimension = ANALYSIS_AXIS_OPTIONS.find((option) => option.id === axis)?.dimension;
  const groups = new Map<string, GroupUsage>();

  if (dimension === "source") {
    for (const source of sources) {
      for (const entry of source.entries) addRow(groups, source.label, entry, entry.totalTokens);
    }
  } else if (dimension === "period") {
    for (const entry of entries) addRow(groups, entry.label, entry, entry.totalTokens);
  } else if (dimension === "model" || dimension === "agent") {
    for (const entry of entries) {
      // Agent rows already contain nested model details. Only the agent total belongs here.
      const breakdowns: readonly ModelBreakdown[] | undefined =
        dimension === "model" ? entry.modelBreakdowns : entry.agentBreakdowns;
      for (const breakdown of breakdowns ?? []) {
        addRow(
          groups,
          breakdown.modelName,
          breakdown,
          breakdown.inputTokens +
            breakdown.outputTokens +
            breakdown.cacheCreationTokens +
            breakdown.cacheReadTokens,
        );
      }
    }
  }

  const result = Array.from(groups, ([label, usage]) => ({
    label,
    ...usage,
    costPerMillion: usage.totalTokens === 0 ? null : (usage.cost / usage.totalTokens) * 1_000_000,
    cacheReadRate: calculateCacheEfficiency(usage).cacheReadRate,
  }));
  if (dimension === "period") result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}
