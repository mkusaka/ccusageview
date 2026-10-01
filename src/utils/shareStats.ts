import type { ReportType } from "../types";
import { aggregateBreakdowns, sumEntries } from "./aggregate";
import { getEntryBreakdowns, OTHER_BREAKDOWN_KEY } from "./breakdown";
import type { NormalizedEntry } from "./normalize";

export function computeShareStats(entries: NormalizedEntry[], reportType: ReportType) {
  const totals = sumEntries(entries);
  const mode = entries.some((entry) => entry.agentBreakdowns?.length) ? "agent" : "provider";
  const costs = aggregateBreakdowns(entries, mode).map(({ key, label, cost }) => ({
    key,
    label,
    cost,
  }));
  let otherCost = 0;
  for (const entry of entries) {
    if (!getEntryBreakdowns(entry, mode)?.length) otherCost += entry.cost;
  }
  if (otherCost !== 0)
    costs.push({ key: OTHER_BREAKDOWN_KEY, label: OTHER_BREAKDOWN_KEY, cost: otherCost });
  costs.sort((a, b) => b.cost - a.cost);
  const breakdownTotal = costs.reduce((sum, row) => sum + row.cost, 0);
  const daily = reportType === "daily" || reportType === "hourly";
  const days = new Set<string>();
  let first = "";
  let last = "";
  for (const entry of entries) {
    const label = daily ? entry.label.slice(0, 10) : entry.label;
    if (!first || label < first) first = label;
    if (!last || label > last) last = label;
    if (daily && (entry.totalTokens > 0 || entry.cost > 0)) days.add(label);
  }
  const calendarDays =
    daily && first && last
      ? Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1
      : null;
  const count = calendarDays ?? entries.length;
  return {
    totals,
    costs,
    mode,
    breakdownTotal,
    first,
    last,
    activeDays: daily ? days.size : null,
    calendarDays,
    entryCount: entries.length,
    averageCost: count > 0 ? totals.totalCost / count : 0,
  };
}
