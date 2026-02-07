import { describe, it, expect } from "vitest";
import { groupEntries, sumEntries, aggregateModelBreakdowns } from "../aggregate";
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

describe("groupEntries", () => {
  it("returns empty array for empty input", () => {
    expect(groupEntries([], (e) => e.label)).toEqual([]);
  });

  it("groups entries by keyFn and sums numeric fields", () => {
    const entries = [
      makeEntry("2025-07-01", { inputTokens: 100, cost: 1.0 }),
      makeEntry("2025-07-01", { inputTokens: 200, cost: 2.0 }),
      makeEntry("2025-07-02", { inputTokens: 50, cost: 0.5 }),
    ];
    const result = groupEntries(entries, (e) => e.label);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("2025-07-01");
    expect(result[0].inputTokens).toBe(300);
    expect(result[0].cost).toBe(3.0);
    expect(result[1].label).toBe("2025-07-02");
    expect(result[1].inputTokens).toBe(50);
  });

  it("skips entries where keyFn returns null", () => {
    const entries = [
      makeEntry("valid", { cost: 1.0 }),
      makeEntry("skip-me", { cost: 2.0 }),
      makeEntry("valid", { cost: 3.0 }),
    ];
    const result = groupEntries(entries, (e) => (e.label === "skip-me" ? null : e.label));

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("valid");
    expect(result[0].cost).toBe(4.0);
  });

  it("unions models across entries in the same group", () => {
    const entries = [
      makeEntry("2025-07", { models: ["model-a", "model-b"] }),
      makeEntry("2025-07", { models: ["model-b", "model-c"] }),
    ];
    const result = groupEntries(entries, (e) => e.label);

    expect(result[0].models).toEqual(expect.arrayContaining(["model-a", "model-b", "model-c"]));
    expect(result[0].models).toHaveLength(3);
  });

  it("merges modelBreakdowns by modelName", () => {
    const entries = [
      makeEntry("2025-07", { modelBreakdowns: [MB_SONNET], models: [MB_SONNET.modelName] }),
      makeEntry("2025-07", {
        modelBreakdowns: [{ ...MB_SONNET, inputTokens: 300, cost: 0.5 }],
        models: [MB_SONNET.modelName],
      }),
    ];
    const result = groupEntries(entries, (e) => e.label);

    expect(result[0].modelBreakdowns).toHaveLength(1);
    expect(result[0].modelBreakdowns![0].inputTokens).toBe(800);
    expect(result[0].modelBreakdowns![0].cost).toBe(1.5);
  });

  it("preserves distinct models in modelBreakdowns", () => {
    const entries = [
      makeEntry("2025-07", { modelBreakdowns: [MB_SONNET], models: [MB_SONNET.modelName] }),
      makeEntry("2025-07", { modelBreakdowns: [MB_HAIKU], models: [MB_HAIKU.modelName] }),
    ];
    const result = groupEntries(entries, (e) => e.label);

    expect(result[0].modelBreakdowns).toHaveLength(2);
    const names = result[0].modelBreakdowns!.map((m) => m.modelName).toSorted();
    expect(names).toEqual(["claude-haiku-3-20240307", "claude-sonnet-4-20250514"]);
  });

  it("sets modelBreakdowns to undefined when no entry has them", () => {
    const entries = [makeEntry("2025-07", { cost: 1 }), makeEntry("2025-07", { cost: 2 })];
    const result = groupEntries(entries, (e) => e.label);

    expect(result[0].modelBreakdowns).toBeUndefined();
  });

  it("sets hasBreakdowns true when only some entries have modelBreakdowns", () => {
    const entries = [
      makeEntry("2025-07", { modelBreakdowns: [MB_SONNET], cost: 1 }),
      makeEntry("2025-07", { cost: 2 }),
    ];
    const result = groupEntries(entries, (e) => e.label);

    expect(result[0].modelBreakdowns).toHaveLength(1);
    expect(result[0].modelBreakdowns![0].modelName).toBe("claude-sonnet-4-20250514");
  });

  it("sorts results by key", () => {
    const entries = [makeEntry("c"), makeEntry("a"), makeEntry("b")];
    const result = groupEntries(entries, (e) => e.label);

    expect(result.map((e) => e.label)).toEqual(["a", "b", "c"]);
  });

  it("supports custom grouping key (e.g. month extraction)", () => {
    const entries = [
      makeEntry("2025-07-01", { cost: 1.0 }),
      makeEntry("2025-07-15", { cost: 2.0 }),
      makeEntry("2025-08-01", { cost: 3.0 }),
    ];
    const result = groupEntries(entries, (e) => e.label.slice(0, 7));

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("2025-07");
    expect(result[0].cost).toBe(3.0);
    expect(result[1].label).toBe("2025-08");
    expect(result[1].cost).toBe(3.0);
  });
});

describe("sumEntries", () => {
  it("returns zeros for empty array", () => {
    const totals = sumEntries([]);
    expect(totals.inputTokens).toBe(0);
    expect(totals.outputTokens).toBe(0);
    expect(totals.cacheCreationTokens).toBe(0);
    expect(totals.cacheReadTokens).toBe(0);
    expect(totals.totalTokens).toBe(0);
    expect(totals.totalCost).toBe(0);
  });

  it("sums all numeric fields", () => {
    const entries = [
      makeEntry("a", {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 10,
        cacheReadTokens: 20,
        totalTokens: 180,
        cost: 1.0,
      }),
      makeEntry("b", {
        inputTokens: 200,
        outputTokens: 100,
        cacheCreationTokens: 20,
        cacheReadTokens: 40,
        totalTokens: 360,
        cost: 2.0,
      }),
    ];
    const totals = sumEntries(entries);

    expect(totals.inputTokens).toBe(300);
    expect(totals.outputTokens).toBe(150);
    expect(totals.cacheCreationTokens).toBe(30);
    expect(totals.cacheReadTokens).toBe(60);
    expect(totals.totalTokens).toBe(540);
    expect(totals.totalCost).toBe(3.0);
  });
});

describe("aggregateModelBreakdowns", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateModelBreakdowns([])).toEqual([]);
  });

  it("returns empty array when no entries have modelBreakdowns", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    expect(aggregateModelBreakdowns(entries)).toEqual([]);
  });

  it("aggregates breakdowns by modelName", () => {
    const entries = [
      makeEntry("a", { modelBreakdowns: [MB_SONNET, MB_HAIKU] }),
      makeEntry("b", { modelBreakdowns: [MB_SONNET] }),
    ];
    const result = aggregateModelBreakdowns(entries);

    expect(result).toHaveLength(2);
    const sonnet = result.find((m) => m.modelName === MB_SONNET.modelName)!;
    expect(sonnet.inputTokens).toBe(1000);
    expect(sonnet.cost).toBe(2.0);
    const haiku = result.find((m) => m.modelName === MB_HAIKU.modelName)!;
    expect(haiku.inputTokens).toBe(100);
    expect(haiku.cost).toBe(0.2);
  });

  it("skips entries without modelBreakdowns", () => {
    const entries = [makeEntry("a", { modelBreakdowns: [MB_SONNET] }), makeEntry("b")];
    const result = aggregateModelBreakdowns(entries);

    expect(result).toHaveLength(1);
    expect(result[0].modelName).toBe(MB_SONNET.modelName);
  });
});
