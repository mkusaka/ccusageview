import { describe, it, expect } from "vitest";
import { getTokenPricing, calculateCostByTokenType, buildCostByTokenType } from "../pricing";
import type { NormalizedEntry } from "../normalize";
import type { ModelBreakdown } from "../../types";

function makeEntry(
  label: string,
  breakdowns?: ModelBreakdown[],
  overrides?: Partial<NormalizedEntry>,
): NormalizedEntry {
  const cost = breakdowns ? breakdowns.reduce((s, b) => s + b.cost, 0) : (overrides?.cost ?? 0);
  const inputTokens = breakdowns
    ? breakdowns.reduce((s, b) => s + b.inputTokens, 0)
    : (overrides?.inputTokens ?? 0);
  const outputTokens = breakdowns
    ? breakdowns.reduce((s, b) => s + b.outputTokens, 0)
    : (overrides?.outputTokens ?? 0);
  const cacheCreationTokens = breakdowns
    ? breakdowns.reduce((s, b) => s + b.cacheCreationTokens, 0)
    : (overrides?.cacheCreationTokens ?? 0);
  const cacheReadTokens = breakdowns
    ? breakdowns.reduce((s, b) => s + b.cacheReadTokens, 0)
    : (overrides?.cacheReadTokens ?? 0);
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

  return {
    label,
    cost,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    models: breakdowns ? breakdowns.map((b) => b.modelName) : (overrides?.models ?? []),
    modelBreakdowns: breakdowns,
    ...overrides,
  };
}

describe("getTokenPricing", () => {
  it("returns pricing for new-format model names", () => {
    const pricing = getTokenPricing("claude-sonnet-4-5-20250929");
    expect(pricing).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  });

  it("returns pricing for sonnet 4.6", () => {
    const pricing = getTokenPricing("claude-sonnet-4-6-20260217");
    expect(pricing).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  });

  it("returns pricing for opus 4.6", () => {
    const pricing = getTokenPricing("claude-opus-4-6-20260101");
    expect(pricing).toEqual({ input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 });
  });

  it("returns pricing for opus 4", () => {
    const pricing = getTokenPricing("claude-opus-4-20250115");
    expect(pricing).toEqual({ input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 });
  });

  it("returns pricing for sonnet 4", () => {
    const pricing = getTokenPricing("claude-sonnet-4-20250514");
    expect(pricing).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  });

  it("returns pricing for haiku 4.5", () => {
    const pricing = getTokenPricing("claude-haiku-4-5-20251001");
    expect(pricing).toEqual({ input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 });
  });

  it("returns pricing for old-format model names (3-5-sonnet)", () => {
    const pricing = getTokenPricing("claude-3-5-sonnet-20241022");
    expect(pricing).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  });

  it("returns pricing for old-format haiku 3.5", () => {
    const pricing = getTokenPricing("claude-3-5-haiku-20241022");
    expect(pricing).toEqual({ input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 });
  });

  it("returns pricing for haiku 3 (new naming)", () => {
    const pricing = getTokenPricing("claude-haiku-3-20240307");
    expect(pricing).toEqual({ input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 });
  });

  it("returns pricing for old-format opus 3", () => {
    const pricing = getTokenPricing("claude-3-opus-20240229");
    expect(pricing).toEqual({ input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 });
  });

  it("returns null for unknown models", () => {
    expect(getTokenPricing("gpt-4")).toBeNull();
    expect(getTokenPricing("unknown-model")).toBeNull();
  });
});

describe("calculateCostByTokenType", () => {
  it("calculates cost from modelBreakdowns", () => {
    const entry = makeEntry("2025-07-01", [
      {
        modelName: "claude-sonnet-4-20250514",
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheCreationTokens: 500_000,
        cacheReadTokens: 2_000_000,
        cost: 6.975,
      },
    ]);

    const result = calculateCostByTokenType(entry);
    expect(result).not.toBeNull();
    // input: 1M * $3/M = $3
    expect(result!.inputCost).toBeCloseTo(3);
    // output: 100K * $15/M = $1.5
    expect(result!.outputCost).toBeCloseTo(1.5);
    // cacheWrite: 500K * $3.75/M = $1.875
    expect(result!.cacheWriteCost).toBeCloseTo(1.875);
    // cacheRead: 2M * $0.3/M = $0.6
    expect(result!.cacheReadCost).toBeCloseTo(0.6);
  });

  it("sums across multiple model breakdowns", () => {
    const entry = makeEntry("2025-07-01", [
      {
        modelName: "claude-sonnet-4-20250514",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 3,
      },
      {
        modelName: "claude-opus-4-6-20260101",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 5,
      },
    ]);

    const result = calculateCostByTokenType(entry);
    expect(result).not.toBeNull();
    // sonnet: 1M * $3 = $3, opus: 1M * $5 = $5
    expect(result!.inputCost).toBeCloseTo(8);
  });

  it("skips unknown models in breakdowns but uses known ones", () => {
    const entry = makeEntry("2025-07-01", [
      {
        modelName: "claude-sonnet-4-20250514",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 3,
      },
      {
        modelName: "unknown-model-20250101",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 10,
      },
    ]);

    const result = calculateCostByTokenType(entry);
    expect(result).not.toBeNull();
    expect(result!.inputCost).toBeCloseTo(3); // only sonnet counted
  });

  it("returns null if all models in breakdowns are unknown", () => {
    const entry = makeEntry("2025-07-01", [
      {
        modelName: "unknown-model-20250101",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 10,
      },
    ]);

    expect(calculateCostByTokenType(entry)).toBeNull();
  });

  it("uses single model from models array when no breakdowns", () => {
    const entry = makeEntry("block-1", undefined, {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 1_100_000,
      cost: 4.5,
      models: ["claude-sonnet-4-20250514"],
    });

    const result = calculateCostByTokenType(entry);
    expect(result).not.toBeNull();
    expect(result!.inputCost).toBeCloseTo(3);
    expect(result!.outputCost).toBeCloseTo(1.5);
  });

  it("returns null when no breakdowns and multiple models", () => {
    const entry = makeEntry("block-1", undefined, {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 1_100_000,
      cost: 4.5,
      models: ["claude-sonnet-4-20250514", "claude-opus-4-6-20260101"],
    });

    expect(calculateCostByTokenType(entry)).toBeNull();
  });

  it("returns null when no breakdowns and unknown single model", () => {
    const entry = makeEntry("block-1", undefined, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 1_000_000,
      cost: 10,
      models: ["gpt-4"],
    });

    expect(calculateCostByTokenType(entry)).toBeNull();
  });
});

describe("buildCostByTokenType", () => {
  it("builds chart data from entries", () => {
    const entries = [
      makeEntry("2025-07-01", [
        {
          modelName: "claude-sonnet-4-20250514",
          inputTokens: 1_000_000,
          outputTokens: 100_000,
          cacheCreationTokens: 500_000,
          cacheReadTokens: 2_000_000,
          cost: 6.975,
        },
      ]),
    ];

    const result = buildCostByTokenType(entries);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("2025-07-01");
    expect(result[0].inputCost).toBeCloseTo(3);
    expect(result[0].outputCost).toBeCloseTo(1.5);
    expect(result[0].cacheWriteCost).toBeCloseTo(1.875);
    expect(result[0].cacheReadCost).toBeCloseTo(0.6);
  });

  it("returns zeros for entries where pricing cannot be determined", () => {
    const entries = [
      makeEntry("block-1", undefined, {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 1_000_000,
        cost: 10,
        models: ["gpt-4"],
      }),
    ];

    const result = buildCostByTokenType(entries);
    expect(result).toHaveLength(1);
    expect(result[0].inputCost).toBe(0);
    expect(result[0].outputCost).toBe(0);
    expect(result[0].cacheWriteCost).toBe(0);
    expect(result[0].cacheReadCost).toBe(0);
  });

  it("returns empty array for empty entries", () => {
    expect(buildCostByTokenType([])).toEqual([]);
  });
});
