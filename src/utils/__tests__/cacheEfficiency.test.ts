import { describe, expect, it } from "vitest";
import {
  buildCacheEfficiencyChartDataByBreakdown,
  buildCacheEfficiencyChartData,
  buildCacheEfficiencyChartDataForBreakdowns,
  calculateCacheEfficiency,
  formatCacheReadRate,
  getCacheReadRate,
} from "../cacheEfficiency";
import type { NormalizedEntry } from "../normalize";
import type { ModelBreakdown } from "../../types";

function makeEntry(label: string, overrides?: Partial<NormalizedEntry>): NormalizedEntry {
  return {
    label,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: 0,
    models: [],
    ...overrides,
  };
}

function makeBreakdown(
  modelName: string,
  overrides?: Partial<Omit<ModelBreakdown, "modelName">>,
): ModelBreakdown {
  return {
    modelName,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    ...overrides,
  };
}

describe("calculateCacheEfficiency", () => {
  it("computes cacheReadTokens / (inputTokens + cacheCreationTokens + cacheReadTokens)", () => {
    const result = calculateCacheEfficiency({
      inputTokens: 400,
      cacheReadTokens: 600,
      cacheCreationTokens: 100,
    });

    expect(result).toEqual({
      inputTokens: 400,
      cacheReadTokens: 600,
      cacheCreationTokens: 100,
      cacheEfficiencyDenominatorTokens: 1_100,
      cacheReadRate: 600 / 1_100,
    });
  });

  it("returns 0 when cache read is 0 and input is present", () => {
    expect(getCacheReadRate({ inputTokens: 100, cacheReadTokens: 0 })).toBe(0);
  });

  it("returns 1 when input is 0 and cache read is present", () => {
    expect(getCacheReadRate({ inputTokens: 0, cacheReadTokens: 100 })).toBe(1);
  });

  it("returns null when input + cache create + cache read denominator is 0", () => {
    expect(getCacheReadRate({ inputTokens: 0, cacheReadTokens: 0 })).toBeNull();
  });

  it("includes cache creation tokens in the rate denominator", () => {
    const lowCreation = getCacheReadRate({
      inputTokens: 100,
      cacheReadTokens: 300,
      cacheCreationTokens: 0,
    });
    const highCreation = getCacheReadRate({
      inputTokens: 100,
      cacheReadTokens: 300,
      cacheCreationTokens: 10_000,
    });

    expect(lowCreation).toBe(0.75);
    expect(highCreation).toBe(300 / 10_400);
  });

  it("formats null as N/A and defined rates as percentages", () => {
    expect(formatCacheReadRate(null)).toBe("N/A");
    expect(formatCacheReadRate(0.6428)).toBe("64.3%");
  });
});

describe("buildCacheEfficiencyChartDataForBreakdowns", () => {
  it("preserves entry order and computes rates from visible model breakdowns", () => {
    const entries = [
      makeEntry("day1", {
        modelBreakdowns: [
          makeBreakdown("modelA", {
            inputTokens: 100,
            cacheReadTokens: 300,
            cacheCreationTokens: 50,
          }),
          makeBreakdown("modelB", {
            inputTokens: 900,
            cacheReadTokens: 100,
            cacheCreationTokens: 20,
          }),
        ],
      }),
      makeEntry("day2", {
        modelBreakdowns: [
          makeBreakdown("modelA", {
            inputTokens: 200,
            cacheReadTokens: 0,
            cacheCreationTokens: 10,
          }),
        ],
      }),
    ];

    expect(
      buildCacheEfficiencyChartDataForBreakdowns(entries, new Set(["modelA"]), false, "model"),
    ).toEqual([
      {
        label: "day1",
        inputTokens: 100,
        cacheReadTokens: 300,
        cacheCreationTokens: 50,
        cacheEfficiencyDenominatorTokens: 450,
        cacheReadRate: 300 / 450,
      },
      {
        label: "day2",
        inputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 10,
        cacheEfficiencyDenominatorTokens: 210,
        cacheReadRate: 0,
      },
    ]);
  });

  it("aggregates visible providers before computing cache read rate", () => {
    const entries = [
      makeEntry("day1", {
        modelBreakdowns: [
          makeBreakdown("claude-sonnet-4-20250514", {
            inputTokens: 100,
            cacheReadTokens: 300,
            cacheCreationTokens: 50,
          }),
          makeBreakdown("claude-haiku-3-20240307", {
            inputTokens: 100,
            cacheReadTokens: 100,
            cacheCreationTokens: 10,
          }),
          makeBreakdown("gpt-5-codex", {
            inputTokens: 500,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          }),
        ],
      }),
    ];

    expect(
      buildCacheEfficiencyChartDataForBreakdowns(
        entries,
        new Set(["Anthropic"]),
        false,
        "provider",
      ),
    ).toEqual([
      {
        label: "day1",
        inputTokens: 200,
        cacheReadTokens: 400,
        cacheCreationTokens: 60,
        cacheEfficiencyDenominatorTokens: 660,
        cacheReadRate: 400 / 660,
      },
    ]);
  });

  it("uses entry totals for Other entries only when included", () => {
    const entries = [
      makeEntry("block1", {
        inputTokens: 100,
        cacheReadTokens: 300,
        cacheCreationTokens: 50,
      }),
    ];

    expect(buildCacheEfficiencyChartDataForBreakdowns(entries, new Set(), true, "model")).toEqual([
      {
        label: "block1",
        inputTokens: 100,
        cacheReadTokens: 300,
        cacheCreationTokens: 50,
        cacheEfficiencyDenominatorTokens: 450,
        cacheReadRate: 300 / 450,
      },
    ]);

    expect(buildCacheEfficiencyChartDataForBreakdowns(entries, new Set(), false, "model")).toEqual([
      {
        label: "block1",
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        cacheEfficiencyDenominatorTokens: 0,
        cacheReadRate: null,
      },
    ]);
  });
});

describe("buildCacheEfficiencyChartDataByBreakdown", () => {
  it("builds stacked input/cache bars and per-model rates per entry", () => {
    const entries = [
      makeEntry("day1", {
        modelBreakdowns: [
          makeBreakdown("modelA", {
            inputTokens: 100,
            cacheCreationTokens: 50,
            cacheReadTokens: 300,
          }),
          makeBreakdown("modelB", {
            inputTokens: 900,
            cacheCreationTokens: 100,
            cacheReadTokens: 100,
          }),
        ],
      }),
      makeEntry("day2", {
        modelBreakdowns: [
          makeBreakdown("modelA", {
            inputTokens: 200,
            cacheCreationTokens: 10,
            cacheReadTokens: 0,
          }),
        ],
      }),
    ];

    expect(
      buildCacheEfficiencyChartDataByBreakdown(entries, ["modelA", "modelB"], false, "model"),
    ).toEqual([
      {
        label: "day1",
        "modelA::inputTokens": 100,
        "modelA::cacheCreationTokens": 50,
        "modelA::cacheReadTokens": 300,
        "modelA::cacheReadRate": 300 / 450,
        "modelB::inputTokens": 900,
        "modelB::cacheCreationTokens": 100,
        "modelB::cacheReadTokens": 100,
        "modelB::cacheReadRate": 100 / 1_100,
      },
      {
        label: "day2",
        "modelA::inputTokens": 200,
        "modelA::cacheCreationTokens": 10,
        "modelA::cacheReadTokens": 0,
        "modelA::cacheReadRate": 0,
      },
    ]);
  });

  it("aggregates provider groups before computing each provider rate", () => {
    const entries = [
      makeEntry("day1", {
        modelBreakdowns: [
          makeBreakdown("claude-sonnet-4-20250514", {
            inputTokens: 100,
            cacheCreationTokens: 50,
            cacheReadTokens: 300,
          }),
          makeBreakdown("claude-haiku-3-20240307", {
            inputTokens: 100,
            cacheCreationTokens: 10,
            cacheReadTokens: 100,
          }),
          makeBreakdown("gpt-5-codex", {
            inputTokens: 500,
            cacheReadTokens: 0,
          }),
        ],
      }),
    ];

    expect(
      buildCacheEfficiencyChartDataByBreakdown(entries, ["Anthropic", "OpenAI"], false, "provider"),
    ).toEqual([
      {
        label: "day1",
        "Anthropic::inputTokens": 200,
        "Anthropic::cacheCreationTokens": 60,
        "Anthropic::cacheReadTokens": 400,
        "Anthropic::cacheReadRate": 400 / 660,
        "OpenAI::inputTokens": 500,
        "OpenAI::cacheCreationTokens": 0,
        "OpenAI::cacheReadTokens": 0,
        "OpenAI::cacheReadRate": 0,
      },
    ]);
  });
});

describe("buildCacheEfficiencyChartData", () => {
  it("preserves entry order while adding rate and token bars", () => {
    const entries = [
      makeEntry("day1", {
        inputTokens: 100,
        cacheReadTokens: 300,
        cacheCreationTokens: 50,
      }),
      makeEntry("day2", {
        inputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 10,
      }),
    ];

    expect(buildCacheEfficiencyChartData(entries)).toEqual([
      {
        label: "day1",
        inputTokens: 100,
        cacheReadTokens: 300,
        cacheCreationTokens: 50,
        cacheEfficiencyDenominatorTokens: 450,
        cacheReadRate: 300 / 450,
      },
      {
        label: "day2",
        inputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 10,
        cacheEfficiencyDenominatorTokens: 210,
        cacheReadRate: 0,
      },
    ]);
  });
});
