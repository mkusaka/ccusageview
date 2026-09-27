import * as duckdb from "@duckdb/duckdb-wasm";
import mvpWasm from "./generated-duckdb/duckdb-mvp.wasm.gz?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "./generated-duckdb/duckdb-eh.wasm.gz?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import type { ReportData } from "../types";
import { detectReportType } from "./detect";
import type { SourceInput } from "./inputs";
import { normalizeEntries } from "./normalize";
import type { ChartContext } from "./aiChartPlan";

export const AI_CHART_SCHEMA = `Available usage data (one report type per dashboard):
entries: one row per source and report item; period (date/hour), source_label, total usage metrics.
model_usage: one row per entry and model; model and its usage metrics.
agent_usage: one row per entry and agent; agent and its usage metrics.
agent_model_usage: one row per entry, agent, and model; both names and their usage metrics.
Metrics: input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost (USD).
Only suggest sums of these metrics by period, model, agent, or source. A breakdown table may be empty; do not suggest a missing breakdown or invent metrics.`;

const METRICS =
  "input_tokens DOUBLE, output_tokens DOUBLE, cache_creation_tokens DOUBLE, cache_read_tokens DOUBLE, total_tokens DOUBLE, cost DOUBLE";

function reportPeriods(report: ReportData): string[] {
  switch (report.type) {
    case "daily":
    case "weekly":
    case "monthly":
    case "hourly": {
      const entries =
        report.type === "daily"
          ? report.daily
          : report.type === "weekly"
            ? report.weekly
            : report.type === "monthly"
              ? report.monthly
              : report.hourly;
      return entries.map((entry) => ("period" in entry ? entry.period : entry.date));
    }
    case "session":
      return report.sessions
        .toSorted((a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime())
        .map((entry) => entry.lastActivity);
    case "blocks":
      return report.blocks.filter((entry) => !entry.isGap).map((entry) => entry.startTime);
  }
}

function usageMetrics(row: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens?: number;
  cost: number;
}) {
  const { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, cost } = row;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: cacheCreationTokens,
    cache_read_tokens: cacheReadTokens,
    total_tokens:
      row.totalTokens ?? inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    cost,
  };
}

export function buildAiChartRows(inputs: SourceInput[]) {
  const entries: Record<string, string | number>[] = [];
  const model_usage: Record<string, string | number>[] = [];
  const agent_usage: Record<string, string | number>[] = [];
  const agent_model_usage: Record<string, string | number>[] = [];
  let entryId = 0;

  for (const [sourceIndex, input] of inputs.entries()) {
    if (!input.enabled || !input.content.trim()) continue;
    const parsed: unknown = JSON.parse(input.content);
    for (const [reportIndex, item] of (Array.isArray(parsed) ? parsed : [parsed]).entries()) {
      const report = detectReportType(item);
      const periods = reportPeriods(report);
      for (const [index, entry] of normalizeEntries(report).entries()) {
        const entry_id = entryId++;
        entries.push({
          entry_id,
          source_id: `${input.id}:${reportIndex}`,
          source_label: input.label || `Source ${sourceIndex + 1}`,
          report_type: report.type,
          period: periods[index],
          label: entry.label,
          ...usageMetrics(entry),
        });
        for (const model of entry.modelBreakdowns ?? []) {
          model_usage.push({ entry_id, model: model.modelName, ...usageMetrics(model) });
        }
        for (const agent of entry.agentBreakdowns ?? []) {
          agent_usage.push({ entry_id, agent: agent.modelName, ...usageMetrics(agent) });
          for (const model of agent.modelBreakdowns ?? []) {
            agent_model_usage.push({
              entry_id,
              agent: agent.modelName,
              model: model.modelName,
              ...usageMetrics(model),
            });
          }
        }
      }
    }
  }
  return { entries, model_usage, agent_usage, agent_model_usage };
}

export interface AiChartDatabase {
  query(sql: string): Promise<Record<string, unknown>[]>;
  readonly chartContext: ChartContext;
  close(): Promise<void>;
}

export function prepareAiChartSql(sql: string): string {
  const trimmed = sql.trim();
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    throw new Error("SQL must start with SELECT or WITH.");
  }
  const statement = trimmed.endsWith(";") ? trimmed.slice(0, -1).trimEnd() : trimmed;
  if (statement.includes(";")) {
    throw new Error("Only one SQL statement is allowed.");
  }
  return statement;
}

async function loadWasmBlobUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Unable to load DuckDB Wasm: ${response.status} ${response.statusText}`);
  }
  // Fetch transparently decodes Content-Encoding; Vite preview serves .gz files this way.
  const stream =
    response.headers.get("Content-Encoding") === "gzip"
      ? response.body
      : response.body.pipeThrough(new DecompressionStream("gzip"));
  const blob = await new Response(stream, {
    headers: { "Content-Type": "application/wasm" },
  }).blob();
  return URL.createObjectURL(blob);
}

export async function createAiChartDatabase(inputs: SourceInput[]): Promise<AiChartDatabase> {
  const bundles: duckdb.DuckDBBundles = {
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  };
  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    const wasmUrl = await loadWasmBlobUrl(bundle.mainModule);
    try {
      await db.instantiate(wasmUrl, bundle.pthreadWorker);
    } finally {
      URL.revokeObjectURL(wasmUrl);
    }
    const conn = await db.connect();
    const tables = buildAiChartRows(inputs);
    const chartContext: ChartContext = {
      availableTables: (
        ["entries", "model_usage", "agent_usage", "agent_model_usage"] as const
      ).filter((name) => tables[name].length > 0),
      reportTypes: [...new Set(tables.entries.map((row) => String(row.report_type)))],
    };
    await conn.query(
      `CREATE TABLE entries (entry_id INTEGER, source_id VARCHAR, source_label VARCHAR, report_type VARCHAR, period VARCHAR, label VARCHAR, ${METRICS})`,
    );
    for (const name of ["model_usage", "agent_usage", "agent_model_usage"] as const) {
      const dimensions =
        name === "model_usage"
          ? "model VARCHAR"
          : name === "agent_usage"
            ? "agent VARCHAR"
            : "agent VARCHAR, model VARCHAR";
      await conn.query(`CREATE TABLE ${name} (entry_id INTEGER, ${dimensions}, ${METRICS})`);
    }
    for (const name of ["entries", "model_usage", "agent_usage", "agent_model_usage"] as const) {
      if (!tables[name].length) continue;
      const path = `${name}.json`;
      await db.registerFileText(path, JSON.stringify(tables[name]));
      await conn.query(`INSERT INTO ${name} BY NAME SELECT * FROM read_json_auto('${path}')`);
      await db.dropFile(path);
    }
    await conn.query("SET enable_external_access = false");
    return {
      chartContext,
      async query(sql: string) {
        const statement = prepareAiChartSql(sql);
        const result = await conn.query(`SELECT * FROM (${statement}) AS chart_result LIMIT 501`);
        if (result.numRows > 500)
          throw new Error("Query returned more than 500 rows. Aggregate or filter the result.");
        return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
      },
      async close() {
        await conn.close();
        await db.terminate();
      },
    };
  } catch (error) {
    await db.terminate();
    throw error;
  }
}
