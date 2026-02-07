import { describe, it, expect } from "vitest";
import { buildHashPayload, restoreFromHash, createSourceInput } from "../App";
import type { SourceInput } from "../App";

function inp(content: string, label = "", enabled = true): SourceInput {
  return createSourceInput({ label, content, enabled });
}

const REPORT_A = JSON.stringify({ daily: [{ date: "2025-07-01" }], totals: {} });
const REPORT_B = JSON.stringify({ daily: [{ date: "2025-07-02" }], totals: {} });

describe("buildHashPayload", () => {
  it("returns null for all-empty inputs", () => {
    expect(buildHashPayload([inp(""), inp("  ")])).toBeNull();
  });

  it("returns raw content for single unlabeled source", () => {
    const result = buildHashPayload([inp(REPORT_A)]);
    expect(result).toBe(REPORT_A);
  });

  it("returns sources format for labeled source", () => {
    const result = buildHashPayload([inp(REPORT_A, "Claude")])!;
    const parsed = JSON.parse(result);
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0].label).toBe("Claude");
    expect(parsed.sources[0].data).toEqual(JSON.parse(REPORT_A));
  });

  it("returns array format for multiple unlabeled sources", () => {
    const result = buildHashPayload([inp(REPORT_A), inp(REPORT_B)])!;
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it("returns sources format when any source has a label", () => {
    const result = buildHashPayload([inp(REPORT_A, "Claude"), inp(REPORT_B)])!;
    const parsed = JSON.parse(result);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].label).toBe("Claude");
    expect(parsed.sources[1].label).toBe("");
  });

  it("skips empty inputs in multi-source", () => {
    const result = buildHashPayload([inp(""), inp(REPORT_A), inp("  ")])!;
    // Single non-empty, no label → raw content
    expect(result).toBe(REPORT_A);
  });
});

describe("restoreFromHash", () => {
  it("returns null for invalid JSON", () => {
    expect(restoreFromHash("{bad}")).toBeNull();
  });

  describe("labeled format", () => {
    it("restores sources with labels", () => {
      const json = JSON.stringify({
        sources: [
          { label: "Claude", data: { daily: [] } },
          { label: "OpenCode", data: { daily: [] } },
        ],
      });
      const result = restoreFromHash(json)!;
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe("Claude");
      expect(result[1].label).toBe("OpenCode");
      expect(JSON.parse(result[0].content)).toEqual({ daily: [] });
    });

    it("defaults missing label to empty string", () => {
      const json = JSON.stringify({
        sources: [{ data: { daily: [] } }],
      });
      const result = restoreFromHash(json)!;
      expect(result[0].label).toBe("");
    });
  });

  describe("array format", () => {
    it("restores array of reports as separate inputs", () => {
      const json = JSON.stringify([
        { daily: [{ date: "2025-07-01" }] },
        { daily: [{ date: "2025-07-02" }] },
      ]);
      const result = restoreFromHash(json)!;
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe("");
      expect(result[1].label).toBe("");
      expect(JSON.parse(result[0].content)).toHaveProperty("daily");
    });

    it("treats array of non-report objects as legacy single report", () => {
      const json = JSON.stringify([1, 2, 3]);
      const result = restoreFromHash(json)!;
      // Not recognized as report array → falls through to legacy
      expect(result).toHaveLength(1);
      expect(JSON.parse(result[0].content)).toEqual([1, 2, 3]);
    });
  });

  describe("legacy single report", () => {
    it("restores single report as one input", () => {
      const json = JSON.stringify({ daily: [{ date: "2025-07-01" }], totals: {} });
      const result = restoreFromHash(json)!;
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("");
      expect(JSON.parse(result[0].content)).toHaveProperty("daily");
    });
  });

  describe("restores with enabled: true", () => {
    it("labeled format includes enabled: true", () => {
      const json = JSON.stringify({
        sources: [{ label: "A", data: { daily: [] } }],
      });
      const result = restoreFromHash(json)!;
      expect(result[0].enabled).toBe(true);
    });

    it("array format includes enabled: true", () => {
      const json = JSON.stringify([{ daily: [{ date: "2025-07-01" }] }]);
      const result = restoreFromHash(json)!;
      expect(result[0].enabled).toBe(true);
    });

    it("legacy format includes enabled: true", () => {
      const json = JSON.stringify({ daily: [], totals: {} });
      const result = restoreFromHash(json)!;
      expect(result[0].enabled).toBe(true);
    });
  });

  describe("round-trip with buildHashPayload", () => {
    it("single unlabeled → legacy → restore", () => {
      const inputs = [inp(REPORT_A)];
      const payload = buildHashPayload(inputs)!;
      const restored = restoreFromHash(payload)!;
      expect(restored).toHaveLength(1);
      expect(JSON.parse(restored[0].content)).toEqual(JSON.parse(REPORT_A));
    });

    it("labeled sources → sources format → restore", () => {
      const inputs = [inp(REPORT_A, "Claude"), inp(REPORT_B, "Codex")];
      const payload = buildHashPayload(inputs)!;
      const restored = restoreFromHash(payload)!;
      expect(restored).toHaveLength(2);
      expect(restored[0].label).toBe("Claude");
      expect(restored[1].label).toBe("Codex");
      expect(JSON.parse(restored[0].content)).toEqual(JSON.parse(REPORT_A));
    });

    it("multiple unlabeled → array format → restore", () => {
      const inputs = [inp(REPORT_A), inp(REPORT_B)];
      const payload = buildHashPayload(inputs)!;
      const restored = restoreFromHash(payload)!;
      expect(restored).toHaveLength(2);
      expect(restored[0].label).toBe("");
    });
  });
});
