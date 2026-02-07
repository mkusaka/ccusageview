import { describe, it, expect } from "vitest";
import { parseInputs, createSourceInput } from "../App";
import type { SourceInput } from "../App";

// Minimal valid daily report in claude format
const DAILY_CLAUDE = JSON.stringify({
  daily: [
    {
      date: "2025-07-01",
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 10,
      cacheReadTokens: 200,
      totalTokens: 360,
      totalCost: 0.5,
      modelsUsed: ["claude-sonnet-4-5"],
      modelBreakdowns: [
        {
          modelName: "claude-sonnet-4-5",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 10,
          cacheReadTokens: 200,
          cost: 0.5,
        },
      ],
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
});

const DAILY_CLAUDE_2 = JSON.stringify({
  daily: [
    {
      date: "2025-07-02",
      inputTokens: 200,
      outputTokens: 100,
      cacheCreationTokens: 20,
      cacheReadTokens: 400,
      totalTokens: 720,
      totalCost: 1.0,
      modelsUsed: ["claude-haiku-3"],
      modelBreakdowns: [],
    },
  ],
  totals: {
    inputTokens: 200,
    outputTokens: 100,
    cacheCreationTokens: 20,
    cacheReadTokens: 400,
    totalTokens: 720,
    totalCost: 1.0,
  },
});

const SESSION_REPORT = JSON.stringify({
  sessions: [
    {
      sessionId: "abc123def456ghi789jkl012mno345",
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 10,
      cacheReadTokens: 200,
      totalTokens: 360,
      totalCost: 0.5,
      lastActivity: "2025-07-01T10:00:00Z",
      modelsUsed: ["claude-sonnet-4-5"],
      modelBreakdowns: [],
      projectPath: "/home/user/project",
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
});

// Codex format daily report
const DAILY_CODEX = JSON.stringify({
  daily: [
    {
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
    },
  ],
  totals: {
    inputTokens: 361481,
    cachedInputTokens: 300928,
    outputTokens: 7058,
    totalTokens: 368539,
    costUSD: 0.18388725,
  },
});

function inp(content: string, label = "", enabled = true): SourceInput {
  return createSourceInput({ label, content, enabled });
}

describe("parseInputs", () => {
  describe("empty / blank inputs", () => {
    it("returns null data and null error for empty input array", () => {
      const result = parseInputs([]);
      expect(result).toEqual({ data: null, error: null });
    });

    it("returns null data for blank content", () => {
      const result = parseInputs([inp(""), inp("   ")]);
      expect(result).toEqual({ data: null, error: null });
    });
  });

  describe("invalid JSON", () => {
    it("returns error for malformed JSON", () => {
      const result = parseInputs([inp("{bad json}")]);
      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  describe("single source", () => {
    it("parses a single claude daily report", () => {
      const result = parseInputs([inp(DAILY_CLAUDE)]);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.reportType).toBe("daily");
      expect(result.data!.entries).toHaveLength(1);
      expect(result.data!.entries[0].label).toBe("2025-07-01");
      expect(result.data!.entries[0].cost).toBe(0.5);
      expect(result.data!.totals.totalCost).toBe(0.5);
    });

    it("parses a single codex daily report via adapter", () => {
      const result = parseInputs([inp(DAILY_CODEX)]);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.reportType).toBe("daily");
      expect(result.data!.entries).toHaveLength(1);
      expect(result.data!.entries[0].label).toBe("2025-09-16");
      expect(result.data!.entries[0].cost).toBe(0.18388725);
      expect(result.data!.entries[0].models).toEqual(["gpt-5-codex"]);
    });

    it("collects source labels", () => {
      const result = parseInputs([inp(DAILY_CLAUDE, "Claude Code")]);
      expect(result.data!.sourceLabels).toEqual(["Claude Code"]);
    });

    it("omits empty labels from sourceLabels", () => {
      const result = parseInputs([inp(DAILY_CLAUDE, "")]);
      expect(result.data!.sourceLabels).toEqual([]);
    });
  });

  describe("jq -s style array input", () => {
    it("handles an array of reports as single input", () => {
      const arr = JSON.stringify([JSON.parse(DAILY_CLAUDE), JSON.parse(DAILY_CLAUDE_2)]);
      const result = parseInputs([inp(arr)]);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.reportType).toBe("daily");
      // Two reports merged: entries for 2025-07-01 and 2025-07-02
      expect(result.data!.entries).toHaveLength(2);
    });
  });

  describe("multi-source merge", () => {
    it("merges two same-type reports from separate tabs", () => {
      const result = parseInputs([inp(DAILY_CLAUDE, "Claude"), inp(DAILY_CLAUDE_2, "OpenCode")]);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.reportType).toBe("daily");
      expect(result.data!.entries).toHaveLength(2);
      expect(result.data!.sourceLabels).toEqual(["Claude", "OpenCode"]);
    });

    it("sums totals from merged entries", () => {
      const result = parseInputs([inp(DAILY_CLAUDE), inp(DAILY_CLAUDE_2)]);
      expect(result.data!.totals.inputTokens).toBe(300);
      expect(result.data!.totals.totalCost).toBe(1.5);
    });

    it("merges codex and claude reports of same type", () => {
      const result = parseInputs([inp(DAILY_CLAUDE, "Claude"), inp(DAILY_CODEX, "Codex")]);
      expect(result.error).toBeNull();
      expect(result.data!.reportType).toBe("daily");
      expect(result.data!.entries).toHaveLength(2);
      expect(result.data!.sourceLabels).toEqual(["Claude", "Codex"]);
    });
  });

  describe("type mismatch error", () => {
    it("rejects different report types", () => {
      const result = parseInputs([inp(DAILY_CLAUDE), inp(SESSION_REPORT)]);
      expect(result.data).toBeNull();
      expect(result.error).toContain("Cannot merge different report types");
    });
  });

  describe("enabled toggle", () => {
    it("skips disabled inputs", () => {
      const result = parseInputs([inp(DAILY_CLAUDE, "", false), inp(DAILY_CLAUDE_2)]);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.entries).toHaveLength(1);
      expect(result.data!.entries[0].label).toBe("2025-07-02");
    });

    it("returns null data when all inputs are disabled", () => {
      const result = parseInputs([inp(DAILY_CLAUDE, "", false), inp(DAILY_CLAUDE_2, "", false)]);
      expect(result).toEqual({ data: null, error: null });
    });

    it("merges only enabled inputs", () => {
      const result = parseInputs([
        inp(DAILY_CLAUDE, "A"),
        inp(DAILY_CLAUDE_2, "B", false),
        inp(DAILY_CODEX, "C"),
      ]);
      expect(result.error).toBeNull();
      expect(result.data!.entries).toHaveLength(2);
      expect(result.data!.sourceLabels).toEqual(["A", "C"]);
    });
  });

  describe("unrecognized format error", () => {
    it("returns error for unknown object shape", () => {
      const result = parseInputs([inp(JSON.stringify({ foo: "bar" }))]);
      expect(result.data).toBeNull();
      expect(result.error).toContain("Unrecognized report format");
    });
  });
});
