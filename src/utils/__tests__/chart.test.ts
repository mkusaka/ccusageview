import { describe, it, expect } from "vitest";
import {
  shortenModelName,
  collectModels,
  buildModelSeries,
  buildCostByModel,
  buildTokenTypeByModel,
  MODEL_COLORS,
} from "../chart.ts";
import type { NormalizedEntry } from "../normalize.ts";
import type { ModelBreakdown } from "../../types.ts";

// Helper to build a NormalizedEntry with optional modelBreakdowns
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

const SONNET: ModelBreakdown = {
  modelName: "claude-sonnet-4-20250514",
  inputTokens: 500_000,
  outputTokens: 20_000,
  cacheCreationTokens: 100_000,
  cacheReadTokens: 800_000,
  cost: 2.5,
};

const HAIKU: ModelBreakdown = {
  modelName: "claude-haiku-3-20240307",
  inputTokens: 100_000,
  outputTokens: 5_000,
  cacheCreationTokens: 10_000,
  cacheReadTokens: 200_000,
  cost: 0.3,
};

describe("shortenModelName", () => {
  it("shortens new-format claude names", () => {
    expect(shortenModelName("claude-sonnet-4-20250514")).toBe("sonnet-4");
    expect(shortenModelName("claude-haiku-3-20240307")).toBe("haiku-3");
    expect(shortenModelName("claude-opus-4-20250514")).toBe("opus-4");
  });

  it("shortens old-format claude names", () => {
    expect(shortenModelName("claude-3-5-sonnet-20241022")).toBe("3-5-sonnet");
  });

  it("returns non-claude names unchanged", () => {
    expect(shortenModelName("gpt-4")).toBe("gpt-4");
    expect(shortenModelName("custom-model")).toBe("custom-model");
  });

  it("returns names without 8-digit date suffix unchanged", () => {
    expect(shortenModelName("claude-sonnet-4")).toBe("claude-sonnet-4");
    expect(shortenModelName("claude-sonnet-4-2025")).toBe("claude-sonnet-4-2025");
  });
});

describe("collectModels", () => {
  it("returns unique sorted model names from modelBreakdowns", () => {
    const entries = [makeEntry("2025-07-01", [SONNET, HAIKU]), makeEntry("2025-07-02", [SONNET])];
    expect(collectModels(entries)).toEqual(["claude-haiku-3-20240307", "claude-sonnet-4-20250514"]);
  });

  it("returns empty array for entries without modelBreakdowns", () => {
    const entries = [makeEntry("block-1", undefined, { cost: 1, models: ["model-a"] })];
    expect(collectModels(entries)).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(collectModels([])).toEqual([]);
  });
});

describe("buildModelSeries", () => {
  it("builds series with shortened labels and cycled colors", () => {
    const models = ["claude-haiku-3-20240307", "claude-sonnet-4-20250514"];
    const entries = [makeEntry("2025-07-01", [SONNET, HAIKU])];
    const series = buildModelSeries(models, entries);

    expect(series).toHaveLength(2);
    expect(series[0]).toEqual({
      key: "claude-haiku-3-20240307",
      label: "haiku-3",
      color: MODEL_COLORS[0],
    });
    expect(series[1]).toEqual({
      key: "claude-sonnet-4-20250514",
      label: "sonnet-4",
      color: MODEL_COLORS[1],
    });
  });

  it("appends Other when some entries lack modelBreakdowns", () => {
    const models = ["claude-sonnet-4-20250514"];
    const entries = [
      makeEntry("2025-07-01", [SONNET]),
      makeEntry("block-1", undefined, { cost: 1, models: ["model-a"] }),
    ];
    const series = buildModelSeries(models, entries);

    expect(series).toHaveLength(2);
    expect(series[1].key).toBe("Other");
    expect(series[1].label).toBe("Other");
  });

  it("does not append Other when all entries have modelBreakdowns", () => {
    const models = ["claude-sonnet-4-20250514"];
    const entries = [makeEntry("2025-07-01", [SONNET])];
    const series = buildModelSeries(models, entries);

    expect(series).toHaveLength(1);
    expect(series.every((s) => s.key !== "Other")).toBe(true);
  });

  it("uses custom colors when provided", () => {
    const models = ["claude-sonnet-4-20250514"];
    const entries = [makeEntry("2025-07-01", [SONNET])];
    const colors = ["red", "blue"];
    const series = buildModelSeries(models, entries, colors);

    expect(series[0].color).toBe("red");
  });
});

describe("buildCostByModel", () => {
  it("maps modelBreakdowns cost to model name keys", () => {
    const entries = [makeEntry("2025-07-01", [SONNET, HAIKU])];
    const result = buildCostByModel(entries);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      label: "2025-07-01",
      "claude-sonnet-4-20250514": 2.5,
      "claude-haiku-3-20240307": 0.3,
    });
  });

  it("falls back to Other for entries without modelBreakdowns", () => {
    const entries = [makeEntry("block-1", undefined, { cost: 1.5, models: ["m"] })];
    const result = buildCostByModel(entries);

    expect(result[0]).toEqual({ label: "block-1", Other: 1.5 });
  });

  it("handles mixed entries with and without modelBreakdowns", () => {
    const entries = [
      makeEntry("2025-07-01", [SONNET]),
      makeEntry("block-1", undefined, { cost: 0.5, models: ["m"] }),
    ];
    const result = buildCostByModel(entries);

    expect(result[0]["claude-sonnet-4-20250514"]).toBe(2.5);
    expect(result[1]["Other"]).toBe(0.5);
  });

  it("returns empty array for empty entries", () => {
    expect(buildCostByModel([])).toEqual([]);
  });
});

describe("buildTokenTypeByModel", () => {
  it("extracts inputTokens per model", () => {
    const entries = [makeEntry("2025-07-01", [SONNET, HAIKU])];
    const result = buildTokenTypeByModel(entries, "inputTokens");

    expect(result[0]).toEqual({
      label: "2025-07-01",
      "claude-sonnet-4-20250514": 500_000,
      "claude-haiku-3-20240307": 100_000,
    });
  });

  it("extracts outputTokens per model", () => {
    const entries = [makeEntry("2025-07-01", [SONNET, HAIKU])];
    const result = buildTokenTypeByModel(entries, "outputTokens");

    expect(result[0]["claude-sonnet-4-20250514"]).toBe(20_000);
    expect(result[0]["claude-haiku-3-20240307"]).toBe(5_000);
  });

  it("extracts cacheCreationTokens per model", () => {
    const entries = [makeEntry("2025-07-01", [SONNET])];
    const result = buildTokenTypeByModel(entries, "cacheCreationTokens");

    expect(result[0]["claude-sonnet-4-20250514"]).toBe(100_000);
  });

  it("extracts cacheReadTokens per model", () => {
    const entries = [makeEntry("2025-07-01", [SONNET])];
    const result = buildTokenTypeByModel(entries, "cacheReadTokens");

    expect(result[0]["claude-sonnet-4-20250514"]).toBe(800_000);
  });

  it("falls back to Other using entry token type for entries without modelBreakdowns", () => {
    const entries = [
      makeEntry("block-1", undefined, {
        inputTokens: 100_000,
        outputTokens: 5_000,
        cacheCreationTokens: 10_000,
        cacheReadTokens: 200_000,
        totalTokens: 315_000,
        cost: 0.3,
        models: ["m"],
      }),
    ];

    expect(buildTokenTypeByModel(entries, "inputTokens")[0]["Other"]).toBe(100_000);
    expect(buildTokenTypeByModel(entries, "outputTokens")[0]["Other"]).toBe(5_000);
    expect(buildTokenTypeByModel(entries, "cacheCreationTokens")[0]["Other"]).toBe(10_000);
    expect(buildTokenTypeByModel(entries, "cacheReadTokens")[0]["Other"]).toBe(200_000);
  });

  it("returns empty array for empty entries", () => {
    expect(buildTokenTypeByModel([], "inputTokens")).toEqual([]);
  });
});
