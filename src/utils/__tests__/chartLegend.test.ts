import { describe, expect, it } from "vitest";
import { getNextHiddenSeriesForLabelClick } from "../chartLegend";

describe("getNextHiddenSeriesForLabelClick", () => {
  const keys = ["a", "b", "c"];

  it("shows only the clicked series", () => {
    expect(getNextHiddenSeriesForLabelClick(new Set(), keys, "b")).toEqual(new Set(["a", "c"]));
  });

  it("restores all series when the only visible series is clicked again", () => {
    expect(getNextHiddenSeriesForLabelClick(new Set(["a", "c"]), keys, "b")).toEqual(new Set());
  });

  it("preserves hidden series outside the current legend", () => {
    expect(getNextHiddenSeriesForLabelClick(new Set(["legacy", "a"]), keys, "b")).toEqual(
      new Set(["legacy", "a", "c"]),
    );
  });

  it("restores only the current legend when the clicked series is the only visible one", () => {
    expect(getNextHiddenSeriesForLabelClick(new Set(["legacy", "a", "c"]), keys, "b")).toEqual(
      new Set(["legacy"]),
    );
  });
});
