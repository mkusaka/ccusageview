import * as duckdb from "@duckdb/duckdb-wasm";
import mvpWasm from "./generated-duckdb/duckdb-mvp.wasm.gz?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "./generated-duckdb/duckdb-eh.wasm.gz?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import type { ReportData } from "../types";
import { detectReportType } from "./detect";
import type { SourceInput } from "./inputs";
import { normalizeEntries } from "./normalize";

export const AI_CHART_SCHEMA = `Available tables (one report type per dashboard; these are column names, not SQL SELECT expressions):
entries(entry_id, source_id, source_label, report_type, period, label, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost)
model_usage(entry_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost)
agent_usage(entry_id, agent, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost)
agent_model_usage(entry_id, agent, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost)
IDs are integers; names, dates and labels are text; token counts and cost are numeric. In SELECT, reference columns or aggregate them; never append type declarations.
Join breakdowns to entries via entry_id. entries has one row per source and report item; source_id distinguishes inputs, source_label is the user label. period is the original ISO-like date/hour (or session lastActivity / block startTime); label is display text. cost is USD. Each breakdown table has its own grain: entry x model, entry x agent, or entry x agent x model. A missing breakdown means unknown, not zero. Do not sum entries metrics after joining to a breakdown, or join two independent breakdown tables before aggregating: that duplicates totals. Use the breakdown table's metrics for breakdown charts. Some reports (notably blocks) have no per-model or per-agent metrics. Do not invent them.
Return SQL with named result columns matching the chart fields: x (date or category), y (numeric), and optionally series (category). Sort x in SQL. Return at most 500 rows.`;

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
  close(): Promise<void>;
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
      async query(sql: string) {
        if (!/^\s*(SELECT|WITH)\b/i.test(sql) || sql.includes(";")) {
          throw new Error("Only a single SELECT query is allowed.");
        }
        const result = await conn.query(`SELECT * FROM (${sql}) AS chart_result LIMIT 501`);
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
