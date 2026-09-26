import { describe, it, expect } from "vitest";
import {
  collectBreakdownKeys,
  formatBreakdownLabel,
  getProviderName,
  groupBreakdowns,
} from "../breakdown";
import type { ModelBreakdown } from "../../types";
import type { AgentModelBreakdown, NormalizedEntry } from "../normalize";

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

function makeEntry(
  label: string,
  modelBreakdowns?: ModelBreakdown[],
  agentBreakdowns?: AgentModelBreakdown[],
): NormalizedEntry {
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
    agentBreakdowns,
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
    const grouped = groupBreakdowns(makeEntry("a", [SONNET, HAIKU, GPT]), "model");

    expect(Array.from(grouped.keys())).toEqual([
      "claude-sonnet-4-20250514",
      "claude-haiku-3-20240307",
      "gpt-5-codex",
    ]);
  });

  it("merges models that share a provider in provider mode", () => {
    const grouped = groupBreakdowns(makeEntry("a", [SONNET, HAIKU, GPT]), "provider");

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

  it("filters model breakdowns by provider", () => {
    const grouped = groupBreakdowns(makeEntry("a", [SONNET, HAIKU, GPT]), "model", "Anthropic");

    expect(Array.from(grouped.keys())).toEqual([
      "claude-sonnet-4-20250514",
      "claude-haiku-3-20240307",
    ]);
  });

  it("groups agent breakdowns by agent name in agent mode", () => {
    const agents = [
      { ...SONNET, modelName: "claude" },
      { ...GPT, modelName: "codex" },
    ];
    const grouped = groupBreakdowns(makeEntry("a", [SONNET, GPT], agents), "agent");

    expect(grouped.get("claude")).toEqual({
      inputTokens: 500,
      outputTokens: 100,
      cacheCreationTokens: 50,
      cacheReadTokens: 200,
      cost: 1,
    });
    expect(grouped.get("codex")).toEqual({
      inputTokens: 300,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 120,
      cost: 0.7,
    });
  });

  it("groups the selected agent's nested model breakdowns via agentFilter", () => {
    const agents = [
      { ...SONNET, modelName: "claude", modelBreakdowns: [SONNET, HAIKU] },
      { ...GPT, modelName: "codex", modelBreakdowns: [GPT] },
    ];
    const grouped = groupBreakdowns(
      makeEntry("a", [SONNET, HAIKU, GPT], agents),
      "model",
      undefined,
      "claude",
    );

    expect(Array.from(grouped.keys())).toEqual([
      "claude-sonnet-4-20250514",
      "claude-haiku-3-20240307",
    ]);
  });

  it("returns empty when the selected agent is absent", () => {
    const agents = [{ ...SONNET, modelName: "claude", modelBreakdowns: [SONNET] }];
    const grouped = groupBreakdowns(makeEntry("a", [SONNET], agents), "model", undefined, "codex");

    expect(grouped.size).toBe(0);
  });
  it("groups only the selected model per agent without using all-model agent totals", () => {
    const agents = [
      { ...SONNET, modelName: "claude", modelBreakdowns: [SONNET, HAIKU] },
      { ...GPT, modelName: "codex", modelBreakdowns: [SONNET, GPT] },
      { ...HAIKU, modelName: "missing-detail" },
    ];
    const entry = makeEntry("a", [SONNET, HAIKU, GPT], agents);

    expect(groupBreakdowns(entry, "agent", undefined, undefined, SONNET.modelName)).toEqual(
      new Map([
        [
          "claude",
          {
            inputTokens: SONNET.inputTokens,
            outputTokens: SONNET.outputTokens,
            cacheCreationTokens: SONNET.cacheCreationTokens,
            cacheReadTokens: SONNET.cacheReadTokens,
            cost: SONNET.cost,
          },
        ],
        [
          "codex",
          {
            inputTokens: SONNET.inputTokens,
            outputTokens: SONNET.outputTokens,
            cacheCreationTokens: SONNET.cacheCreationTokens,
            cacheReadTokens: SONNET.cacheReadTokens,
            cost: SONNET.cost,
          },
        ],
      ]),
    );
    expect(groupBreakdowns(entry, "agent", undefined, undefined, "absent").size).toBe(0);
  });
});

describe("collectBreakdownKeys", () => {
  it("collects provider names across entries", () => {
    const entries = [makeEntry("a", [SONNET, GPT]), makeEntry("b", [HAIKU])];
    expect(collectBreakdownKeys(entries, "provider")).toEqual(["Anthropic", "OpenAI"]);
  });

  it("collects only models from the selected provider", () => {
    const entries = [makeEntry("a", [SONNET, HAIKU, GPT])];
    expect(collectBreakdownKeys(entries, "model", "Anthropic")).toEqual([
      "claude-haiku-3-20240307",
      "claude-sonnet-4-20250514",
    ]);
  });

  it("collects agent names in agent mode", () => {
    const entries = [
      makeEntry("a", [SONNET], [{ ...SONNET, modelName: "claude" }]),
      makeEntry("b", [GPT], [{ ...GPT, modelName: "codex" }]),
    ];
    expect(collectBreakdownKeys(entries, "agent")).toEqual(["claude", "codex"]);
  });

  it("collects only models of the selected agent via agentFilter", () => {
    const entries = [
      makeEntry(
        "a",
        [SONNET, GPT],
        [
          { ...SONNET, modelName: "claude", modelBreakdowns: [SONNET] },
          { ...GPT, modelName: "codex", modelBreakdowns: [GPT] },
        ],
      ),
    ];
    expect(collectBreakdownKeys(entries, "model", undefined, "codex")).toEqual(["gpt-5-codex"]);
  });
  it("lists only agents that used the selected model", () => {
    const entries = [
      makeEntry(
        "a",
        [SONNET, GPT],
        [
          { ...SONNET, modelName: "claude", modelBreakdowns: [SONNET] },
          { ...GPT, modelName: "codex", modelBreakdowns: [GPT] },
        ],
      ),
    ];
    expect(collectBreakdownKeys(entries, "agent", undefined, undefined, SONNET.modelName)).toEqual([
      "claude",
    ]);
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
