import { describe, it, expect } from "vitest";
import { adaptReport } from "../adapt";

const makeCodexReport = (date: string) => ({
  daily: [
    {
      date,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      models: {},
    },
  ],
  totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
});

describe("adaptReport", () => {
  describe("passthrough for non-codex data", () => {
    it("returns null/undefined/primitives as-is", () => {
      expect(adaptReport(null)).toBeNull();
      expect(adaptReport(undefined)).toBeUndefined();
      expect(adaptReport(42)).toBe(42);
      expect(adaptReport("hello")).toBe("hello");
    });

    it("returns arrays as-is", () => {
      const arr = [1, 2, 3];
      expect(adaptReport(arr)).toBe(arr);
    });

    it("returns standard claude daily report as-is", () => {
      const claude = {
        daily: [
          {
            date: "2026-01-10",
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationTokens: 10,
            cacheReadTokens: 200,
            totalTokens: 360,
            totalCost: 0.5,
            modelsUsed: ["claude-sonnet-4-5"],
            modelBreakdowns: [],
          },
        ],
        totals: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 10,
          cacheReadTokens: 200,
          totalTokens: 360,
          totalCost: 0.5,
        },
      };
      expect(adaptReport(claude)).toBe(claude);
    });

    it("returns object without daily array as-is", () => {
      const obj = { sessions: [], totals: {} };
      expect(adaptReport(obj)).toBe(obj);
    });

    it("returns object with empty daily array as-is", () => {
      const obj = { daily: [], totals: {} };
      expect(adaptReport(obj)).toBe(obj);
    });
  });

  describe("codex daily entry adaptation", () => {
    const codexEntry = {
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
    };

    const codexReport = {
      daily: [codexEntry],
      totals: {
        inputTokens: 361481,
        cachedInputTokens: 300928,
        outputTokens: 7058,
        reasoningOutputTokens: 4032,
        totalTokens: 368539,
        costUSD: 0.18388725,
      },
    };

    it("converts English date to ISO format", () => {
      const result = adaptReport(codexReport) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].date).toBe("2025-09-16");
    });

    it("maps costUSD to totalCost", () => {
      const result = adaptReport(codexReport) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].totalCost).toBe(0.18388725);
      expect(daily[0]).not.toHaveProperty("costUSD");
    });

    it("maps cachedInputTokens to cacheReadTokens with cacheCreationTokens=0", () => {
      const result = adaptReport(codexReport) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].cacheReadTokens).toBe(300928);
      expect(daily[0].cacheCreationTokens).toBe(0);
    });

    it("derives modelsUsed from models Record keys", () => {
      const result = adaptReport(codexReport) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].modelsUsed).toEqual(["gpt-5-codex"]);
    });

    it("converts models Record to modelBreakdowns array", () => {
      const result = adaptReport(codexReport) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].modelBreakdowns).toEqual([
        {
          modelName: "gpt-5-codex",
          inputTokens: 361481,
          outputTokens: 7058,
          cacheCreationTokens: 0,
          cacheReadTokens: 300928,
          cost: 0,
        },
      ]);
    });

    it("preserves inputTokens, outputTokens, totalTokens", () => {
      const result = adaptReport(codexReport) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].inputTokens).toBe(361481);
      expect(daily[0].outputTokens).toBe(7058);
      expect(daily[0].totalTokens).toBe(368539);
    });
  });

  describe("multiple models in single entry", () => {
    it("handles entries with multiple models", () => {
      const report = {
        daily: [
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
          inputTokens: 489072578,
          cachedInputTokens: 473680128,
          outputTokens: 833396,
          totalTokens: 489905974,
          costUSD: 86.7845385,
        },
      };

      const result = adaptReport(report) as Record<string, unknown>;
      const daily = result.daily as Record<string, unknown>[];
      expect(daily[0].modelsUsed).toEqual(["gpt-5-codex", "gpt-5.1-codex-max"]);
      expect(daily[0].modelBreakdowns).toHaveLength(2);

      const breakdowns = daily[0].modelBreakdowns as {
        modelName: string;
        cacheReadTokens: number;
      }[];
      expect(breakdowns[0].modelName).toBe("gpt-5-codex");
      expect(breakdowns[0].cacheReadTokens).toBe(4301440);
      expect(breakdowns[1].modelName).toBe("gpt-5.1-codex-max");
      expect(breakdowns[1].cacheReadTokens).toBe(469378688);
    });
  });

  describe("totals adaptation", () => {
    it("converts codex totals to standard format", () => {
      const report = {
        daily: [
          {
            date: "Sep 16, 2025",
            inputTokens: 100,
            cachedInputTokens: 80,
            outputTokens: 20,
            totalTokens: 120,
            costUSD: 0.5,
            models: {},
          },
        ],
        totals: {
          inputTokens: 2927657022,
          cachedInputTokens: 2815638016,
          outputTokens: 15538555,
          reasoningOutputTokens: 9359881,
          totalTokens: 2943195577,
          costUSD: 842.2873408,
        },
      };

      const result = adaptReport(report) as Record<string, unknown>;
      const totals = result.totals as Record<string, unknown>;
      expect(totals.totalCost).toBe(842.2873408);
      expect(totals.cacheReadTokens).toBe(2815638016);
      expect(totals.cacheCreationTokens).toBe(0);
      expect(totals.inputTokens).toBe(2927657022);
      expect(totals.outputTokens).toBe(15538555);
      expect(totals.totalTokens).toBe(2943195577);
    });
  });

  describe("date conversion edge cases", () => {
    it("converts various English date formats", () => {
      const cases: [string, string][] = [
        ["Jan 01, 2026", "2026-01-01"],
        ["Feb 07, 2026", "2026-02-07"],
        ["Dec 31, 2025", "2025-12-31"],
      ];

      for (const [input, expected] of cases) {
        const result = adaptReport(makeCodexReport(input)) as Record<string, unknown>;
        const daily = result.daily as Record<string, unknown>[];
        expect(daily[0].date).toBe(expected);
      }
    });
  });
});
