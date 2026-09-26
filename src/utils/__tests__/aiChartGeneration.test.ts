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
