import { describe, it, expect } from "vitest";
import {
  normalizeEntries,
  normalizeTotals,
  aggregateToMonthly,
  computeTotalsFromEntries,
} from "../normalize";
import {
  DAILY_REPORT,
  WEEKLY_REPORT,
  MONTHLY_REPORT,
  SESSION_REPORT,
  BLOCKS_REPORT,
} from "./fixtures";

describe("normalizeEntries", () => {
  it("normalizes daily entries", () => {
    const entries = normalizeEntries(DAILY_REPORT);
    expect(entries).toHaveLength(3);
    expect(entries[0].label).toBe("2025-07-01");
    expect(entries[0].cost).toBe(2.8);
    expect(entries[0].models).toEqual(["claude-sonnet-4-20250514", "claude-haiku-3-20240307"]);
  });

  it("normalizes weekly entries", () => {
    const entries = normalizeEntries(WEEKLY_REPORT);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("2025-06-30");
  });

  it("normalizes monthly entries", () => {
    const entries = normalizeEntries(MONTHLY_REPORT);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("2025-07");
  });

  it("normalizes session entries sorted by lastActivity", () => {
    const entries = normalizeEntries(SESSION_REPORT);
    expect(entries).toHaveLength(2);
    // The earlier session (2025-07-01) should come first
    // Second session has "Unknown Project" so should use sessionId tail
    expect(entries[0].label).toMatch(/vvv555$/);
    expect(entries[1].label).toBe("/home/user/my-project");
  });

  it("normalizes blocks entries, filtering out gaps", () => {
    const entries = normalizeEntries(BLOCKS_REPORT);
    // 3 blocks total, 1 gap filtered out
    expect(entries).toHaveLength(2);
    expect(entries[0].cost).toBe(2.5);
    expect(entries[0].cacheCreationTokens).toBe(100_000);
    expect(entries[0].cacheReadTokens).toBe(800_000);
  });

  it("snapshot: daily normalized entries", () => {
    expect(normalizeEntries(DAILY_REPORT)).toMatchSnapshot();
  });

  it("blocks normalized entries have correct structure (label is TZ-dependent)", () => {
    const entries = normalizeEntries(BLOCKS_REPORT);
    // Labels use toLocaleString which varies by timezone, so check structure not exact labels
    expect(entries.map(({ label: _, ...rest }) => rest)).toMatchSnapshot();
    // Verify labels contain expected date parts
    for (const entry of entries) {
      expect(entry.label).toMatch(/Jul 1/);
    }
  });
});

describe("normalizeTotals", () => {
  it("extracts totals from daily report", () => {
    const totals = normalizeTotals(DAILY_REPORT);
    expect(totals.totalCost).toBe(DAILY_REPORT.totals.totalCost);
    expect(totals.inputTokens).toBe(DAILY_REPORT.totals.inputTokens);
  });

  it("computes totals from blocks (non-gap entries)", () => {
    const totals = normalizeTotals(BLOCKS_REPORT);
    expect(totals.totalCost).toBe(2.8); // 2.5 + 0.3
    expect(totals.inputTokens).toBe(600_000); // 500k + 100k
    expect(totals.cacheCreationTokens).toBe(110_000); // 100k + 10k
  });

  it("snapshot: daily totals", () => {
    expect(normalizeTotals(DAILY_REPORT)).toMatchSnapshot();
  });

  it("snapshot: blocks totals", () => {
    expect(normalizeTotals(BLOCKS_REPORT)).toMatchSnapshot();
  });
});

describe("aggregateToMonthly", () => {
  it("aggregates daily entries by month", () => {
    const daily = normalizeEntries(DAILY_REPORT);
    const monthly = aggregateToMonthly(daily);
    expect(monthly).toHaveLength(2); // 2025-07 and 2025-08
    expect(monthly[0].label).toBe("2025-07");
    expect(monthly[1].label).toBe("2025-08");
  });

  it("sums token values for the same month", () => {
    const daily = normalizeEntries(DAILY_REPORT);
    const monthly = aggregateToMonthly(daily);
    // July: 600k + 400k input
    expect(monthly[0].inputTokens).toBe(1_000_000);
    // July: 2.8 + 1.5 cost
    expect(monthly[0].cost).toBeCloseTo(4.3);
  });

  it("aggregates modelBreakdowns by model name", () => {
    const daily = normalizeEntries(DAILY_REPORT);
    const monthly = aggregateToMonthly(daily);
    const julyBreakdowns = monthly[0].modelBreakdowns;
    expect(julyBreakdowns).toBeDefined();
    expect(julyBreakdowns!.length).toBe(2); // sonnet + haiku
  });

  it("skips entries with non-date labels", () => {
    const entries = [
      {
        label: "session-abc",
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 10,
        cacheReadTokens: 200,
        totalTokens: 360,
        cost: 0.5,
        models: ["model-a"],
      },
    ];
    const monthly = aggregateToMonthly(entries);
    expect(monthly).toHaveLength(0);
  });

  it("snapshot: monthly aggregation from daily", () => {
    const daily = normalizeEntries(DAILY_REPORT);
    expect(aggregateToMonthly(daily)).toMatchSnapshot();
  });
});

describe("computeTotalsFromEntries", () => {
  it("sums all numeric fields from entries", () => {
    const entries = normalizeEntries(DAILY_REPORT);
    const totals = computeTotalsFromEntries(entries);
    expect(totals.inputTokens).toBe(DAILY_REPORT.totals.inputTokens);
    expect(totals.outputTokens).toBe(DAILY_REPORT.totals.outputTokens);
    expect(totals.totalCost).toBeCloseTo(DAILY_REPORT.totals.totalCost);
  });

  it("returns zeros for empty entries", () => {
    const totals = computeTotalsFromEntries([]);
    expect(totals.inputTokens).toBe(0);
    expect(totals.outputTokens).toBe(0);
    expect(totals.cacheCreationTokens).toBe(0);
    expect(totals.cacheReadTokens).toBe(0);
    expect(totals.totalTokens).toBe(0);
    expect(totals.totalCost).toBe(0);
  });
});
