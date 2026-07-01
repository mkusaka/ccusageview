import { describe, expect, it } from "vitest";
import { getProjectionInfo, getProjectionMetrics } from "../projection";

describe("getProjectionInfo", () => {
  it("projects the current daily bucket from elapsed time", () => {
    const now = new Date(2026, 6, 2, 12);
    const projection = getProjectionInfo("2026-07-02", "daily", now);

    expect(projection).toMatchObject({
      sourceLabel: "2026-07-02",
    });
    expect(projection!.elapsedRatio).toBeCloseTo(0.5);
    expect(projection!.multiplier).toBeCloseTo(2);
  });

  it("projects the current weekly bucket from the Monday start", () => {
    const now = new Date(2026, 6, 8);
    const projection = getProjectionInfo("2026-07-06", "weekly", now);

    expect(projection!.elapsedRatio).toBeCloseTo(2 / 7);
    expect(projection!.multiplier).toBeCloseTo(3.5);
  });

  it("projects the current monthly bucket from elapsed days", () => {
    const now = new Date(2026, 6, 16, 12);
    const projection = getProjectionInfo("2026-07", "monthly", now);

    expect(projection!.elapsedRatio).toBeCloseTo(0.5);
    expect(projection!.multiplier).toBeCloseTo(2);
  });

  it("does not project past buckets", () => {
    const now = new Date(2026, 6, 2, 12);

    expect(getProjectionInfo("2026-07-01", "daily", now)).toBeNull();
    expect(getProjectionInfo("2026-06-22", "weekly", now)).toBeNull();
    expect(getProjectionInfo("2026-06", "monthly", now)).toBeNull();
  });
});

describe("getProjectionMetrics", () => {
  it("returns projected and remaining values for requested metric keys", () => {
    const now = new Date(2026, 6, 2, 12);
    const result = getProjectionMetrics(
      { label: "2026-07-02", cost: 5, inputTokens: 500 },
      ["cost", "inputTokens"],
      "daily",
      now,
    );

    expect(result.projected).toEqual({ cost: 10, inputTokens: 1000 });
    expect(result.remaining).toEqual({ cost: 5, inputTokens: 500 });
  });

  it("returns empty values when projection is not available", () => {
    const now = new Date(2026, 6, 2, 12);

    expect(getProjectionMetrics({ label: "2026-07-01", cost: 4 }, ["cost"], "daily", now)).toEqual({
      projection: null,
      projected: {},
      remaining: {},
    });
  });
});
