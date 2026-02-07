import { describe, it, expect } from "vitest";
import { detectReportType } from "../detect.ts";
import { normalizeEntries, normalizeTotals, aggregateToMonthly } from "../normalize.ts";
import dailyJson from "../../../examples/daily.json";
import weeklyJson from "../../../examples/weekly.json";
import monthlyJson from "../../../examples/monthly.json";
import sessionJson from "../../../examples/session.json";
import blocksJson from "../../../examples/blocks.json";

describe("E2E pipeline: example files", () => {
  describe("daily.json", () => {
    const report = detectReportType(dailyJson);

    it("detects as daily", () => {
      expect(report.type).toBe("daily");
    });

    it("normalizes all entries", () => {
      const entries = normalizeEntries(report);
      expect(entries).toHaveLength(3);
      expect(entries[0].label).toBe("2025-07-01");
      expect(entries[1].label).toBe("2025-07-02");
      expect(entries[2].label).toBe("2025-08-01");
    });

    it("computes totals matching source", () => {
      const totals = normalizeTotals(report);
      expect(totals.totalCost).toBe(5.2);
      expect(totals.inputTokens).toBe(1_200_000);
      expect(totals.totalTokens).toBe(3_240_000);
    });

    it("aggregates to monthly", () => {
      const entries = normalizeEntries(report);
      const monthly = aggregateToMonthly(entries);
      expect(monthly).toHaveLength(2);
      expect(monthly[0].label).toBe("2025-07");
      expect(monthly[1].label).toBe("2025-08");
      expect(monthly[0].inputTokens).toBe(1_000_000);
    });

    it("preserves modelBreakdowns through pipeline", () => {
      const entries = normalizeEntries(report);
      expect(entries[0].modelBreakdowns).toHaveLength(2);
      expect(entries[0].modelBreakdowns![0].modelName).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("weekly.json", () => {
    const report = detectReportType(weeklyJson);

    it("detects as weekly", () => {
      expect(report.type).toBe("weekly");
    });

    it("normalizes entries", () => {
      const entries = normalizeEntries(report);
      expect(entries).toHaveLength(1);
      expect(entries[0].label).toBe("2025-06-30");
      expect(entries[0].cost).toBe(4.3);
    });

    it("computes totals", () => {
      const totals = normalizeTotals(report);
      expect(totals.totalCost).toBe(4.3);
      expect(totals.totalTokens).toBe(2_700_000);
    });
  });

  describe("monthly.json", () => {
    const report = detectReportType(monthlyJson);

    it("detects as monthly", () => {
      expect(report.type).toBe("monthly");
    });

    it("normalizes entries", () => {
      const entries = normalizeEntries(report);
      expect(entries).toHaveLength(1);
      expect(entries[0].label).toBe("2025-07");
      expect(entries[0].models).toEqual(["claude-sonnet-4-20250514"]);
    });

    it("computes totals", () => {
      const totals = normalizeTotals(report);
      expect(totals.totalCost).toBe(4.3);
    });
  });

  describe("session.json", () => {
    const report = detectReportType(sessionJson);

    it("detects as session", () => {
      expect(report.type).toBe("session");
    });

    it("normalizes and sorts by lastActivity", () => {
      const entries = normalizeEntries(report);
      expect(entries).toHaveLength(2);
      // Earlier session first (2025-07-01), label from sessionId tail
      expect(entries[0].label).toMatch(/vvv555$/);
      // Later session (2025-07-02), label from projectPath
      expect(entries[1].label).toBe("/home/user/my-project");
    });

    it("computes totals", () => {
      const totals = normalizeTotals(report);
      expect(totals.totalCost).toBe(3.1);
      expect(totals.inputTokens).toBe(700_000);
    });
  });

  describe("blocks.json", () => {
    const report = detectReportType(blocksJson);

    it("detects as blocks", () => {
      expect(report.type).toBe("blocks");
    });

    it("normalizes entries, filtering gaps", () => {
      const entries = normalizeEntries(report);
      expect(entries).toHaveLength(2);
      expect(entries[0].cost).toBe(2.5);
      expect(entries[1].cost).toBe(0.3);
    });

    it("computes totals from non-gap blocks", () => {
      const totals = normalizeTotals(report);
      expect(totals.totalCost).toBe(2.8);
      expect(totals.inputTokens).toBe(600_000);
      expect(totals.cacheCreationTokens).toBe(110_000);
    });
  });

  describe("cross-type consistency", () => {
    it.each([
      ["daily", dailyJson],
      ["weekly", weeklyJson],
      ["monthly", monthlyJson],
      ["session", sessionJson],
      ["blocks", blocksJson],
    ] as const)("%s: produces non-empty normalized entries", (_, data) => {
      const report = detectReportType(data);
      const entries = normalizeEntries(report);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.label).toBeTruthy();
        expect(entry.cost).toBeGreaterThanOrEqual(0);
        expect(entry.totalTokens).toBeGreaterThanOrEqual(0);
        expect(entry.models.length).toBeGreaterThan(0);
      }
    });

    it.each([
      ["daily", dailyJson],
      ["weekly", weeklyJson],
      ["monthly", monthlyJson],
      ["session", sessionJson],
      ["blocks", blocksJson],
    ] as const)("%s: produces valid totals", (_, data) => {
      const report = detectReportType(data);
      const totals = normalizeTotals(report);
      expect(totals.totalCost).toBeGreaterThan(0);
      expect(totals.totalTokens).toBeGreaterThan(0);
      expect(totals.inputTokens).toBeGreaterThan(0);
    });
  });
});
