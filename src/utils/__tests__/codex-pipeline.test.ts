import { describe, it, expect } from "vitest";
import { adaptReport } from "../adapt";
import { detectReportType } from "../detect";
import { normalizeEntries, normalizeTotals, aggregateToMonthly } from "../normalize";

// Realistic codex daily report with multiple entries and models
const CODEX_REPORT = {
  daily: [
    {
      date: "Sep 16, 2025",
      inputTokens: 361481,
      cachedInputTokens: 300928,
      outputTokens: 7058,
      reasoningOutputTokens: 4032,
      totalTokens: 368539,
      costUSD: 0.18388725,
      models: {
        "gpt-5-codex": {
          inputTokens: 361481,
          cachedInputTokens: 300928,
          outputTokens: 7058,
          reasoningOutputTokens: 4032,
          totalTokens: 368539,
          isFallback: false,
        },
      },
    },
    {
      date: "Sep 17, 2025",
      inputTokens: 7443023,
      cachedInputTokens: 7010432,
      outputTokens: 48097,
      reasoningOutputTokens: 28800,
      totalTokens: 7491120,
      costUSD: 1.89801275,
      models: {
        "gpt-5-codex": {
          inputTokens: 7443023,
          cachedInputTokens: 7010432,
          outputTokens: 48097,
          reasoningOutputTokens: 28800,
          totalTokens: 7491120,
          isFallback: false,
        },
      },
    },
    {
      date: "Nov 23, 2025",
      inputTokens: 489072578,
      cachedInputTokens: 473680128,
      outputTokens: 833396,
      reasoningOutputTokens: 405056,
      totalTokens: 489905974,
      costUSD: 86.7845385,
      models: {
        "gpt-5-codex": {
          inputTokens: 5208320,
          cachedInputTokens: 4301440,
          outputTokens: 39311,
          reasoningOutputTokens: 31936,
          totalTokens: 5247631,
          isFallback: false,
        },
        "gpt-5.1-codex-max": {
          inputTokens: 483864258,
          cachedInputTokens: 469378688,
          outputTokens: 794085,
          reasoningOutputTokens: 373120,
          totalTokens: 484658343,
          isFallback: false,
        },
      },
    },
  ],
  totals: {
    inputTokens: 496877082,
    cachedInputTokens: 480991488,
    outputTokens: 888551,
    reasoningOutputTokens: 437888,
    totalTokens: 497765633,
    costUSD: 88.8664385,
  },
};

describe("E2E pipeline: codex format", () => {
  const adapted = adaptReport(CODEX_REPORT);
  const report = detectReportType(adapted);

  it("detects adapted codex as daily report", () => {
    expect(report.type).toBe("daily");
  });

  it("normalizes entries with ISO dates", () => {
    const entries = normalizeEntries(report);
    expect(entries).toHaveLength(3);
    expect(entries[0].label).toBe("2025-09-16");
    expect(entries[1].label).toBe("2025-09-17");
    expect(entries[2].label).toBe("2025-11-23");
  });

  it("maps cost from costUSD", () => {
    const entries = normalizeEntries(report);
    expect(entries[0].cost).toBe(0.18388725);
    expect(entries[2].cost).toBe(86.7845385);
  });

  it("maps cachedInputTokens to cacheReadTokens", () => {
    const entries = normalizeEntries(report);
    expect(entries[0].cacheReadTokens).toBe(300928);
    expect(entries[0].cacheCreationTokens).toBe(0);
  });

  it("derives models from Record keys", () => {
    const entries = normalizeEntries(report);
    expect(entries[0].models).toEqual(["gpt-5-codex"]);
    expect(entries[2].models).toEqual(["gpt-5-codex", "gpt-5.1-codex-max"]);
  });

  it("creates modelBreakdowns from models Record", () => {
    const entries = normalizeEntries(report);
    // Single model entry
    expect(entries[0].modelBreakdowns).toHaveLength(1);
    expect(entries[0].modelBreakdowns![0]).toEqual({
      modelName: "gpt-5-codex",
      inputTokens: 361481,
      outputTokens: 7058,
      cacheCreationTokens: 0,
      cacheReadTokens: 300928,
      cost: 0,
    });
    // Multi model entry
    expect(entries[2].modelBreakdowns).toHaveLength(2);
    expect(entries[2].modelBreakdowns![0].modelName).toBe("gpt-5-codex");
    expect(entries[2].modelBreakdowns![1].modelName).toBe("gpt-5.1-codex-max");
    expect(entries[2].modelBreakdowns![1].cacheReadTokens).toBe(469378688);
  });

  it("computes correct totals", () => {
    const totals = normalizeTotals(report);
    expect(totals.totalCost).toBeCloseTo(88.8664385, 5);
    expect(totals.inputTokens).toBe(496877082);
    expect(totals.cacheReadTokens).toBe(480991488);
    expect(totals.cacheCreationTokens).toBe(0);
  });

  it("aggregates to monthly correctly", () => {
    const entries = normalizeEntries(report);
    const monthly = aggregateToMonthly(entries);
    expect(monthly).toHaveLength(2);
    expect(monthly[0].label).toBe("2025-09");
    expect(monthly[1].label).toBe("2025-11");
    // Sep: two entries summed
    expect(monthly[0].inputTokens).toBe(361481 + 7443023);
    expect(monthly[0].cost).toBeCloseTo(0.18388725 + 1.89801275);
    // Nov: single entry
    expect(monthly[1].inputTokens).toBe(489072578);
  });

  it("monthly aggregation merges model breakdowns", () => {
    const entries = normalizeEntries(report);
    const monthly = aggregateToMonthly(entries);
    // Sep: both entries have gpt-5-codex → merged
    expect(monthly[0].modelBreakdowns).toHaveLength(1);
    expect(monthly[0].modelBreakdowns![0].modelName).toBe("gpt-5-codex");
    expect(monthly[0].modelBreakdowns![0].inputTokens).toBe(361481 + 7443023);
    // Nov: two distinct models
    expect(monthly[1].modelBreakdowns).toHaveLength(2);
  });
});
