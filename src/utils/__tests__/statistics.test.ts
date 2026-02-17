import { describe, it, expect } from "vitest";
import {
  percentile,
  computeStats,
  extractMetric,
  computeAllStats,
  buildDistribution,
  findStatSources,
  findRankForValue,
  extractMetricForVisibleModels,
  extractMetricForVisibleModelsWithLabels,
  computeAllStatsForVisibleModels,
  STAT_METRIC_KEYS,
} from "../statistics";
import type { LabeledValue } from "../statistics";
import type { NormalizedEntry } from "../normalize";
import type { ModelBreakdown } from "../../types";

function makeBreakdown(
  modelName: string,
  overrides?: Partial<Omit<ModelBreakdown, "modelName">>,
): ModelBreakdown {
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

describe("buildDistribution", () => {
  it("returns empty array for empty entries", () => {
    expect(buildDistribution([], "cost")).toEqual([]);
  });

  it("returns single point at rank 100 for one entry", () => {
    const entries = [makeEntry("a", { cost: 5 })];
    const result = buildDistribution(entries, "cost");
    expect(result).toEqual([{ rank: 100, value: 5 }]);
  });

  it("returns sorted values with percentile ranks", () => {
    const entries = [
      makeEntry("a", { cost: 30 }),
      makeEntry("b", { cost: 10 }),
      makeEntry("c", { cost: 20 }),
    ];
    const result = buildDistribution(entries, "cost");

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ rank: 0, value: 10 });
    expect(result[1]).toEqual({ rank: 50, value: 20 });
    expect(result[2]).toEqual({ rank: 100, value: 30 });
  });

  it("ranks range from 0 to 100", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry(`e${i}`, { totalTokens: (i + 1) * 100 }),
    );
    const result = buildDistribution(entries, "totalTokens");

    expect(result[0].rank).toBe(0);
    expect(result[result.length - 1].rank).toBe(100);
    // values should be ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeGreaterThanOrEqual(result[i - 1].value);
    }
  });
});

describe("findStatSources", () => {
  it("returns empty object for empty stats", () => {
    const stats = computeStats([]);
    expect(findStatSources([], stats)).toEqual({});
  });

  it("returns min and max labels for simple case", () => {
    const labeled: LabeledValue[] = [
      { label: "2025-01-01", value: 10 },
      { label: "2025-01-02", value: 20 },
      { label: "2025-01-03", value: 30 },
    ];
    const stats = computeStats(labeled.map((v) => v.value));
    const sources = findStatSources(labeled, stats);

    expect(sources.min).toEqual(["2025-01-01"]);
    expect(sources.max).toEqual(["2025-01-03"]);
  });

  it("returns all labels when multiple entries share min/max", () => {
    const labeled: LabeledValue[] = [
      { label: "2025-01-01", value: 5 },
      { label: "2025-01-02", value: 5 },
      { label: "2025-01-03", value: 10 },
      { label: "2025-01-04", value: 10 },
    ];
    const stats = computeStats(labeled.map((v) => v.value));
    const sources = findStatSources(labeled, stats);

    expect(sources.min).toEqual(["2025-01-01", "2025-01-02"]);
    expect(sources.max).toEqual(["2025-01-03", "2025-01-04"]);
  });

  it("returns median label when it matches an exact entry (odd count)", () => {
    const labeled: LabeledValue[] = [
      { label: "a", value: 1 },
      { label: "b", value: 2 },
      { label: "c", value: 3 },
    ];
    const stats = computeStats(labeled.map((v) => v.value));
    const sources = findStatSources(labeled, stats);

    // median of [1,2,3] = 2, which matches entry "b"
    expect(sources.median).toEqual(["b"]);
  });

  it("does not return median when interpolated (even count)", () => {
    const labeled: LabeledValue[] = [
      { label: "a", value: 1 },
      { label: "b", value: 2 },
      { label: "c", value: 3 },
      { label: "d", value: 4 },
    ];
    const stats = computeStats(labeled.map((v) => v.value));
    const sources = findStatSources(labeled, stats);

    // median of [1,2,3,4] = 2.5, no exact match
    expect(sources.median).toBeUndefined();
  });

  it("returns percentile label when it lands on an exact entry", () => {
    // 5 entries: P75 rank = 0.75 * 4 = 3 (exact, sorted[3])
    const labeled: LabeledValue[] = [
      { label: "a", value: 10 },
      { label: "b", value: 20 },
      { label: "c", value: 30 },
      { label: "d", value: 40 },
      { label: "e", value: 50 },
    ];
    const stats = computeStats(labeled.map((v) => v.value));
    const sources = findStatSources(labeled, stats);

    // P75 of [10,20,30,40,50] = sorted[3] = 40
    expect(sources.p75).toEqual(["d"]);
  });

  it("does not return percentile label when interpolated", () => {
    // 4 entries: P75 rank = 0.75 * 3 = 2.25 (interpolated)
    const labeled: LabeledValue[] = [
      { label: "a", value: 10 },
      { label: "b", value: 20 },
      { label: "c", value: 30 },
      { label: "d", value: 40 },
    ];
    const stats = computeStats(labeled.map((v) => v.value));
    const sources = findStatSources(labeled, stats);

    // P75 of [10,20,30,40] = 32.5, no exact match
    expect(sources.p75).toBeUndefined();
  });

  it("handles single entry (all stats point to same label)", () => {
    const labeled: LabeledValue[] = [{ label: "only", value: 42 }];
    const stats = computeStats([42]);
    const sources = findStatSources(labeled, stats);

    expect(sources.min).toEqual(["only"]);
    expect(sources.max).toEqual(["only"]);
    expect(sources.median).toEqual(["only"]);
  });
});

describe("findRankForValue", () => {
  const chartData = [
    { rank: 0, value: 10 },
    { rank: 25, value: 20 },
    { rank: 50, value: 30 },
    { rank: 75, value: 40 },
    { rank: 100, value: 50 },
  ];

  it("returns null for empty data", () => {
    expect(findRankForValue([], 10)).toBeNull();
  });

  it("returns first rank when value equals min", () => {
    expect(findRankForValue(chartData, 10)).toBe(0);
  });

  it("returns last rank when value equals max", () => {
    expect(findRankForValue(chartData, 50)).toBe(100);
  });

  it("returns first rank when value is below min", () => {
    expect(findRankForValue(chartData, 5)).toBe(0);
  });

  it("returns last rank when value is above max", () => {
    expect(findRankForValue(chartData, 100)).toBe(100);
  });

  it("returns exact rank when value matches a data point", () => {
    expect(findRankForValue(chartData, 30)).toBe(50);
  });

  it("interpolates rank between two data points", () => {
    // 25 is between 20 (rank 25) and 30 (rank 50)
    // frac = (25 - 20) / (30 - 20) = 0.5
    // rank = 25 + 0.5 * (50 - 25) = 37.5
    expect(findRankForValue(chartData, 25)).toBe(37.5);
  });

  it("interpolates at quarter point", () => {
    // 15 is between 10 (rank 0) and 20 (rank 25)
    // frac = (15 - 10) / (20 - 10) = 0.5
    // rank = 0 + 0.5 * 25 = 12.5
    expect(findRankForValue(chartData, 15)).toBe(12.5);
  });

  it("handles consecutive equal values", () => {
    const data = [
      { rank: 0, value: 10 },
      { rank: 33, value: 10 },
      { rank: 67, value: 20 },
      { rank: 100, value: 30 },
    ];
    // Value 10 matches first point
    expect(findRankForValue(data, 10)).toBe(0);
    // Value 15 is between 10 (rank 33) and 20 (rank 67)
    expect(findRankForValue(data, 15)).toBe(50);
  });

  it("handles single data point", () => {
    const single = [{ rank: 100, value: 42 }];
    expect(findRankForValue(single, 42)).toBe(100);
    expect(findRankForValue(single, 0)).toBe(100);
    expect(findRankForValue(single, 999)).toBe(100);
  });
});

describe("extractMetricForVisibleModels", () => {
  const entries: NormalizedEntry[] = [
    makeEntry("day1", {
      cost: 10,
      modelBreakdowns: [makeBreakdown("modelA", { cost: 6 }), makeBreakdown("modelB", { cost: 4 })],
    }),
    makeEntry("day2", {
      cost: 20,
      modelBreakdowns: [
        makeBreakdown("modelA", { cost: 12 }),
        makeBreakdown("modelB", { cost: 8 }),
      ],
    }),
    makeEntry("day3", { cost: 5 }), // no breakdowns ("Other")
  ];

  it("returns all visible models' values summed per entry", () => {
    const visible = new Set(["modelA", "modelB"]);
    const result = extractMetricForVisibleModels(entries, "cost", visible, false);
    // day1: 6+4=10, day2: 12+8=20, day3 skipped (no breakdowns, Other=false)
    expect(result).toEqual([10, 20]);
  });

  it("filters to a single model", () => {
    const visible = new Set(["modelA"]);
    const result = extractMetricForVisibleModels(entries, "cost", visible, false);
    expect(result).toEqual([6, 12]);
  });

  it("includes Other entries when includeOther is true", () => {
    const visible = new Set(["modelA"]);
    const result = extractMetricForVisibleModels(entries, "cost", visible, true);
    // day1: modelA=6, day2: modelA=12, day3: Other=5
    expect(result).toEqual([6, 12, 5]);
  });

  it("returns only Other entries when no model names match", () => {
    const visible = new Set(["nonexistent"]);
    const result = extractMetricForVisibleModels(entries, "cost", visible, true);
    // day1 & day2: no match, day3: Other=5
    expect(result).toEqual([5]);
  });

  it("returns empty array when nothing matches", () => {
    const visible = new Set(["nonexistent"]);
    const result = extractMetricForVisibleModels(entries, "cost", visible, false);
    expect(result).toEqual([]);
  });

  it("sums totalTokens from model breakdown fields", () => {
    const ents = [
      makeEntry("x", {
        totalTokens: 999, // aggregate (should not be used)
        modelBreakdowns: [
          makeBreakdown("modelA", {
            inputTokens: 10,
            outputTokens: 20,
            cacheCreationTokens: 5,
            cacheReadTokens: 3,
          }),
        ],
      }),
    ];
    const visible = new Set(["modelA"]);
    const result = extractMetricForVisibleModels(ents, "totalTokens", visible, false);
    // totalTokens = input + output + cacheCreation + cacheRead = 10+20+5+3 = 38
    expect(result).toEqual([38]);
  });

  it("skips entries where no visible model appears in breakdowns", () => {
    const ents = [
      makeEntry("a", {
        cost: 10,
        modelBreakdowns: [makeBreakdown("modelA", { cost: 10 })],
      }),
      makeEntry("b", {
        cost: 20,
        modelBreakdowns: [makeBreakdown("modelB", { cost: 20 })],
      }),
    ];
    const visible = new Set(["modelA"]);
    const result = extractMetricForVisibleModels(ents, "cost", visible, false);
    // Only entry "a" has modelA
    expect(result).toEqual([10]);
  });
});

describe("extractMetricForVisibleModelsWithLabels", () => {
  const entries: NormalizedEntry[] = [
    makeEntry("day1", {
      cost: 10,
      modelBreakdowns: [makeBreakdown("modelA", { cost: 6 }), makeBreakdown("modelB", { cost: 4 })],
    }),
    makeEntry("day2", {
      cost: 20,
      modelBreakdowns: [makeBreakdown("modelA", { cost: 12 })],
    }),
    makeEntry("day3", { cost: 5 }),
  ];

  it("returns labeled values for visible models", () => {
    const visible = new Set(["modelA"]);
    const result = extractMetricForVisibleModelsWithLabels(entries, "cost", visible, false);
    expect(result).toEqual([
      { label: "day1", value: 6 },
      { label: "day2", value: 12 },
    ]);
  });

  it("includes Other entries with labels", () => {
    const visible = new Set(["modelA"]);
    const result = extractMetricForVisibleModelsWithLabels(entries, "cost", visible, true);
    expect(result).toEqual([
      { label: "day1", value: 6 },
      { label: "day2", value: 12 },
      { label: "day3", value: 5 },
    ]);
  });

  it("sums multiple visible models per entry", () => {
    const visible = new Set(["modelA", "modelB"]);
    const result = extractMetricForVisibleModelsWithLabels(entries, "cost", visible, false);
    expect(result).toEqual([
      { label: "day1", value: 10 }, // 6+4
      { label: "day2", value: 12 }, // only modelA
    ]);
  });
});

describe("computeAllStatsForVisibleModels", () => {
  const entries: NormalizedEntry[] = [
    makeEntry("day1", {
      cost: 10,
      inputTokens: 100,
      modelBreakdowns: [
        makeBreakdown("modelA", { cost: 6, inputTokens: 60 }),
        makeBreakdown("modelB", { cost: 4, inputTokens: 40 }),
      ],
    }),
    makeEntry("day2", {
      cost: 20,
      inputTokens: 200,
      modelBreakdowns: [
        makeBreakdown("modelA", { cost: 12, inputTokens: 120 }),
        makeBreakdown("modelB", { cost: 8, inputTokens: 80 }),
      ],
    }),
    makeEntry("day3", {
      cost: 30,
      inputTokens: 300,
      modelBreakdowns: [
        makeBreakdown("modelA", { cost: 18, inputTokens: 180 }),
        makeBreakdown("modelB", { cost: 12, inputTokens: 120 }),
      ],
    }),
  ];

  it("returns stats for all 6 metrics filtered to visible models", () => {
    const visible = new Set(["modelA"]);
    const result = computeAllStatsForVisibleModels(entries, visible, false);

    for (const key of STAT_METRIC_KEYS) {
      expect(result[key]).toBeDefined();
      expect(result[key].count).toBe(3);
    }

    // modelA cost: [6, 12, 18] → mean = 12
    expect(result.cost.mean).toBe(12);
    expect(result.cost.min).toBe(6);
    expect(result.cost.max).toBe(18);

    // modelA inputTokens: [60, 120, 180] → mean = 120
    expect(result.inputTokens.mean).toBe(120);
  });

  it("computes correct stats when filtering to single model", () => {
    const visible = new Set(["modelB"]);
    const result = computeAllStatsForVisibleModels(entries, visible, false);

    // modelB cost: [4, 8, 12] → mean = 8
    expect(result.cost.mean).toBe(8);
    expect(result.cost.min).toBe(4);
    expect(result.cost.max).toBe(12);
  });

  it("sums multiple visible models per entry", () => {
    const visible = new Set(["modelA", "modelB"]);
    const result = computeAllStatsForVisibleModels(entries, visible, false);

    // Combined cost: [10, 20, 30] → mean = 20
    expect(result.cost.mean).toBe(20);
    expect(result.cost.min).toBe(10);
    expect(result.cost.max).toBe(30);
  });

  it("includes Other entries when includeOther is true", () => {
    const entriesWithOther = [
      ...entries,
      makeEntry("day4", { cost: 50, inputTokens: 500 }), // no breakdowns
    ];
    const visible = new Set(["modelA"]);
    const result = computeAllStatsForVisibleModels(entriesWithOther, visible, true);

    // modelA costs: [6, 12, 18] + Other: [50] = 4 entries
    expect(result.cost.count).toBe(4);
    // mean = (6 + 12 + 18 + 50) / 4 = 21.5
    expect(result.cost.mean).toBe(21.5);
  });

  it("excludes Other entries when includeOther is false", () => {
    const entriesWithOther = [...entries, makeEntry("day4", { cost: 50, inputTokens: 500 })];
    const visible = new Set(["modelA"]);
    const result = computeAllStatsForVisibleModels(entriesWithOther, visible, false);

    expect(result.cost.count).toBe(3);
    expect(result.cost.mean).toBe(12);
  });

  it("returns zero-stats when no models match", () => {
    const visible = new Set(["nonexistent"]);
    const result = computeAllStatsForVisibleModels(entries, visible, false);

    for (const key of STAT_METRIC_KEYS) {
      expect(result[key].count).toBe(0);
    }
  });
});
