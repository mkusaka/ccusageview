import { describe, expect, it } from "vitest";
import type { DailyReport } from "../../types";
import { buildAiChartRows } from "../aiChartDatabase";
import { BLOCKS_REPORT, DAILY_REPORT, SESSION_REPORT } from "./fixtures";

describe("buildAiChartRows", () => {
  it("keeps sources separate and preserves the grain of agent and model breakdowns", () => {
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
    const rows = buildAiChartRows([
      { id: "a", label: "First", content: JSON.stringify(report), enabled: true },
      { id: "b", label: "Second", content: JSON.stringify(report), enabled: true },
      { id: "c", label: "Hidden", content: JSON.stringify(report), enabled: false },
    ]);

    expect(rows.entries.map((row) => [row.source_id, row.period, row.cost])).toEqual([
      ["a:0", "2025-07-01", 2.8],
      ["b:0", "2025-07-01", 2.8],
    ]);
    expect(rows.model_usage.filter((row) => row.entry_id === 0).map((row) => row.model)).toEqual([
      "claude-sonnet-4-20250514",
      "claude-haiku-3-20240307",
    ]);
    expect(rows.agent_usage[0]).toMatchObject({
      entry_id: 0,
      agent: "worker",
      total_tokens: 15,
      cost: 0.4,
    });
    expect(rows.agent_model_usage[0]).toMatchObject({
      entry_id: 0,
      agent: "worker",
      model: "sonnet",
      cost: 0.4,
    });
  });

  it("preserves session times and block start times instead of display labels", () => {
    const sessions = buildAiChartRows([
      { id: "s", label: "", content: JSON.stringify(SESSION_REPORT), enabled: true },
    ]);
    expect(sessions.entries.map((row) => row.period)).toEqual([
      "2025-07-01T08:00:00Z",
      "2025-07-02T10:00:00Z",
    ]);
    const blocks = buildAiChartRows([
      { id: "b", label: "", content: JSON.stringify(BLOCKS_REPORT), enabled: true },
    ]);
    expect(blocks.entries.map((row) => row.period)).toEqual([
      "2025-07-01T09:00:00Z",
      "2025-07-01T11:00:00Z",
    ]);
    expect(blocks.model_usage).toEqual([]);
  });
});
