import type { ModelBreakdown, ReportData, ReportType } from "../types";
import { groupEntries, sumEntries } from "./aggregate";

// Unified entry format for chart components
export interface NormalizedEntry {
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
  models: string[];
  modelBreakdowns?: ModelBreakdown[];
}

export interface NormalizedTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

// Convert any report type to a uniform array of entries
export function normalizeEntries(report: ReportData): NormalizedEntry[] {
  switch (report.type) {
    case "daily":
      return report.daily.map((e) => ({
        label: e.date ?? "",
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cacheCreationTokens: e.cacheCreationTokens,
        cacheReadTokens: e.cacheReadTokens,
        totalTokens: e.totalTokens,
        cost: e.totalCost,
        models: e.modelsUsed,
        modelBreakdowns: e.modelBreakdowns,
      }));

    case "weekly":
      return report.weekly.map((e) => ({
        label: e.week ?? "",
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cacheCreationTokens: e.cacheCreationTokens,
        cacheReadTokens: e.cacheReadTokens,
        totalTokens: e.totalTokens,
        cost: e.totalCost,
        models: e.modelsUsed,
        modelBreakdowns: e.modelBreakdowns,
      }));

    case "monthly":
      return report.monthly.map((e) => ({
        label: e.month ?? "",
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cacheCreationTokens: e.cacheCreationTokens,
        cacheReadTokens: e.cacheReadTokens,
        totalTokens: e.totalTokens,
        cost: e.totalCost,
        models: e.modelsUsed,
        modelBreakdowns: e.modelBreakdowns,
      }));

    case "session":
      return report.sessions
        .toSorted((a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime())
        .map((e) => {
          const project = e.projectPath !== "Unknown Project" ? e.projectPath : "";
          const shortId = e.sessionId.slice(-20);
          return {
            label: project || shortId,
            inputTokens: e.inputTokens,
            outputTokens: e.outputTokens,
            cacheCreationTokens: e.cacheCreationTokens,
            cacheReadTokens: e.cacheReadTokens,
            totalTokens: e.totalTokens,
            cost: e.totalCost,
            models: e.modelsUsed,
            modelBreakdowns: e.modelBreakdowns,
          };
        });

    case "blocks":
      return report.blocks
        .filter((e) => !e.isGap)
        .map((e) => ({
          label: new Date(e.startTime).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          inputTokens: e.tokenCounts.inputTokens,
          outputTokens: e.tokenCounts.outputTokens,
          cacheCreationTokens: e.tokenCounts.cacheCreationInputTokens,
          cacheReadTokens: e.tokenCounts.cacheReadInputTokens,
          totalTokens: e.totalTokens,
          cost: e.costUSD,
          models: e.models,
        }));
  }
}

// Aggregate daily entries into monthly entries (frontend computation)
export function aggregateToMonthly(dailyEntries: NormalizedEntry[]): NormalizedEntry[] {
  return groupEntries(dailyEntries, (e) => {
    const month = e.label.slice(0, 7);
    return /^\d{4}-\d{2}$/.test(month) ? month : null;
  });
}

// Extract totals from any report type
export function normalizeTotals(report: ReportData): NormalizedTotals {
  if (report.type === "blocks") {
    // Blocks totals may have different structure, compute from entries
    const entries = report.blocks.filter((e) => !e.isGap);
    return {
      inputTokens: entries.reduce((s, e) => s + e.tokenCounts.inputTokens, 0),
      outputTokens: entries.reduce((s, e) => s + e.tokenCounts.outputTokens, 0),
      cacheCreationTokens: entries.reduce((s, e) => s + e.tokenCounts.cacheCreationInputTokens, 0),
      cacheReadTokens: entries.reduce((s, e) => s + e.tokenCounts.cacheReadInputTokens, 0),
      totalTokens: entries.reduce((s, e) => s + e.totalTokens, 0),
      totalCost: entries.reduce((s, e) => s + e.costUSD, 0),
    };
  }

  const t = report.totals;
  return {
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    cacheCreationTokens: t.cacheCreationTokens,
    cacheReadTokens: t.cacheReadTokens,
    totalTokens: t.totalTokens,
    totalCost: t.totalCost,
  };
}

// Compute totals from an array of NormalizedEntry (for merged data)
export function computeTotalsFromEntries(entries: NormalizedEntry[]): NormalizedTotals {
  return sumEntries(entries);
}

export interface DashboardData {
  entries: NormalizedEntry[];
  totals: NormalizedTotals;
  reportType: ReportType;
  sourceLabels: string[];
}
