import { describe, expect, it } from "vitest";
import type { DailyReport } from "../../types";
import { buildAiChartData } from "../aiChartData";
import {
  BLOCKS_REPORT,
  DAILY_REPORT,
  SESSION_REPORT,
  WEEKLY_REPORT,
  MONTHLY_REPORT,
} from "./fixtures";

function source(id: string, report: unknown, label = "Shared", enabled = true) {
  return { id, label, content: JSON.stringify(report), enabled };
}

describe("buildAiChartData", () => {
  it("preserves per-source entry, model, agent, and agent-model grains", () => {
    const report: DailyReport = {
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
      ],
    };
    const data = buildAiChartData([
      source("a", report),
      source("b", report),
      source("c", report, "Hidden", false),
    ]);
    expect(
      data.rows.entries.map(({ source_id, period, cost }) => [source_id, period, cost]),
    ).toEqual([
      ["a:0", "2025-07-01", 2.8],
      ["b:0", "2025-07-01", 2.8],
    ]);
    expect(
      data.rows.model_usage.filter((row) => row.entry_id === 0).map((row) => row.model),
    ).toEqual(["claude-sonnet-4-20250514", "claude-haiku-3-20240307"]);
    expect(data.rows.agent_usage[0]).toMatchObject({
      entry_id: 0,
      agent: "worker",
      total_tokens: 15,
      cost: 0.4,
    });
    expect(data.rows.agent_model_usage[0]).toMatchObject({
      entry_id: 0,
      agent: "worker",
      model: "sonnet",
      cost: 0.4,
    });
    expect(data.context).toEqual({
      availableTables: ["entries", "model_usage", "agent_usage", "agent_model_usage"],
      reportTypes: ["daily"],
      granularities: ["daily", "weekly", "monthly"],
    });
  });

  it("uses actual session and block timestamps, ignoring gap blocks", () => {
    expect(
      buildAiChartData([source("s", SESSION_REPORT)]).rows.entries.map((row) => row.period),
    ).toEqual(["2025-07-01T08:00:00Z", "2025-07-02T10:00:00Z"]);
    const blocks = buildAiChartData([source("b", BLOCKS_REPORT)]);
    expect(blocks.rows.entries.map((row) => row.period)).toEqual([
      "2025-07-01T09:00:00Z",
      "2025-07-01T11:00:00Z",
    ]);
    expect(blocks.context.availableTables).toEqual(["entries"]);
  });

  it("exposes only original weekly and monthly resolution for aggregate reports", () => {
    expect(buildAiChartData([source("w", WEEKLY_REPORT)]).context.granularities).toEqual([
      "weekly",
    ]);
    expect(buildAiChartData([source("m", MONTHLY_REPORT)]).context.granularities).toEqual([
      "monthly",
    ]);
  });
});
