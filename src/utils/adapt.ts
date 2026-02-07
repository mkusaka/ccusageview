// Adapt non-standard ccusage formats (e.g., @ccusage/codex) to the canonical @ccusage/claude format.
// This runs BEFORE detectReportType() so that downstream code only sees the standard shape.

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// "Sep 16, 2025" → "2025-09-16"
function parseEnglishDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isCodexDaily(data: Obj): boolean {
  if (!Array.isArray(data.daily) || data.daily.length === 0) return false;
  const first = data.daily[0] as Obj;
  return "costUSD" in first && !("totalCost" in first);
}

function adaptCodexEntry(entry: Obj): Obj {
  const models = isObj(entry.models) ? (entry.models as Record<string, Obj>) : {};
  const modelsUsed = Object.keys(models);
  const modelBreakdowns = Object.entries(models).map(([name, m]) => ({
    modelName: name,
    inputTokens: (m.inputTokens as number) ?? 0,
    outputTokens: (m.outputTokens as number) ?? 0,
    cacheCreationTokens: 0,
    cacheReadTokens: (m.cachedInputTokens as number) ?? 0,
    cost: 0,
  }));

  return {
    date: parseEnglishDate(entry.date as string),
    inputTokens: entry.inputTokens ?? 0,
    outputTokens: entry.outputTokens ?? 0,
    cacheCreationTokens: 0,
    cacheReadTokens: (entry.cachedInputTokens as number) ?? 0,
    totalTokens: entry.totalTokens ?? 0,
    totalCost: (entry.costUSD as number) ?? 0,
    modelsUsed,
    modelBreakdowns,
  };
}

function adaptCodexTotals(totals: Obj): Obj {
  return {
    inputTokens: totals.inputTokens ?? 0,
    outputTokens: totals.outputTokens ?? 0,
    cacheCreationTokens: 0,
    cacheReadTokens: (totals.cachedInputTokens as number) ?? 0,
    totalTokens: totals.totalTokens ?? 0,
    totalCost: (totals.costUSD as number) ?? 0,
  };
}

/**
 * Detect and adapt non-standard ccusage formats to the canonical shape.
 * Currently handles: @ccusage/codex daily reports.
 * Non-codex data passes through unchanged.
 */
export function adaptReport(data: unknown): unknown {
  if (!isObj(data)) return data;
  if (!isCodexDaily(data)) return data;

  const daily = (data.daily as Obj[]).map(adaptCodexEntry);
  const totals = isObj(data.totals) ? adaptCodexTotals(data.totals as Obj) : data.totals;
  return { ...data, daily, totals };
}
