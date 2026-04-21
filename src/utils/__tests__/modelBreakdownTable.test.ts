import { describe, expect, it } from "vitest";
import {
  createInitialModelBreakdownSortState,
  getNextModelBreakdownSortState,
} from "../modelBreakdownTable";

describe("createInitialModelBreakdownSortState", () => {
  it("starts with cost descending", () => {
    expect(createInitialModelBreakdownSortState()).toEqual({
      sortCol: "cost",
      sortDir: "desc",
      metric: "cost",
    });
  });
});

describe("getNextModelBreakdownSortState", () => {
  it("switches numeric columns in descending order and updates pie metric", () => {
    const next = getNextModelBreakdownSortState(
      createInitialModelBreakdownSortState(),
      "inputTokens",
    );

    expect(next).toEqual({
      sortCol: "inputTokens",
      sortDir: "desc",
      metric: "inputTokens",
    });
  });

  it("keeps the current pie metric when sorting by label", () => {
    const current = getNextModelBreakdownSortState(
      createInitialModelBreakdownSortState(),
      "outputTokens",
    );

    expect(getNextModelBreakdownSortState(current, "label")).toEqual({
      sortCol: "label",
      sortDir: "asc",
      metric: "outputTokens",
    });
  });

  it("toggles the direction when the same column is clicked repeatedly", () => {
    const current = getNextModelBreakdownSortState(createInitialModelBreakdownSortState(), "label");

    expect(getNextModelBreakdownSortState(current, "label")).toEqual({
      sortCol: "label",
      sortDir: "desc",
      metric: "cost",
    });
  });
});
