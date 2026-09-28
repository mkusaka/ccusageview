import { expect, it, vi } from "vitest";
import type { DailyReport } from "../../types";
import { buildAiChartData } from "../aiChartData";
import { generateAiCharts, suggestAiChartPrompts, type PromptSession } from "../aiChartGeneration";
import type { ChartPlan } from "../aiChartPlan";
import { DAILY_REPORT, HOURLY_REPORT, MONTHLY_REPORT } from "./fixtures";

function source(id: string, report: unknown, label = "Shared") {
  return { id, label, content: JSON.stringify(report), enabled: true };
}
function plan(changes: Partial<ChartPlan> = {}): ChartPlan {
  return {
    metric: "cost",
    x: "period",
    series: "none",
    time: "all",
    granularity: "daily",
    chart: { type: "line", title: "Cost", stacked: false },
    reason: "",
    ...changes,
  };
}
function sessionFor(...responses: string[]): PromptSession {
  return {
    prompt: vi.fn().mockImplementation(async () => responses.shift() ?? ""),
    destroy: vi.fn(),
  };
}
function sessionWith(...charts: ChartPlan[]) {
  return sessionFor(JSON.stringify({ charts }));
}

it("sums source-aware rows without double counting breakdowns and keeps requested chart order", async () => {
  const data = buildAiChartData([source("a", DAILY_REPORT), source("b", DAILY_REPORT)]);
  const charts = await generateAiCharts(
    sessionWith(
      plan({ x: "source", chart: { type: "doughnut", title: "Sources", stacked: false } }),
      plan({
        granularity: "weekly",
        series: "source",
        chart: { type: "bar", title: "Weekly cost", stacked: true },
      }),
    ),
    "Show sources then weekly costs",
    data,
  );
  expect(charts.map((chart) => chart.title)).toEqual(["Sources", "Weekly cost"]);
  expect(charts[0]).toMatchObject({
    type: "doughnut",
    labels: ["Shared (a:0)", "Shared (b:0)"],
    datasets: [{ values: [5.2, 5.2] }],
  });
  expect(charts[1].labels).toEqual(["2025-06-30", "2025-07-28"]);
  expect(charts[1].datasets).toEqual([
    { label: "Shared (a:0)", values: [4.3, 0.9] },
    { label: "Shared (b:0)", values: [4.3, 0.9] },
  ]);
});

it("groups hourly and daily data by month and filters dates before grouping", async () => {
  const hourly = buildAiChartData([source("h", HOURLY_REPORT)]);
  const daily = buildAiChartData([source("d", DAILY_REPORT)]);
  const dailyChart = await generateAiCharts(
    sessionWith(plan({ granularity: "monthly", start_date: "2025-07-02", end_date: "2025-08-01" })),
    "Monthly cost since July 2",
    daily,
  );
  expect(dailyChart[0].labels).toEqual(["2025-07", "2025-08"]);
  expect(dailyChart[0].datasets[0].values).toEqual([1.5, 0.9]);
  const hourlyChart = await generateAiCharts(
    sessionWith(plan({ granularity: "daily" })),
    "Daily hourly usage",
    hourly,
  );
  expect(hourlyChart[0].labels[0]).toBe("2026-08-12");
  expect(hourlyChart[0].datasets[0].values[0]).toBeCloseTo(
    HOURLY_REPORT.hourly
      .filter((row) => "period" in row && row.period.startsWith("2026-08-12"))
      .reduce((sum, row) => sum + ("totalCost" in row ? row.totalCost : row.costUSD), 0),
  );
});

it("preserves agent-model grain and missing series as null rather than invented zero", async () => {
  const entries: DailyReport = {
    ...DAILY_REPORT,
    daily: [
      {
        ...DAILY_REPORT.daily[0],
        agents: [
          {
            agent: "worker",
            inputTokens: 10,
            outputTokens: 2,
            cacheCreationTokens: 0,
            cacheReadTokens: 3,
            totalTokens: 15,
            totalCost: 0.4,
            modelsUsed: ["sonnet"],
            modelBreakdowns: [
              {
                modelName: "sonnet",
                inputTokens: 10,
                outputTokens: 2,
                cacheCreationTokens: 0,
                cacheReadTokens: 3,
                cost: 0.4,
              },
            ],
          },
        ],
      },
      {
        ...DAILY_REPORT.daily[1],
        agents: [
          {
            agent: "reviewer",
            inputTokens: 2,
            outputTokens: 1,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 3,
            totalCost: 0.1,
            modelsUsed: ["haiku"],
            modelBreakdowns: [
              {
                modelName: "haiku",
                inputTokens: 2,
                outputTokens: 1,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                cost: 0.1,
              },
            ],
          },
        ],
      },
    ],
  };
  const chart = (
    await generateAiCharts(
      sessionWith(
        plan({
          x: "agent",
          series: "model",
          metric: "total_tokens",
          chart: { type: "bar", title: "Agents", stacked: true },
        }),
      ),
      "Agents by model",
      buildAiChartData([source("a", entries)]),
    )
  )[0];
  expect(chart.labels).toEqual(["reviewer", "worker"]);
  expect(chart.datasets).toEqual([
    { label: "haiku", values: [3, null] },
    { label: "sonnet", values: [null, 15] },
  ]);
});

it("rejects unsupported intent, unavailable breakdowns and invalid axis choices", async () => {
  const data = buildAiChartData([source("m", MONTHLY_REPORT)]);
  await expect(
    generateAiCharts(
      sessionWith(plan({ metric: "unsupported", reason: "Averages are unavailable" })),
      "Average cost",
      data,
    ),
  ).rejects.toThrow(/Averages are unavailable/);
  await expect(
    generateAiCharts(
      sessionWith(
        plan({
          x: "agent",
          granularity: "monthly",
          chart: { type: "bar", title: "Agents", stacked: false },
        }),
      ),
      "By agent",
      data,
    ),
  ).rejects.toThrow(/breakdown is unavailable/);
  await expect(
    generateAiCharts(
      sessionWith(
        plan({
          granularity: "monthly",
          chart: { type: "doughnut", title: "Wrong", stacked: false },
        }),
      ),
      "By date",
      data,
    ),
  ).rejects.toThrow(/categorical/);
});

it("rejects ranges with no matching data and explains coverage", async () => {
  const data = buildAiChartData([source("a", DAILY_REPORT)]);
  await expect(
    generateAiCharts(
      sessionWith(plan({ start_date: "2024-01-01", end_date: "2024-01-31" })),
      "January 2024",
      data,
    ),
  ).rejects.toThrow(/Available dates: 2025-07-01 to 2025-08-01/);
});

it("repairs invalid model JSON but never executes code or accepts extra schema keys", async () => {
  const data = buildAiChartData([source("a", DAILY_REPORT)]);
  const retry = vi.fn();
  const session = sessionFor(
    "not JSON",
    JSON.stringify({ charts: [{ ...plan(), sql: "DROP TABLE entries" }] }),
    JSON.stringify({ charts: [plan()] }),
  );
  const charts = await generateAiCharts(session, "Costs", data, { onRetry: retry });
  expect(charts[0].labels).toEqual(["2025-07-01", "2025-07-02", "2025-08-01"]);
  expect(retry).toHaveBeenCalledTimes(2);
});

it("stops on repeated invalid output and after two empty model sessions", async () => {
  const data = buildAiChartData([source("a", DAILY_REPORT)]);
  await expect(generateAiCharts(sessionFor("{}", "{}"), "Cost", data)).rejects.toThrow(
    /repeated an invalid chart plan/,
  );
  await expect(
    generateAiCharts(sessionFor(""), "Cost", data, { restartSession: async () => sessionFor("") }),
  ).rejects.toThrow(/empty response in two sessions/);
});

it("suggests available granularities and multiple chart types without echoing requests", async () => {
  const context = buildAiChartData([source("a", DAILY_REPORT)]).context;
  const session = sessionFor(
    JSON.stringify({
      suggestions: ["Show weekly costs", "Show weekly costs", "Show costs by model", "Show costs"],
    }),
  );
  await expect(suggestAiChartPrompts(session, "Show costs", context)).resolves.toEqual([
    "Show weekly costs",
    "Show costs by model",
  ]);
  expect(vi.mocked(session.prompt).mock.calls[0][0]).toContain("daily, weekly, monthly");
});
