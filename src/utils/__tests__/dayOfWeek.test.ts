import { describe, expect, it } from "vitest";
import type { ModelBreakdown } from "../../types";
import { buildDayOfWeekByBreakdown, buildDayOfWeekData, type DayOfWeekMetric } from "../dayOfWeek";
import type { NormalizedEntry } from "../normalize";

function makeEntry(
  label: string,
  breakdowns?: ModelBreakdown[],
  overrides?: Partial<NormalizedEntry>,
): NormalizedEntry {
  const cost = breakdowns ? breakdowns.reduce((sum, breakdown) => sum + breakdown.cost, 0) : 0;
  const inputTokens = breakdowns
    ? breakdowns.reduce((sum, breakdown) => sum + breakdown.inputTokens, 0)
    : 0;
  const outputTokens = breakdowns
    ? breakdowns.reduce((sum, breakdown) => sum + breakdown.outputTokens, 0)
    : 0;
  const cacheCreationTokens = breakdowns
    ? breakdowns.reduce((sum, breakdown) => sum + breakdown.cacheCreationTokens, 0)
    : 0;
  const cacheReadTokens = breakdowns
    ? breakdowns.reduce((sum, breakdown) => sum + breakdown.cacheReadTokens, 0)
    : 0;
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

  return {
    label,
    cost,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    models: breakdowns ? breakdowns.map((breakdown) => breakdown.modelName) : [],
    modelBreakdowns: breakdowns,
    ...overrides,
  };
}

const SONNET: ModelBreakdown = {
  modelName: "claude-sonnet-4-20250514",
  inputTokens: 600,
  outputTokens: 200,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  cost: 6,
};

const HAIKU: ModelBreakdown = {
  modelName: "claude-haiku-3-20240307",
  inputTokens: 100,
  outputTokens: 100,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  cost: 1,
};

const GPT: ModelBreakdown = {
  modelName: "gpt-5-codex",
  inputTokens: 300,
  outputTokens: 100,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  cost: 3,
};

function getBucket(metric: DayOfWeekMetric, label: string, entries: NormalizedEntry[]) {
  return buildDayOfWeekData(entries, metric).find((bucket) => bucket.day === label);
}

describe("buildDayOfWeekData", () => {
  it("computes avg/max/min/sum for each weekday bucket", () => {
    const entries = [
      makeEntry("2026-04-06", undefined, { cost: 2 }),
      makeEntry("2026-04-13", undefined, { cost: 6 }),
      makeEntry("2026-04-14", undefined, { cost: 5 }),
    ];

    const monday = getBucket("cost", "Mon", entries);
    const tuesday = getBucket("cost", "Tue", entries);

    expect(monday).toEqual({
      day: "Mon",
      avg: 4,
      max: 6,
      min: 2,
      sum: 8,
      count: 2,
    });
    expect(tuesday).toEqual({
      day: "Tue",
      avg: 5,
      max: 5,
      min: 5,
      sum: 5,
      count: 1,
    });
  });
});

describe("buildDayOfWeekByBreakdown", () => {
  it("aggregates weekday breakdowns for avg and sum", () => {
    const entries = [makeEntry("2026-04-06", [SONNET, GPT]), makeEntry("2026-04-13", [HAIKU])];

    const avgRows = buildDayOfWeekByBreakdown(
      entries,
      "cost",
      ["Anthropic", "OpenAI"],
      "provider",
      "avg",
    );
    const sumRows = buildDayOfWeekByBreakdown(
      entries,
      "cost",
      ["Anthropic", "OpenAI"],
      "provider",
      "sum",
    );

    expect(avgRows[0]).toEqual({
      day: "Mon",
      Anthropic: 3.5,
      OpenAI: 1.5,
    });
    expect(sumRows[0]).toEqual({
      day: "Mon",
      Anthropic: 7,
      OpenAI: 3,
    });
  });

  it("uses the weekday representative entry for max and min", () => {
    const entries = [makeEntry("2026-04-06", [SONNET, GPT]), makeEntry("2026-04-13", [HAIKU])];

    const maxRows = buildDayOfWeekByBreakdown(
      entries,
      "cost",
      ["Anthropic", "OpenAI"],
      "provider",
      "max",
    );
    const minRows = buildDayOfWeekByBreakdown(
      entries,
      "cost",
      ["Anthropic", "OpenAI"],
      "provider",
      "min",
    );

    expect(maxRows[0]).toEqual({
      day: "Mon",
      Anthropic: 6,
      OpenAI: 3,
    });
    expect(minRows[0]).toEqual({
      day: "Mon",
      Anthropic: 1,
      OpenAI: 0,
    });
  });

  it("keeps Other when the representative or aggregate entry has no breakdown", () => {
    const entries = [
      makeEntry("2026-04-06", undefined, { cost: 4 }),
      makeEntry("2026-04-13", [SONNET]),
    ];

    const avgRows = buildDayOfWeekByBreakdown(entries, "cost", ["Anthropic"], "provider", "avg");
    const maxRows = buildDayOfWeekByBreakdown(entries, "cost", ["Anthropic"], "provider", "max");

    expect(avgRows[0]).toEqual({
      day: "Mon",
      Anthropic: 3,
      Other: 2,
    });
    expect(maxRows[0]).toEqual({
      day: "Mon",
      Anthropic: 6,
      Other: 0,
    });
  });
});
