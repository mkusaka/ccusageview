import type { ReportData } from "../types";
import { detectReportType } from "./detect";
import type { SourceInput } from "./inputs";
import { normalizeEntries } from "./normalize";
import type { ChartContext } from "./aiChartPlan";

export const AI_CHART_SCHEMA = `Available usage data: entries (totals per source and report item), model_usage (model per item), agent_usage (agent per item), agent_model_usage (model within agent per item). Metrics: input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost (USD). Dimensions: period, model, agent, source. Breakdown rows only exist when the input report provides them. Periods can be grouped daily, weekly (Monday start), or monthly when supported by the report's original resolution.`;

export interface UsageRow {
  entry_id: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
}

export interface EntryRow extends UsageRow {
  source_id: string;
  source_label: string;
  report_type: ReportData["type"];
  period: string;
}

export interface BreakdownRow extends UsageRow {
  model?: string;
  agent?: string;
}

export interface AiChartData {
  context: ChartContext;
  rows: {
    entries: EntryRow[];
    model_usage: BreakdownRow[];
    agent_usage: BreakdownRow[];
    agent_model_usage: BreakdownRow[];
  };
}

function reportPeriods(report: ReportData): string[] {
  switch (report.type) {
    case "daily":
      return report.daily.map((entry) => ("period" in entry ? entry.period : entry.date));
    case "weekly":
      return report.weekly.map((entry) => ("period" in entry ? entry.period : entry.date));
    case "monthly":
      return report.monthly.map((entry) => ("period" in entry ? entry.period : entry.date));
    case "hourly":
      return report.hourly.map((entry) => ("period" in entry ? entry.period : entry.date));
    case "session":
      return report.sessions
        .toSorted((a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime())
        .map((entry) => entry.lastActivity);
    case "blocks":
      return report.blocks.filter((entry) => !entry.isGap).map((entry) => entry.startTime);
  }
}

function metrics(row: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens?: number;
  cost: number;
}) {
  return {
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    cache_creation_tokens: row.cacheCreationTokens,
    cache_read_tokens: row.cacheReadTokens,
    total_tokens:
      row.totalTokens ??
      row.inputTokens + row.outputTokens + row.cacheCreationTokens + row.cacheReadTokens,
    cost: row.cost,
  };
}

export function buildAiChartData(inputs: SourceInput[]): AiChartData {
  const rows: AiChartData["rows"] = {
    entries: [],
    model_usage: [],
    agent_usage: [],
    agent_model_usage: [],
  };
  let entryId = 0;
  for (const [sourceIndex, input] of inputs.entries()) {
    if (!input.enabled || !input.content.trim()) continue;
    const parsed: unknown = JSON.parse(input.content);
    for (const [reportIndex, item] of (Array.isArray(parsed) ? parsed : [parsed]).entries()) {
      const report = detectReportType(item);
      const periods = reportPeriods(report);
      for (const [index, entry] of normalizeEntries(report).entries()) {
        const entry_id = entryId++;
        rows.entries.push({
          entry_id,
          source_id: `${input.id}:${reportIndex}`,
          source_label: input.label || `Source ${sourceIndex + 1}`,
          report_type: report.type,
          period: periods[index],
          ...metrics(entry),
        });
        for (const model of entry.modelBreakdowns ?? []) {
          rows.model_usage.push({ entry_id, model: model.modelName, ...metrics(model) });
        }
        for (const agent of entry.agentBreakdowns ?? []) {
          rows.agent_usage.push({ entry_id, agent: agent.modelName, ...metrics(agent) });
          for (const model of agent.modelBreakdowns ?? []) {
            rows.agent_model_usage.push({
              entry_id,
              agent: agent.modelName,
              model: model.modelName,
              ...metrics(model),
            });
          }
        }
      }
    }
  }
  const reportTypes = [...new Set(rows.entries.map((row) => row.report_type))];
  const granularities: ChartContext["granularities"] = reportTypes.includes("monthly")
    ? ["monthly"]
    : reportTypes.includes("weekly")
      ? ["weekly"]
      : ["daily", "weekly", "monthly"];
  return {
    rows,
    context: {
      availableTables: (Object.keys(rows) as (keyof typeof rows)[]).filter(
        (table) => rows[table].length > 0,
      ),
      reportTypes,
      granularities,
    },
  };
}
