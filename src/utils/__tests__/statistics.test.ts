import { describe, it, expect } from "vitest";
import {
  percentile,
  computeStats,
  extractMetric,
  computeAllStats,
  STAT_METRIC_KEYS,
} from "../statistics";
import type { NormalizedEntry } from "../normalize";

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

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("returns single value for array of length 1", () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 1)).toBe(42);
  });

  it("returns min for p=0", () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  it("returns max for p=1", () => {
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5);
  });

  it("returns median for p=0.5 with odd count", () => {
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("interpolates median for p=0.5 with even count", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it("computes P90 correctly", () => {
    // [1..10], P90 = 1 + 0.9 * 9 = 9.1
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(data, 0.9)).toBeCloseTo(9.1, 10);
  });

  it("computes P99 correctly", () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    // rank = 0.99 * 99 = 98.01, interp between sorted[98]=99 and sorted[99]=100
    expect(percentile(data, 0.99)).toBeCloseTo(99.01, 10);
  });

  it("handles two values", () => {
    expect(percentile([10, 20], 0.25)).toBeCloseTo(12.5, 10);
    expect(percentile([10, 20], 0.5)).toBe(15);
    expect(percentile([10, 20], 0.75)).toBeCloseTo(17.5, 10);
  });
});

describe("computeStats", () => {
  it("returns zeros/NaN for empty array", () => {
    const stats = computeStats([]);
    expect(stats.count).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.sum).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.standardDeviation).toBe(0);
    expect(stats.coefficientOfVariation).toBeNaN();
    expect(stats.skewness).toBeNaN();
    expect(stats.iqr).toBe(0);
  });

  it("handles single value correctly", () => {
    const stats = computeStats([5]);
    expect(stats.count).toBe(1);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(5);
    expect(stats.sum).toBe(5);
    expect(stats.mean).toBe(5);
    expect(stats.median).toBe(5);
    expect(stats.standardDeviation).toBe(0);
    expect(stats.coefficientOfVariation).toBe(0);
    expect(stats.skewness).toBeNaN();
  });

  it("handles two values", () => {
    const stats = computeStats([10, 20]);
    expect(stats.count).toBe(2);
    expect(stats.mean).toBe(15);
    expect(stats.median).toBe(15);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(20);
    expect(stats.standardDeviation).toBeCloseTo(Math.sqrt(50), 10);
    expect(stats.skewness).toBeNaN(); // n < 3
  });

  it("computes correct stats for [1..10]", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const stats = computeStats(data);

    expect(stats.count).toBe(10);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(10);
    expect(stats.sum).toBe(55);
    expect(stats.mean).toBe(5.5);
    expect(stats.median).toBe(5.5);

    // Sample std dev of [1..10] = sqrt(9.1667) ≈ 3.0277
    expect(stats.standardDeviation).toBeCloseTo(3.0277, 3);

    // Symmetric distribution -> skewness ≈ 0
    expect(stats.skewness).toBeCloseTo(0, 5);

    // IQR
    expect(stats.p25).toBeCloseTo(3.25, 10);
    expect(stats.p75).toBeCloseTo(7.75, 10);
    expect(stats.iqr).toBeCloseTo(4.5, 10);
  });

  it("detects right-skewed distribution", () => {
    const data = [1, 1, 1, 1, 1, 1, 1, 100];
    const stats = computeStats(data);
    expect(stats.skewness).toBeGreaterThan(0);
  });

  it("detects left-skewed distribution", () => {
    const data = [1, 100, 100, 100, 100, 100, 100, 100];
    const stats = computeStats(data);
    expect(stats.skewness).toBeLessThan(0);
  });

  it("computes coefficient of variation correctly", () => {
    const data = [10, 20, 30];
    const stats = computeStats(data);
    expect(stats.coefficientOfVariation).toBeCloseTo(stats.standardDeviation / stats.mean, 10);
  });

  it("returns NaN for CV when mean is 0", () => {
    const data = [0, 0, 0];
    const stats = computeStats(data);
    expect(stats.coefficientOfVariation).toBeNaN();
  });

  it("does not mutate input array", () => {
    const data = [5, 3, 1, 4, 2];
    const copy = [...data];
    computeStats(data);
    expect(data).toEqual(copy);
  });
});

describe("extractMetric", () => {
  it("extracts cost values from entries", () => {
    const entries = [makeEntry("a", { cost: 1.5 }), makeEntry("b", { cost: 2.5 })];
    expect(extractMetric(entries, "cost")).toEqual([1.5, 2.5]);
  });

  it("extracts inputTokens values from entries", () => {
    const entries = [makeEntry("a", { inputTokens: 100 }), makeEntry("b", { inputTokens: 200 })];
    expect(extractMetric(entries, "inputTokens")).toEqual([100, 200]);
  });

  it("returns empty array for empty entries", () => {
    expect(extractMetric([], "cost")).toEqual([]);
  });

  it("extracts all supported metrics", () => {
    const entry = makeEntry("a", {
      cost: 1,
      totalTokens: 2,
      inputTokens: 3,
      outputTokens: 4,
      cacheCreationTokens: 5,
      cacheReadTokens: 6,
    });
    expect(extractMetric([entry], "cost")).toEqual([1]);
    expect(extractMetric([entry], "totalTokens")).toEqual([2]);
    expect(extractMetric([entry], "inputTokens")).toEqual([3]);
    expect(extractMetric([entry], "outputTokens")).toEqual([4]);
    expect(extractMetric([entry], "cacheCreationTokens")).toEqual([5]);
    expect(extractMetric([entry], "cacheReadTokens")).toEqual([6]);
  });
});

describe("computeAllStats", () => {
  it("returns stats for all 6 metrics", () => {
    const entries = [
      makeEntry("a", {
        cost: 1,
        totalTokens: 10,
        inputTokens: 5,
        outputTokens: 3,
        cacheCreationTokens: 1,
        cacheReadTokens: 1,
      }),
      makeEntry("b", {
        cost: 2,
        totalTokens: 20,
        inputTokens: 10,
        outputTokens: 6,
        cacheCreationTokens: 2,
        cacheReadTokens: 2,
      }),
      makeEntry("c", {
        cost: 3,
        totalTokens: 30,
        inputTokens: 15,
        outputTokens: 9,
        cacheCreationTokens: 3,
        cacheReadTokens: 3,
      }),
    ];
    const result = computeAllStats(entries);

    for (const key of STAT_METRIC_KEYS) {
      expect(result[key]).toBeDefined();
      expect(result[key].count).toBe(3);
    }

    expect(result.cost.mean).toBe(2);
    expect(result.totalTokens.mean).toBe(20);
    expect(result.inputTokens.mean).toBe(10);
  });

  it("returns correct count matching entries.length", () => {
    const entries = [
      makeEntry("a"),
      makeEntry("b"),
      makeEntry("c"),
      makeEntry("d"),
      makeEntry("e"),
    ];
    const result = computeAllStats(entries);

    for (const key of STAT_METRIC_KEYS) {
      expect(result[key].count).toBe(5);
    }
  });
});
