import { describe, it, expect } from "vitest";
import { mergeNormalizedEntries } from "../merge";
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

const MB_SONNET: ModelBreakdown = {
  modelName: "claude-sonnet-4-20250514",
  inputTokens: 500,
  outputTokens: 100,
  cacheCreationTokens: 50,
  cacheReadTokens: 200,
  cost: 1.0,
};

const MB_HAIKU: ModelBreakdown = {
  modelName: "claude-haiku-3-20240307",
  inputTokens: 100,
  outputTokens: 20,
  cacheCreationTokens: 10,
  cacheReadTokens: 40,
  cost: 0.2,
};

describe("mergeNormalizedEntries", () => {
  it("returns empty array for empty input", () => {
    expect(mergeNormalizedEntries([])).toEqual([]);
  });

  it("returns the single array as-is for single input", () => {
    const entries = [makeEntry("2025-07-01", { cost: 1 })];
    const result = mergeNormalizedEntries([entries]);
    expect(result).toBe(entries);
  });

  it("merges two arrays with no overlapping labels", () => {
    const a = [makeEntry("2025-07-01", { cost: 1 })];
    const b = [makeEntry("2025-07-02", { cost: 2 })];
    const result = mergeNormalizedEntries([a, b]);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("2025-07-01");
    expect(result[0].cost).toBe(1);
    expect(result[1].label).toBe("2025-07-02");
    expect(result[1].cost).toBe(2);
  });

  it("sorts results by label", () => {
    const a = [makeEntry("2025-07-03", { cost: 3 })];
    const b = [makeEntry("2025-07-01", { cost: 1 })];
    const c = [makeEntry("2025-07-02", { cost: 2 })];
    const result = mergeNormalizedEntries([a, b, c]);

    expect(result.map((e) => e.label)).toEqual(["2025-07-01", "2025-07-02", "2025-07-03"]);
  });

  it("sums numeric fields for overlapping labels", () => {
    const a = [
      makeEntry("2025-07-01", {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 10,
        cacheReadTokens: 20,
        totalTokens: 180,
        cost: 1.0,
      }),
    ];
    const b = [
      makeEntry("2025-07-01", {
        inputTokens: 200,
        outputTokens: 100,
        cacheCreationTokens: 20,
        cacheReadTokens: 40,
        totalTokens: 360,
        cost: 2.0,
      }),
    ];
    const result = mergeNormalizedEntries([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0].inputTokens).toBe(300);
    expect(result[0].outputTokens).toBe(150);
    expect(result[0].cacheCreationTokens).toBe(30);
    expect(result[0].cacheReadTokens).toBe(60);
    expect(result[0].totalTokens).toBe(540);
    expect(result[0].cost).toBe(3.0);
  });

  it("unions models for overlapping labels", () => {
    const a = [makeEntry("2025-07-01", { models: ["model-a", "model-b"] })];
    const b = [makeEntry("2025-07-01", { models: ["model-b", "model-c"] })];
    const result = mergeNormalizedEntries([a, b]);

    expect(result[0].models).toEqual(expect.arrayContaining(["model-a", "model-b", "model-c"]));
    expect(result[0].models).toHaveLength(3);
  });

  it("merges modelBreakdowns for same model", () => {
    const a = [
      makeEntry("2025-07-01", {
        modelBreakdowns: [MB_SONNET],
        models: [MB_SONNET.modelName],
      }),
    ];
    const b = [
      makeEntry("2025-07-01", {
        modelBreakdowns: [{ ...MB_SONNET, inputTokens: 300, cost: 0.5 }],
        models: [MB_SONNET.modelName],
      }),
    ];
    const result = mergeNormalizedEntries([a, b]);

    expect(result[0].modelBreakdowns).toHaveLength(1);
    const mb = result[0].modelBreakdowns![0];
    expect(mb.modelName).toBe("claude-sonnet-4-20250514");
    expect(mb.inputTokens).toBe(800);
    expect(mb.cost).toBe(1.5);
  });

  it("preserves distinct models in modelBreakdowns", () => {
    const a = [
      makeEntry("2025-07-01", {
        modelBreakdowns: [MB_SONNET],
        models: [MB_SONNET.modelName],
      }),
    ];
    const b = [
      makeEntry("2025-07-01", {
        modelBreakdowns: [MB_HAIKU],
        models: [MB_HAIKU.modelName],
      }),
    ];
    const result = mergeNormalizedEntries([a, b]);

    expect(result[0].modelBreakdowns).toHaveLength(2);
    const names = result[0].modelBreakdowns!.map((m) => m.modelName).toSorted();
    expect(names).toEqual(["claude-haiku-3-20240307", "claude-sonnet-4-20250514"]);
  });

  it("sets modelBreakdowns to undefined when no source has them", () => {
    const a = [makeEntry("2025-07-01", { cost: 1 })];
    const b = [makeEntry("2025-07-01", { cost: 2 })];
    const result = mergeNormalizedEntries([a, b]);

    expect(result[0].modelBreakdowns).toBeUndefined();
  });

  it("handles mixed entries with and without modelBreakdowns", () => {
    const a = [
      makeEntry("2025-07-01", {
        modelBreakdowns: [MB_SONNET],
        models: [MB_SONNET.modelName],
        cost: 1,
      }),
    ];
    const b = [makeEntry("2025-07-01", { cost: 2 })];
    const result = mergeNormalizedEntries([a, b]);

    expect(result[0].cost).toBe(3);
    expect(result[0].modelBreakdowns).toHaveLength(1);
    expect(result[0].modelBreakdowns![0].modelName).toBe("claude-sonnet-4-20250514");
  });
});
