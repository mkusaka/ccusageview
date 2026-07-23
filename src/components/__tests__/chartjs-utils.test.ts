import { describe, expect, it } from "vitest";

import {
  buildExternalTooltipSignature,
  getActiveDataIndex,
  shouldSyncChartHover,
} from "../chartjs-utils";

describe("getActiveDataIndex", () => {
  it("returns the first active element index", () => {
    expect(getActiveDataIndex([{ index: 2 }])).toBe(2);
  });

  it("returns null when there are no active elements", () => {
    expect(getActiveDataIndex([])).toBeNull();
  });
});

describe("shouldSyncChartHover", () => {
  it("skips the chart that originated the hover state", () => {
    expect(shouldSyncChartHover("cost", "cost")).toBe(false);
  });

  it("syncs other charts and clear events", () => {
    expect(shouldSyncChartHover("cost", "tokens")).toBe(true);
    expect(shouldSyncChartHover(null, "cost")).toBe(true);
  });
});

describe("buildExternalTooltipSignature", () => {
  const item = {
    dataIndex: 2,
    datasetIndex: 1,
    value: 42,
    label: "Input",
    color: "#3b82f6",
  };

  it("is stable for unchanged tooltip content", () => {
    expect(buildExternalTooltipSignature(["2026-07-24"], [item])).toBe(
      buildExternalTooltipSignature(["2026-07-24"], [{ ...item }]),
    );
  });

  it("changes when displayed content changes", () => {
    const signature = buildExternalTooltipSignature(["2026-07-24"], [item]);

    expect(buildExternalTooltipSignature(["2026-07-25"], [item])).not.toBe(signature);
    expect(buildExternalTooltipSignature(["2026-07-24"], [{ ...item, value: 43 }])).not.toBe(
      signature,
    );
    expect(buildExternalTooltipSignature(["2026-07-24"], [{ ...item, color: "#22c55e" }])).not.toBe(
      signature,
    );
  });
});
