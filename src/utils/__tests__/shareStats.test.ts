import { describe, expect, it } from "vitest";
import type { NormalizedEntry } from "../normalize";
import { computeShareStats } from "../shareStats";

function entry(label: string, cost = 1, totalTokens = 100): NormalizedEntry {
  return {
    label,
    cost,
    totalTokens,
    inputTokens: totalTokens,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    models: [],
  };
}

describe("computeShareStats", () => {
  it("counts hourly usage once per active day and includes missing and inactive calendar days in the average", () => {
    const result = computeShareStats(
      [
        entry("2026-09-03T10:00", 3),
        entry("2026-09-01T09:00", 1),
        entry("2026-09-01T10:00", 2),
        entry("2026-09-04T09:00", 0, 0),
      ],
      "hourly",
    );
    expect(result.activeDays).toBe(2);
    expect(result.calendarDays).toBe(4);
    expect(result.averageCost).toBe(1.5);
    expect(result.first).toBe("2026-09-01");
    expect(result.last).toBe("2026-09-04");
    expect(result.totals.totalCost).toBe(6);
  });

  it("does not turn monthly buckets into active days or daily averages", () => {
    const result = computeShareStats([entry("2026-08", 10), entry("2026-09", 30)], "monthly");
    expect(result.activeDays).toBeNull();
    expect(result.calendarDays).toBeNull();
    expect(result.entryCount).toBe(2);
    expect(result.averageCost).toBe(20);
  });

  it("keeps costs without agent breakdowns visible and does not double-count providers", () => {
    const withAgent = entry("2026-09-01", 2);
    withAgent.agentBreakdowns = [
      {
        modelName: "Claude Code",
        inputTokens: 100,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 2,
      },
    ];
    withAgent.modelBreakdowns = [{ ...withAgent.agentBreakdowns[0], modelName: "claude-sonnet-4" }];
    const result = computeShareStats([withAgent, entry("2026-09-02", 3)], "daily");
    expect(result.mode).toBe("agent");
    expect(result.costs).toEqual([
      { key: "Other", label: "Other", cost: 3 },
      { key: "Claude Code", label: "Claude Code", cost: 2 },
    ]);
    expect(result.breakdownTotal).toBe(5);
  });

  it("preserves reported breakdown amounts when they disagree with the overall total", () => {
    const row = entry("2026-09-01", 1);
    row.modelBreakdowns = [
      {
        modelName: "claude-sonnet-4",
        inputTokens: 100,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 2,
      },
    ];
    const result = computeShareStats([row], "daily");
    expect(result.costs).toEqual([{ key: "Anthropic", label: "Anthropic", cost: 2 }]);
    expect(result.breakdownTotal).toBe(2);
    expect(result.totals.totalCost).toBe(1);
  });

  it("handles empty and token-only usage without non-finite averages", () => {
    const empty = computeShareStats([], "daily");
    expect(empty.averageCost).toBe(0);
    expect(empty.costs).toEqual([]);
    const tokens = computeShareStats([entry("2026-09-01", 0)], "daily");
    expect(tokens.activeDays).toBe(1);
    expect(tokens.calendarDays).toBe(1);
    expect(tokens.averageCost).toBe(0);
  });
});
