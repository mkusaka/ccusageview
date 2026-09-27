import { expect, it, vi } from "vitest";
import { generateAiChart, suggestAiChartPrompts, type PromptSession } from "../aiChartGeneration";
import type { ChartContext, ChartPlan } from "../aiChartPlan";

const context: ChartContext = {
  availableTables: ["entries", "model_usage", "agent_usage", "agent_model_usage"],
  reportTypes: ["daily"],
};

function plan(overrides: Partial<ChartPlan> = {}): ChartPlan {
  return {
    metric: "cost",
    x: "period",
    series: "model",
    time: "all",
    chart: { type: "line", title: "Cost by model", stacked: false },
    reason: "",
    ...overrides,
  };
}

function sessionFor(...responses: string[]): PromptSession {
  return {
    async prompt() {
      return responses.shift() ?? "";
    },
    destroy() {},
  };
}

it("charts compiled model totals and keeps absent series points empty", async () => {
  const query = vi.fn(async () => [
    { x: "2026-09-25", y: 3, series: "opus" },
    { x: "2026-09-25", y: 5, series: "sonnet" },
    { x: "2026-09-26", y: 7, series: "sonnet" },
  ]);
  const chart = await generateAiChart(
    sessionFor(JSON.stringify(plan())),
    "daily cost by model",
    query,
    context,
  );
  expect(chart.labels).toEqual(["2026-09-25", "2026-09-26"]);
  expect(chart.datasets).toEqual([
    { label: "opus", values: [3, null] },
    { label: "sonnet", values: [5, 7] },
  ]);
});

it("explains an empty today model chart with the model breakdown's available dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2024, 2, 1, 12));
  try {
    const query = vi.fn(async (sql: string) =>
      sql.includes(" AS first") ? [{ first: "2024-02-01", last: "2024-02-29" }] : [],
    );
    await expect(
      generateAiChart(
        sessionFor(JSON.stringify(plan({ metric: "total_tokens", time: "today" }))),
        "model tokens today",
        query,
        context,
      ),
    ).rejects.toThrow(
      "No model breakdown rows match today (2024-03-01). Available model breakdown dates: 2024-02-01 to 2024-02-29.",
    );
    expect(query).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("rejects unsupported intent rather than querying a substituted metric", async () => {
  const query = vi.fn(async () => []);
  const unsupported = plan({
    metric: "unsupported",
    reason: "An average cannot be represented by sums.",
  });
  await expect(
    generateAiChart(
      sessionFor(JSON.stringify(unsupported)),
      "average cost by model",
      query,
      context,
    ),
  ).rejects.toThrow(/average/i);
  expect(query).not.toHaveBeenCalled();
});

it("rejects unavailable model-agent breakdown without asking for another plan", async () => {
  const prompt = vi.fn(async () => JSON.stringify(plan({ x: "agent", series: "model" })));
  const query = vi.fn(async () => []);
  const limited: ChartContext = {
    availableTables: ["entries", "agent_usage", "model_usage"],
    reportTypes: ["daily"],
  };
  await expect(
    generateAiChart({ prompt, destroy() {} }, "cost by agent and model", query, limited),
  ).rejects.toThrow(/agent_model_usage|agent.*model|unavailable/i);
  expect(prompt).toHaveBeenCalledOnce();
  expect(query).not.toHaveBeenCalled();
});

it("repairs malformed JSON and schema-invalid output without accepting model SQL", async () => {
  const responses = [
    "not json",
    JSON.stringify({ ...plan(), sql: "SELECT 999 AS x, 1 AS y" }),
    JSON.stringify(
      plan({
        x: "source",
        series: "none",
        chart: { type: "bar", title: "Source cost", stacked: false },
      }),
    ),
  ];
  const retries: number[] = [];
  const session = sessionFor(...responses);
  const query = vi.fn(async (_sql: string) => [{ x: "work", y: 12 }]);
  const chart = await generateAiChart(session, "cost per source", query, context, {
    onRetry(attempt) {
      retries.push(attempt);
    },
  });
  expect(retries).toEqual([2, 3]);
  expect(query).toHaveBeenCalledOnce();
  expect(query.mock.calls[0][0]).toMatch(/SUM\(e\.cost\)/);
  expect(query.mock.calls[0][0]).not.toContain("SELECT 999");
  expect(chart.datasets).toEqual([{ label: "Source cost", values: [12] }]);
});

it("stops when the model repeats an invalid plan", async () => {
  const prompt = vi.fn(async () => "bad json");
  await expect(
    generateAiChart({ prompt, destroy() {} }, "cost", async () => [], context),
  ).rejects.toThrow(/repeated an invalid chart plan/);
  expect(prompt).toHaveBeenCalledTimes(2);
});

it("does not retry a malformed plan after cancellation", async () => {
  const controller = new AbortController();
  const prompt = vi.fn(async () => "invalid json");
  await expect(
    generateAiChart({ prompt, destroy() {} }, "cost", async () => [], context, {
      signal: controller.signal,
      onRetry() {
        controller.abort();
      },
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(prompt).toHaveBeenCalledOnce();
});

it("restarts one empty session and charts the next valid plan", async () => {
  const restarted = sessionFor(JSON.stringify(plan({ series: "none" })));
  const restartSession = vi.fn(async () => restarted);
  const query = vi.fn(async () => [{ x: "2026-09-26", y: 9 }]);
  const chart = await generateAiChart(sessionFor(""), "daily cost", query, context, {
    restartSession,
  });
  expect(restartSession).toHaveBeenCalledOnce();
  expect(chart.datasets).toEqual([{ label: "Cost by model", values: [9] }]);
});

it("stops after two empty sessions", async () => {
  const restartSession = vi.fn(async () => sessionFor(""));
  await expect(
    generateAiChart(sessionFor(""), "cost", async () => [], context, { restartSession }),
  ).rejects.toThrow(/empty response in two sessions/);
  expect(restartSession).toHaveBeenCalledOnce();
});

it("surfaces database errors without prompting the model to repair SQL", async () => {
  const prompt = vi.fn(async () => JSON.stringify(plan()));
  const failure = new Error("Database failed to execute the chart query");
  await expect(
    generateAiChart(
      { prompt, destroy() {} },
      "cost by model",
      async () => {
        throw failure;
      },
      context,
    ),
  ).rejects.toBe(failure);
  expect(prompt).toHaveBeenCalledOnce();
});

it("keeps distinct actionable suggestions and drops duplicates and echoes", async () => {
  const session: PromptSession = {
    async prompt() {
      return JSON.stringify({
        suggestions: [
          " Cost by model each day ",
          "Cost by model each day",
          "cost",
          "Cost by source each day",
        ],
      });
    },
    destroy() {},
  };
  expect(await suggestAiChartPrompts(session, "cost", ["entries", "model_usage"], "daily")).toEqual(
    ["Cost by model each day", "Cost by source each day"],
  );
});

it("rewrites English suggestions into the Japanese used by the request", async () => {
  const responses = [
    { suggestions: ["Show the total cost per model."] },
    { suggestions: ["モデル別の費用合計を表示"] },
  ];
  const session: PromptSession = {
    async prompt() {
      return JSON.stringify(responses.shift());
    },
    destroy() {},
  };
  expect(
    await suggestAiChartPrompts(
      session,
      "モデルごとの利用金額",
      ["entries", "model_usage"],
      "daily",
    ),
  ).toEqual(["モデル別の費用合計を表示"]);
});

it("rewrites Japanese suggestions into the English used by the request", async () => {
  const responses = [
    { suggestions: ["モデル別の費用合計を表示"] },
    { suggestions: ["Show total cost by model"] },
  ];
  const session: PromptSession = {
    async prompt() {
      return JSON.stringify(responses.shift());
    },
    destroy() {},
  };
  expect(
    await suggestAiChartPrompts(session, "cost by model", ["entries", "model_usage"], "daily"),
  ).toEqual(["Show total cost by model"]);
});

it("does not show suggestions in the wrong language when the model cannot correct them", async () => {
  const session: PromptSession = {
    async prompt() {
      return JSON.stringify({ suggestions: ["Show total cost per model."] });
    },
    destroy() {},
  };
  await expect(
    suggestAiChartPrompts(session, "モデル別の費用合計", ["entries", "model_usage"], "daily"),
  ).rejects.toThrow("input language");
});
