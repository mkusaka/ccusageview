import { describe, expect, it } from "vitest";
import { defaultPickerTab, isPickerSelectionAvailable } from "../pickerSelection";
import type { AnalysisAvailability } from "../dashboardCatalog";

const daily: AnalysisAvailability = {
  reportType: "daily",
  hasModelData: false,
  hasAgentData: false,
  hasMultipleSources: false,
};
const charts = ["analysis", "cost"] as const;
const ranges = ["dashboard", "all"] as const;

function available(
  tab: "periodCostPerMillion" | "modelCostPerMillion" | "sourceTokenMix",
  metadata: AnalysisAvailability,
  chartGranularity?: "hourly" | "weekly",
): boolean {
  return isPickerSelectionAvailable(
    { chart: "analysis", tab, range: "dashboard", chartGranularity },
    [...charts],
    [...ranges],
    metadata,
  );
}

describe("analysis picker availability", () => {
  it("selects the first axis actually backed by the report", () => {
    expect(defaultPickerTab("analysis", daily)).toBe("periodCostPerMillion");
    expect(defaultPickerTab("analysis", { ...daily, hasModelData: true })).toBe("modelTokenMix");
    expect(defaultPickerTab("analysis", { ...daily, reportType: "session" })).toBeUndefined();
  });

  it("rejects missing model/source data and unsupported per-chart time grouping", () => {
    expect(available("modelCostPerMillion", daily)).toBe(false);
    expect(available("sourceTokenMix", daily)).toBe(false);
    expect(available("sourceTokenMix", { ...daily, hasMultipleSources: true })).toBe(true);
    expect(available("periodCostPerMillion", daily, "hourly")).toBe(false);
    expect(available("periodCostPerMillion", daily, "weekly")).toBe(true);
    expect(available("periodCostPerMillion", { ...daily, reportType: "session" })).toBe(false);
  });

  it("keeps analysis-only time grouping out of existing charts", () => {
    expect(
      isPickerSelectionAvailable(
        { chart: "cost", tab: "total", range: "all", chartGranularity: "weekly" },
        [...charts],
        [...ranges],
        daily,
      ),
    ).toBe(false);
  });

  it("offers grouped or stacked token comparisons but not stacked ratios or categorical lines", () => {
    const metadata = { ...daily, hasModelData: true };
    const choose = (
      tab: "modelTokenMix" | "modelCostPerMillion" | "periodCostPerMillion",
      presentation: "bar" | "line" | "stackedBar",
    ) =>
      isPickerSelectionAvailable(
        { chart: "analysis", tab, range: "all", presentation },
        [...charts],
        [...ranges],
        metadata,
      );

    expect(choose("modelTokenMix", "bar")).toBe(true);
    expect(choose("modelTokenMix", "stackedBar")).toBe(true);
    expect(choose("modelTokenMix", "line")).toBe(false);
    expect(choose("modelCostPerMillion", "stackedBar")).toBe(false);
    expect(choose("periodCostPerMillion", "line")).toBe(true);
    expect(choose("periodCostPerMillion", "bar")).toBe(true);
  });

  it("permits independent lines and side-by-side bars for time-series but not stacked totals", () => {
    expect(
      isPickerSelectionAvailable(
        { chart: "cost", tab: "model", range: "all", presentation: "line" },
        [...charts],
        [...ranges],
        { ...daily, hasModelData: true },
      ),
    ).toBe(true);
    expect(
      isPickerSelectionAvailable(
        { chart: "cost", tab: "total", range: "all", presentation: "stackedBar" },
        [...charts],
        [...ranges],
        daily,
      ),
    ).toBe(false);
  });
});
