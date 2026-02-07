import { describe, it, expect } from "vitest";
import { detectReportType } from "../detect";
import { rawDaily, rawWeekly, rawMonthly, rawSession, rawBlocks } from "./fixtures";

describe("detectReportType", () => {
  it("detects daily report", () => {
    const result = detectReportType(rawDaily());
    expect(result.type).toBe("daily");
  });

  it("detects weekly report", () => {
    const result = detectReportType(rawWeekly());
    expect(result.type).toBe("weekly");
  });

  it("detects monthly report", () => {
    const result = detectReportType(rawMonthly());
    expect(result.type).toBe("monthly");
  });

  it("detects session report", () => {
    const result = detectReportType(rawSession());
    expect(result.type).toBe("session");
  });

  it("detects blocks report", () => {
    const result = detectReportType(rawBlocks());
    expect(result.type).toBe("blocks");
  });

  it("throws on null input", () => {
    expect(() => detectReportType(null)).toThrow("Invalid JSON: expected an object");
  });

  it("throws on non-object input", () => {
    expect(() => detectReportType("string")).toThrow("Invalid JSON: expected an object");
    expect(() => detectReportType(42)).toThrow("Invalid JSON: expected an object");
  });

  it("throws on unrecognized format", () => {
    expect(() => detectReportType({ foo: "bar" })).toThrow("Unrecognized report format");
  });

  it("throws when key exists but is not an array", () => {
    expect(() => detectReportType({ daily: "not-array" })).toThrow("Unrecognized report format");
  });

  it("preserves original data alongside type field", () => {
    const raw = rawDaily();
    const result = detectReportType(raw);
    expect(result).toMatchObject({ ...raw, type: "daily" });
  });

  it("snapshot: detected daily report shape", () => {
    const result = detectReportType(rawDaily());
    expect(result).toMatchSnapshot();
  });
});
