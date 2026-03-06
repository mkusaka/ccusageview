import { describe, it, expect } from "vitest";
import {
  collectBreakdownKeys,
  formatBreakdownLabel,
  getProviderName,
  groupBreakdowns,
} from "../breakdown";
import type { ModelBreakdown } from "../../types";
import type { NormalizedEntry } from "../normalize";

const SONNET: ModelBreakdown = {
  modelName: "claude-sonnet-4-20250514",
  inputTokens: 500,
  outputTokens: 100,
  cacheCreationTokens: 50,
  cacheReadTokens: 200,
  cost: 1,
};

const HAIKU: ModelBreakdown = {
  modelName: "claude-haiku-3-20240307",
  inputTokens: 100,
  outputTokens: 20,
  cacheCreationTokens: 10,
  cacheReadTokens: 40,
  cost: 0.2,
};

const GPT: ModelBreakdown = {
  modelName: "gpt-5-codex",
  inputTokens: 300,
  outputTokens: 50,
  cacheCreationTokens: 0,
  cacheReadTokens: 120,
  cost: 0.7,
};

function makeEntry(label: string, modelBreakdowns?: ModelBreakdown[]): NormalizedEntry {
  return {
    label,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: 0,
    models: modelBreakdowns ? modelBreakdowns.map((entry) => entry.modelName) : [],
    modelBreakdowns,
  };
}

describe("getProviderName", () => {
  it("detects Anthropic and OpenAI model names", () => {
    expect(getProviderName("claude-sonnet-4-20250514")).toBe("Anthropic");
    expect(getProviderName("gpt-5-codex")).toBe("OpenAI");
  });

  it("detects provider namespaces before model names", () => {
    expect(getProviderName("anthropic/claude-sonnet-4-20250514")).toBe("Anthropic");
    expect(getProviderName("openai/gpt-4.1")).toBe("OpenAI");
  });

  it("falls back to Unknown for unsupported names", () => {
    expect(getProviderName("custom-model")).toBe("Unknown");
  });
});

describe("groupBreakdowns", () => {
  it("keeps model names separate in model mode", () => {
    const grouped = groupBreakdowns([SONNET, HAIKU, GPT], "model");

    expect(Array.from(grouped.keys())).toEqual([
      "claude-sonnet-4-20250514",
      "claude-haiku-3-20240307",
      "gpt-5-codex",
    ]);
  });

  it("merges models that share a provider in provider mode", () => {
    const grouped = groupBreakdowns([SONNET, HAIKU, GPT], "provider");

    expect(grouped.get("Anthropic")).toEqual({
      inputTokens: 600,
      outputTokens: 120,
      cacheCreationTokens: 60,
      cacheReadTokens: 240,
      cost: 1.2,
    });
    expect(grouped.get("OpenAI")).toEqual({
      inputTokens: 300,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 120,
      cost: 0.7,
    });
  });
});

describe("collectBreakdownKeys", () => {
  it("collects provider names across entries", () => {
    const entries = [makeEntry("a", [SONNET, GPT]), makeEntry("b", [HAIKU])];
    expect(collectBreakdownKeys(entries, "provider")).toEqual(["Anthropic", "OpenAI"]);
  });
});

describe("formatBreakdownLabel", () => {
  it("shortens Claude model names in model mode", () => {
    expect(formatBreakdownLabel("claude-sonnet-4-20250514", "model")).toBe("sonnet-4");
  });

  it("keeps provider labels unchanged in provider mode", () => {
    expect(formatBreakdownLabel("Anthropic", "provider")).toBe("Anthropic");
  });
});
