import { expect, it } from "vitest";
import { generateAiChart, suggestAiChartPrompts, type PromptSession } from "../aiChartGeneration";

it("repairs an invalid result shape and plots distinct series without inventing missing values", async () => {
  const inputs: string[] = [];
  const session: PromptSession = {
    async prompt(input) {
      inputs.push(input);
      return JSON.stringify({
        sql: inputs.length === 1 ? "SELECT duplicate_rows" : "SELECT grouped_rows",
        chart: {
          type: "bar",
          title: "Cost by model",
          x: "x",
          y: "y",
          series: "series",
          stacked: true,
        },
      });
    },
    destroy() {},
  };
  const chart = await generateAiChart(session, "cost by model", async (sql) =>
    sql.includes("duplicate")
      ? [
          { x: "Monday", y: 1, series: "A" },
          { x: "Monday", y: 2, series: "A" },
        ]
      : [
          { x: "Monday", y: 3, series: "A" },
          { x: "Monday", y: 4, series: "B" },
          { x: "Tuesday", y: 5, series: "B" },
        ],
  );
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toContain("Duplicate x/series pair");
  expect(chart.labels).toEqual(["Monday", "Tuesday"]);
  expect(chart.datasets).toEqual([
    { label: "A", values: [3, null] },
    { label: "B", values: [4, 5] },
  ]);
});

it("repairs malformed JSON, invalid fields, and executable SQL errors beyond three attempts", async () => {
  const inputs: string[] = [];
  const chart = { type: "bar", title: "Cost by day", x: "x", y: "y", series: "", stacked: false };
  const responses = [
    '{"sql":',
    JSON.stringify({ sql: "SELECT missing", chart: { ...chart, title: "" } }),
    JSON.stringify({ sql: "SELECT missing", chart }),
    JSON.stringify({ sql: "SELECT valid", chart }),
  ];
  const session: PromptSession = {
    async prompt(input) {
      inputs.push(input);
      return responses.shift() ?? "";
    },
    destroy() {},
  };

  const result = await generateAiChart(session, "daily cost", async (sql) => {
    if (sql === "SELECT missing") throw new Error("Binder Error: column missing");
    return [{ x: "Monday", y: 2.5 }];
  });
  expect(inputs).toHaveLength(4);
  expect(inputs[1]).toContain("Unexpected end");
  expect(inputs[2]).toContain("title");
  expect(inputs[3]).toContain("Binder Error");
  expect(result.labels).toEqual(["Monday"]);
  expect(result.datasets).toEqual([{ label: "Cost by day", values: [2.5] }]);
});

it("restarts a stuck constrained conversation while preserving the SQL parser feedback", async () => {
  const chart = { type: "bar", title: "Cost", x: "x", y: "y", series: "", stacked: false };
  let originalCalls = 0;
  let restarts = 0;
  const freshPrompts: string[] = [];
  const original: PromptSession = {
    async prompt() {
      originalCalls++;
      return originalCalls === 1 ? JSON.stringify({ sql: "SELECT model VARCHAR", chart }) : "";
    },
    destroy() {},
  };
  const fresh: PromptSession = {
    async prompt(input) {
      freshPrompts.push(input);
      return JSON.stringify({ sql: "SELECT valid", chart });
    },
    destroy() {},
  };

  const result = await generateAiChart(
    original,
    "model cost",
    async (sql) => {
      if (sql.includes("VARCHAR")) throw new Error('Parser Error: syntax error near "VARCHAR"');
      return [{ x: "Monday", y: 2.5 }];
    },
    {
      async restartSession() {
        restarts++;
        return fresh;
      },
    },
  );
  expect(originalCalls).toBe(2);
  expect(restarts).toBe(1);
  expect(freshPrompts[0]).toContain('Parser Error: syntax error near "VARCHAR"');
  expect(result.datasets).toEqual([{ label: "Cost", values: [2.5] }]);
});

it("charts SQL result columns when the model supplies SQL expressions after a binder repair", async () => {
  const chart = {
    type: "bar",
    title: "Agent input tokens",
    x: "e.label",
    y: "SUM(oa.input_tokens)",
    series: "",
    stacked: false,
  };
  let calls = 0;
  const original: PromptSession = {
    async prompt() {
      calls++;
      return calls === 1 ? JSON.stringify({ sql: "SELECT i.label FROM entries e", chart }) : "";
    },
    destroy() {},
  };
  const fresh: PromptSession = {
    async prompt(input) {
      expect(input).toContain('Referenced table "i" not found');
      return JSON.stringify({
        sql: "SELECT e.label, SUM(oa.input_tokens) AS y FROM entries e JOIN agent_usage oa USING (entry_id) GROUP BY e.label",
        chart,
      });
    },
    destroy() {},
  };
  const result = await generateAiChart(
    original,
    "agent usage",
    async (sql) => {
      if (sql.includes("i.label")) throw new Error('Binder Error: Referenced table "i" not found');
      return [{ label: "daily", y: 42 }];
    },
    { restartSession: async () => fresh },
  );
  expect(calls).toBe(2);
  expect(result.labels).toEqual(["daily"]);
  expect(result.datasets).toEqual([{ label: "Agent input tokens", values: [42] }]);
});

it("stops when a model repeats the same invalid response across fresh sessions", async () => {
  const response = JSON.stringify({
    sql: "SELECT missing FROM entries",
    chart: { type: "bar", title: "Cost", x: "x", y: "y", series: "", stacked: false },
  });
  let calls = 0;
  let restarts = 0;
  const original: PromptSession = {
    async prompt() {
      calls++;
      return calls === 1 ? response : "";
    },
    destroy() {},
  };
  const fresh: PromptSession = {
    async prompt() {
      calls++;
      return response;
    },
    destroy() {},
  };
  await expect(
    generateAiChart(
      original,
      "agent usage",
      async () => {
        throw new Error("Binder Error: missing column");
      },
      {
        async restartSession() {
          restarts++;
          return fresh;
        },
      },
    ),
  ).rejects.toThrow("repeated an invalid chart response: Binder Error: missing column");
  expect(calls).toBe(3);
  expect(restarts).toBe(1);
});

it("reports repeated empty model outputs instead of draining the session indefinitely", async () => {
  let originalCalls = 0;
  let freshCalls = 0;
  const original: PromptSession = {
    async prompt() {
      originalCalls++;
      return "";
    },
    destroy() {},
  };
  const fresh: PromptSession = {
    async prompt() {
      freshCalls++;
      return "";
    },
    destroy() {},
  };

  await expect(
    generateAiChart(original, "cost", async () => [], {
      async restartSession() {
        return fresh;
      },
    }),
  ).rejects.toThrow("empty response");
  expect(originalCalls).toBe(1);
  expect(freshCalls).toBe(1);
});

it("stops an unrecoverable model call instead of retrying without feedback", async () => {
  let calls = 0;
  const session: PromptSession = {
    async prompt() {
      calls++;
      throw new Error("On-device model unavailable");
    },
    destroy() {},
  };

  await expect(generateAiChart(session, "daily cost", async () => [])).rejects.toThrow(
    "On-device model unavailable",
  );
  expect(calls).toBe(1);
});

it("stops repair attempts after cancellation", async () => {
  const controller = new AbortController();
  let calls = 0;
  const session: PromptSession = {
    async prompt() {
      calls++;
      return '{"sql":';
    },
    destroy() {},
  };

  await expect(
    generateAiChart(session, "daily cost", async () => [], {
      signal: controller.signal,
      onRetry() {
        controller.abort();
      },
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
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
    { suggestions: ["Show the cost per model on the busiest day."] },
    { suggestions: ["利用が最も多い日のモデル別費用を表示"] },
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
      "一番使った日のmodelごとの利用金額",
      ["entries", "model_usage"],
      "daily",
    ),
  ).toEqual(["利用が最も多い日のモデル別費用を表示"]);
});

it("rewrites Japanese suggestions into the English used by the request", async () => {
  const responses = [
    { suggestions: ["曜日ごとのモデル別費用を表示"] },
    { suggestions: ["Show model costs by weekday"] },
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
      "cost by model and weekday",
      ["entries", "model_usage"],
      "daily",
    ),
  ).toEqual(["Show model costs by weekday"]);
});

it("does not show suggestions in the wrong language when the model cannot correct them", async () => {
  const session: PromptSession = {
    async prompt() {
      return JSON.stringify({ suggestions: ["Show the cost per model each day."] });
    },
    destroy() {},
  };

  await expect(
    suggestAiChartPrompts(session, "モデル別の日額費用", ["entries", "model_usage"], "daily"),
  ).rejects.toThrow("input language");
});
