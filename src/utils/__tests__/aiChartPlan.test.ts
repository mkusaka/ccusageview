import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
  CHART_PLAN_SCHEMA,
  compileAiChartPlan,
  type ChartContext,
  type ChartPlan,
} from "../aiChartPlan";

const context: ChartContext = {
  availableTables: ["entries", "model_usage", "agent_usage", "agent_model_usage"],
  reportTypes: ["daily"],
  granularities: ["daily", "weekly", "monthly"],
};
const today = new Date(2024, 2, 1, 12);
const base: ChartPlan = {
  metric: "total_tokens",
  x: "period",
  series: "none",
  time: "all",
  granularity: "daily",
  chart: { type: "bar", title: "Tokens", stacked: false },
  reason: "",
};
function compile(changes: Partial<ChartPlan> = {}, metadata = context) {
  return compileAiChartPlan({ ...base, ...changes }, metadata, today);
}

describe("chart catalog plans", () => {
  it("accepts up to four ordered schema-valid choices, rejecting extras and invented fields", () => {
    expect(
      v
        .parse(CHART_PLAN_SCHEMA, { charts: [base, { ...base, metric: "cost" }] })
        .charts.map((p) => p.metric),
    ).toEqual(["total_tokens", "cost"]);
    expect(() => v.parse(CHART_PLAN_SCHEMA, { charts: [] })).toThrow();
    expect(() => v.parse(CHART_PLAN_SCHEMA, { charts: Array(5).fill(base) })).toThrow();
    expect(() =>
      v.parse(CHART_PLAN_SCHEMA, { charts: [{ ...base, sql: "SELECT * FROM entries" }] }),
    ).toThrow();
  });

  it("selects the finest available source breakdown, never doubling entry totals", () => {
    expect(compile({ x: "model", series: "agent" }).table).toBe("agent_model_usage");
    expect(compile({ x: "period", series: "agent" }).table).toBe("agent_usage");
    expect(compile({ x: "source", series: "none" }).table).toBe("entries");
    expect(() => compile({ x: "model", series: "model" })).toThrow(/different/);
    expect(() => compile({ x: "model" }, { ...context, availableTables: ["entries"] })).toThrow(
      /unavailable/,
    );
    expect(() =>
      compile({ metric: "unsupported", reason: "Average cost cannot be computed" }),
    ).toThrow(/Average cost/);
  });

  it("constrains chart type to suitable axes and selected granularity", () => {
    expect(() =>
      compile({ x: "model", chart: { type: "line", title: "Wrong", stacked: false } }),
    ).toThrow(/time axis/);
    expect(() => compile({ chart: { type: "doughnut", title: "Wrong", stacked: false } })).toThrow(
      /categorical/,
    );
    expect(() =>
      compile({
        x: "model",
        chart: { type: "doughnut", title: "Right", stacked: false },
        series: "agent",
      }),
    ).toThrow(/without a series/);
    expect(() =>
      compile(
        { granularity: "daily" },
        { ...context, granularities: ["weekly"], reportTypes: ["weekly"] },
      ),
    ).toThrow(/granularity/);
  });

  it("calculates named calendar scopes and inclusive explicit date ranges", () => {
    expect(compile({ time: "this_month" })).toMatchObject({
      start: "2024-03-01",
      end: "2024-03-01",
    });
    expect(compile({ time: "last_week" })).toMatchObject({
      start: "2024-02-19",
      end: "2024-02-25",
    });
    expect(compile({ time: "last_7_days" })).toMatchObject({
      start: "2024-02-24",
      end: "2024-03-01",
    });
    expect(compile({ start_date: "2024-02-29", end_date: "2024-03-01" })).toMatchObject({
      start: "2024-02-29",
      end: "2024-03-01",
    });
    expect(() => compile({ start_date: "2023-02-29" })).toThrow(/invalid/);
    expect(() => compile({ start_date: "2024-03-02", end_date: "2024-03-01" })).toThrow(
      /begins after/,
    );
    expect(() => compile({ time: "today", start_date: "2024-03-01" })).toThrow(/either/);
    expect(() =>
      compile(
        { time: "today" },
        { ...context, reportTypes: ["monthly"], granularities: ["monthly"] },
      ),
    ).toThrow(/granularity/);
    expect(() =>
      compile(
        { time: "today", granularity: "monthly" },
        { ...context, reportTypes: ["monthly"], granularities: ["monthly"] },
      ),
    ).toThrow(/Date filtering/);
  });
});
