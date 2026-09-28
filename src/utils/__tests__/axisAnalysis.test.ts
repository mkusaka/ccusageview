import { describe, expect, it } from "vitest";
import { buildAxisAnalysisData } from "../axisAnalysis";
import type { NormalizedEntry } from "../normalize";
import type { ModelBreakdown } from "../../types";

function entry(label: string, overrides: Partial<NormalizedEntry> = {}): NormalizedEntry {
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

function breakdown(modelName: string, overrides: Partial<ModelBreakdown> = {}): ModelBreakdown {
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

describe("buildAxisAnalysisData", () => {
  it("weights model cost and cache rate by summed tokens, never by per-entry rates", () => {
    const entries = [
      entry("2026-01-01", {
        modelBreakdowns: [breakdown("A", { inputTokens: 10, cacheReadTokens: 90, cost: 0.1 })],
      }),
      entry("2026-01-02", {
        modelBreakdowns: [
          breakdown("A", { inputTokens: 890, cacheReadTokens: 10, cost: 0.9 }),
          breakdown("B", { inputTokens: 100, cost: 0.4 }),
        ],
      }),
    ];
    expect(buildAxisAnalysisData(entries, "modelCostPerMillion")).toMatchObject([
      { label: "A", totalTokens: 1000, cost: 1, costPerMillion: 1000 },
      { label: "B", totalTokens: 100, cost: 0.4, costPerMillion: 4000 },
    ]);
    expect(buildAxisAnalysisData(entries, "modelCacheReadRate")[0].cacheReadRate).toBe(0.1);
  });

  it("stacks token categories from agent totals without recounting nested models", () => {
    const entries = [
      entry("day 1", {
        agentBreakdowns: [
          {
            ...breakdown("agent A", {
              inputTokens: 100,
              outputTokens: 30,
              cacheCreationTokens: 20,
              cacheReadTokens: 50,
              cost: 0.5,
            }),
            modelBreakdowns: [
              breakdown("model X", {
                inputTokens: 100,
                outputTokens: 30,
                cacheCreationTokens: 20,
                cacheReadTokens: 50,
                cost: 0.5,
              }),
            ],
          },
        ],
      }),
      entry("day 2", {
        agentBreakdowns: [
          breakdown("agent A", {
            inputTokens: 40,
            outputTokens: 5,
            cacheCreationTokens: 15,
            cacheReadTokens: 40,
            cost: 0.3,
          }),
        ],
      }),
    ];
    expect(buildAxisAnalysisData(entries, "agentTokenMix")).toMatchObject([
      {
        label: "agent A",
        inputTokens: 140,
        outputTokens: 35,
        cacheCreationTokens: 35,
        cacheReadTokens: 90,
        totalTokens: 300,
      },
    ]);
    expect(buildAxisAnalysisData(entries, "agentCacheReadRate")[0].cacheReadRate).toBe(90 / 265);
  });

  it("does not invent models when a report lacks model breakdowns and preserves null denominators", () => {
    const noModels = entry("day", { models: ["A"], inputTokens: 40, totalTokens: 40, cost: 1 });
    expect(buildAxisAnalysisData([noModels], "modelTokenMix")).toEqual([]);
    const zero = entry("day", { modelBreakdowns: [breakdown("A", { cost: 3 })] });
    expect(buildAxisAnalysisData([zero], "modelCostPerMillion")[0]).toMatchObject({
      label: "A",
      totalTokens: 0,
      costPerMillion: null,
      cacheReadRate: null,
    });
    expect(
      buildAxisAnalysisData(
        [entry("day", { modelBreakdowns: [breakdown("A", { outputTokens: 20 })] })],
        "modelCacheReadRate",
      )[0].cacheReadRate,
    ).toBeNull();
  });

  it("aggregates each source independently from its own filtered entries", () => {
    const sources = [
      {
        label: "Claude",
        entries: [
          entry("day 1", { inputTokens: 80, outputTokens: 20, totalTokens: 100, cost: 0.2 }),
          entry("day 2", { cacheReadTokens: 300, totalTokens: 300, cost: 0.1 }),
        ],
      },
      {
        label: "Codex",
        entries: [
          entry("day 1", { inputTokens: 10, cacheCreationTokens: 20, totalTokens: 30, cost: 0.3 }),
        ],
      },
    ];
    const rows = buildAxisAnalysisData([], "sourceCostPerMillion", sources);
    expect(rows).toMatchObject([
      {
        label: "Claude",
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 300,
        totalTokens: 400,
      },
      { label: "Codex", inputTokens: 10, cacheCreationTokens: 20, totalTokens: 30 },
    ]);
    expect(rows[0].costPerMillion).toBeCloseTo(750);
    expect(rows[1].costPerMillion).toBeCloseTo(10000);
    expect(buildAxisAnalysisData([], "sourceTokenMix", sources)[0].cacheReadTokens).toBe(300);
  });

  it("groups repeated periods chronologically and computes a token-weighted time trend", () => {
    const rows = buildAxisAnalysisData(
      [
        entry("2026-02-02", { inputTokens: 100, totalTokens: 100, cost: 1 }),
        entry("2026-02-01", { inputTokens: 1, totalTokens: 1, cost: 0.1 }),
        entry("2026-02-02", { outputTokens: 900, totalTokens: 900, cost: 1 }),
      ],
      "periodCostPerMillion",
    );
    expect(rows.map(({ label, costPerMillion }) => ({ label, costPerMillion }))).toEqual([
      { label: "2026-02-01", costPerMillion: 100000 },
      { label: "2026-02-02", costPerMillion: 2000 },
    ]);
  });
});
