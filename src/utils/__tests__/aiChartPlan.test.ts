import { createRequire } from "node:module";
import * as duckdb from "@duckdb/duckdb-wasm/blocking";
import * as v from "valibot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHART_PLAN_SCHEMA,
  compileAiChartPlan,
  type ChartContext,
  type ChartPlan,
} from "../aiChartPlan";

const require = createRequire(import.meta.url);
const context: ChartContext = {
  availableTables: ["entries", "model_usage", "agent_usage", "agent_model_usage"],
  reportTypes: ["daily"],
};
const today = new Date(2024, 2, 1, 12);
const basePlan: ChartPlan = {
  metric: "total_tokens",
  x: "period",
  series: "none",
  time: "all",
  chart: { type: "bar", title: "Token usage", stacked: false },
  reason: "",
};

let connection: duckdb.DuckDBConnection;

function results(changes: Partial<ChartPlan> = {}, metadata: ChartContext = context) {
  const { sql, chart } = compileAiChartPlan({ ...basePlan, ...changes }, metadata, today);
  return {
    chart,
    rows: connection
      .query(sql)
      .toArray()
      .map((row) => row.toJSON() as Record<string, unknown>),
  };
}

beforeAll(async () => {
  const database = await duckdb.createDuckDB(
    {
      mvp: {
        mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
        mainWorker: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node-mvp.worker.cjs"),
      },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await database.instantiate();
  database.open({ path: ":memory:" });
  connection = database.connect();
  connection.query(`CREATE TABLE entries (
    entry_id INTEGER, source_id VARCHAR, source_label VARCHAR, period VARCHAR,
    total_tokens DOUBLE, cost DOUBLE
  )`);
  connection.query(`INSERT INTO entries VALUES
    (1, 'a', 'Shared', '2024-02-01T09:00:00Z', 100, 2),
    (2, 'b', 'Shared', '2024-02-29T09:00:00Z', 30, 0.6),
    (3, 'a', 'Shared', '2024-03-01T09:00:00Z', 7, 0.14),
    (4, 'a', 'Shared', '2024-03-02T09:00:00Z', 200, 4)`);
  connection.query(`CREATE TABLE model_usage (
    entry_id INTEGER, model VARCHAR, total_tokens DOUBLE, cost DOUBLE
  )`);
  connection.query(`INSERT INTO model_usage VALUES
    (1, 'sonnet', 60, 1.2), (1, 'haiku', 40, 0.8),
    (2, 'sonnet', 30, 0.6), (3, 'haiku', 7, 0.14), (4, 'sonnet', 200, 4)`);
  connection.query(`CREATE TABLE agent_usage (
    entry_id INTEGER, agent VARCHAR, total_tokens DOUBLE, cost DOUBLE
  )`);
  connection.query(`INSERT INTO agent_usage VALUES
    (1, 'worker', 70, 1.4), (1, 'reviewer', 30, 0.6),
    (2, 'worker', 30, 0.6), (3, 'worker', 7, 0.14), (4, 'worker', 200, 4)`);
  connection.query(`CREATE TABLE agent_model_usage (
    entry_id INTEGER, agent VARCHAR, model VARCHAR, total_tokens DOUBLE, cost DOUBLE
  )`);
  connection.query(`INSERT INTO agent_model_usage VALUES
    (1, 'worker', 'sonnet', 50, 1), (1, 'worker', 'haiku', 20, 0.4),
    (1, 'reviewer', 'sonnet', 10, 0.2), (1, 'reviewer', 'haiku', 20, 0.4),
    (2, 'worker', 'sonnet', 30, 0.6), (3, 'worker', 'haiku', 7, 0.14),
    (4, 'worker', 'sonnet', 200, 4)`);
});

afterAll(() => connection?.close());

describe("compileAiChartPlan", () => {
  it("sums entry totals once and model metrics at their own grain", () => {
    expect(results({ x: "source" }).rows).toEqual([
      { x: "Shared (a)", y: 307 },
      { x: "Shared (b)", y: 30 },
    ]);
    expect(results({ x: "model" }).rows).toEqual([
      { x: "haiku", y: 47 },
      { x: "sonnet", y: 290 },
    ]);
    expect(results({ x: "agent" }).rows).toEqual([
      { x: "reviewer", y: 30 },
      { x: "worker", y: 307 },
    ]);
  });

  it("groups paired model and agent metrics without multiplying independent breakdowns", () => {
    const { chart, rows } = results({
      x: "model",
      series: "agent",
      chart: { type: "bar", title: "By model and agent", stacked: true },
    });
    expect(chart).toEqual({
      type: "bar",
      title: "By model and agent",
      x: "x",
      y: "y",
      series: "series",
      stacked: true,
    });
    expect(rows).toEqual([
      { x: "haiku", y: 20, series: "reviewer" },
      { x: "haiku", y: 27, series: "worker" },
      { x: "sonnet", y: 10, series: "reviewer" },
      { x: "sonnet", y: 280, series: "worker" },
    ]);
  });

  it("keeps same-named sources distinct when splitting a period into series", () => {
    expect(results({ x: "period", series: "source", time: "last_30_days" }).rows).toEqual([
      { x: "2024-02-01T09:00:00Z", y: 100, series: "Shared (a)" },
      { x: "2024-02-29T09:00:00Z", y: 30, series: "Shared (b)" },
      { x: "2024-03-01T09:00:00Z", y: 7, series: "Shared (a)" },
    ]);
  });

  it("uses inclusive local calendar days across leap-month boundaries and excludes future entries", () => {
    expect(results({ x: "source", time: "today" }).rows).toEqual([{ x: "Shared (a)", y: 7 }]);
    expect(results({ x: "source", time: "through_today" }).rows).toEqual([
      { x: "Shared (a)", y: 107 },
      { x: "Shared (b)", y: 30 },
    ]);
    expect(results({ x: "source", time: "last_7_days" }).rows).toEqual([
      { x: "Shared (a)", y: 7 },
      { x: "Shared (b)", y: 30 },
    ]);
    expect(results({ x: "source", time: "last_30_days" }).rows).toEqual([
      { x: "Shared (a)", y: 107 },
      { x: "Shared (b)", y: 30 },
    ]);
    expect(() =>
      results({ time: "today" }, { ...context, reportTypes: ["daily", "monthly"] }),
    ).toThrow(/weekly or monthly/);
    expect(() => results({ time: "last_7_days" }, { ...context, reportTypes: ["weekly"] })).toThrow(
      /weekly or monthly/,
    );
  });

  it("reports only breakdown dates when today's entry has no model breakdown", () => {
    connection.query(
      "INSERT INTO entries VALUES (5, 'a', 'Shared', '2024-03-03T09:00:00Z', 25, 0.5)",
    );
    try {
      const date = new Date(2024, 2, 3, 12);
      const spec = compileAiChartPlan(
        { ...basePlan, series: "model", time: "today" },
        context,
        date,
      );
      expect(connection.query(spec.sql).toArray()).toHaveLength(0);
      expect(
        connection
          .query(
            `SELECT MIN(substr(e.period, 1, 10)) AS first, MAX(substr(e.period, 1, 10)) AS last FROM ${spec.from}`,
          )
          .toArray()[0]
          ?.toJSON(),
      ).toEqual({ first: "2024-02-01", last: "2024-03-02" });
      const entrySql = compileAiChartPlan({ ...basePlan, time: "today" }, context, date).sql;
      expect(
        connection
          .query(entrySql)
          .toArray()
          .map((row) => row.toJSON()),
      ).toEqual([{ x: "2024-03-03T09:00:00Z", y: 25 }]);
    } finally {
      connection.query("DELETE FROM entries WHERE entry_id = 5");
    }
  });

  it("rejects missing data, unavailable breakdowns, and duplicate dimensions rather than choosing other analysis", () => {
    expect(() => results({}, { availableTables: [], reportTypes: [] })).toThrow(/No chart data/);
    expect(() =>
      results({ x: "model" }, { availableTables: ["entries"], reportTypes: ["daily"] }),
    ).toThrow(/model.*unavailable/);
    expect(() =>
      results(
        { x: "model", series: "agent" },
        { availableTables: ["entries", "model_usage", "agent_usage"], reportTypes: ["daily"] },
      ),
    ).toThrow(/model and agent.*unavailable/);
    expect(() => results({ x: "agent", series: "agent" })).toThrow(/different/);
  });

  it("rejects unsupported requests with the model's explanation", () => {
    expect(() =>
      results({
        metric: "unsupported",
        reason: "Percentiles cannot be computed from these aggregated reports.",
      }),
    ).toThrow("Percentiles cannot be computed from these aggregated reports.");
    expect(() => results({ metric: "unsupported", reason: "" })).toThrow(/not supported/);
  });

  it("keeps chart titles and explanations out of generated SQL", () => {
    const hostile = "foo'); DROP TABLE entries; --";
    const compiled = compileAiChartPlan(
      { ...basePlan, chart: { ...basePlan.chart, title: hostile }, reason: hostile, x: "model" },
      context,
      today,
    );
    expect(compiled.chart.title).toBe(hostile);
    expect(compiled.sql).not.toContain(hostile);
    expect(
      connection
        .query(compiled.sql)
        .toArray()
        .map((row) => row.toJSON().y),
    ).toEqual([47, 290]);
    expect(
      connection.query("SELECT COUNT(*) AS count FROM entries").toArray()[0]?.toJSON().count,
    ).toBe(4n);
  });

  it("rejects SQL text, invalid metrics, and blank chart titles", () => {
    expect(() =>
      v.parse(CHART_PLAN_SCHEMA, { ...basePlan, sql: "SELECT * FROM entries" }),
    ).toThrow();
    expect(() =>
      v.parse(CHART_PLAN_SCHEMA, { ...basePlan, metric: "SELECT * FROM entries" }),
    ).toThrow();
    expect(() =>
      v.parse(CHART_PLAN_SCHEMA, { ...basePlan, chart: { ...basePlan.chart, title: " " } }),
    ).toThrow();
  });
});
