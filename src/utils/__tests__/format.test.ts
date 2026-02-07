import { describe, it, expect } from "vitest";
import { formatCost, formatTokens, formatDate, formatMonth } from "../format";

describe("formatCost", () => {
  it("formats small values with 2 decimal places", () => {
    expect(formatCost(0)).toMatchInlineSnapshot(`"$0.00"`);
    expect(formatCost(1.5)).toMatchInlineSnapshot(`"$1.50"`);
    expect(formatCost(0.01)).toMatchInlineSnapshot(`"$0.01"`);
  });

  it("formats large values with commas", () => {
    expect(formatCost(1234.56)).toMatchInlineSnapshot(`"$1,234.56"`);
    expect(formatCost(99999.99)).toMatchInlineSnapshot(`"$99,999.99"`);
  });
});

describe("formatTokens", () => {
  it("formats billions", () => {
    expect(formatTokens(1_500_000_000)).toMatchInlineSnapshot(`"1.5B"`);
    expect(formatTokens(2_000_000_000)).toMatchInlineSnapshot(`"2.0B"`);
  });

  it("formats millions", () => {
    expect(formatTokens(45_736_126)).toMatchInlineSnapshot(`"45.7M"`);
    expect(formatTokens(1_000_000)).toMatchInlineSnapshot(`"1.0M"`);
  });

  it("formats thousands", () => {
    expect(formatTokens(5_432)).toMatchInlineSnapshot(`"5.4K"`);
    expect(formatTokens(1_000)).toMatchInlineSnapshot(`"1.0K"`);
  });

  it("formats small values as-is", () => {
    expect(formatTokens(0)).toMatchInlineSnapshot(`"0"`);
    expect(formatTokens(999)).toMatchInlineSnapshot(`"999"`);
    expect(formatTokens(42)).toMatchInlineSnapshot(`"42"`);
  });
});

describe("formatDate", () => {
  it("formats YYYY-MM-DD to short date", () => {
    expect(formatDate("2025-07-07")).toMatchInlineSnapshot(`"Jul 7"`);
    expect(formatDate("2025-01-15")).toMatchInlineSnapshot(`"Jan 15"`);
  });

  it("returns input for invalid date strings", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDate("")).toBe("");
  });
});

describe("formatMonth", () => {
  it("formats YYYY-MM to month + year", () => {
    expect(formatMonth("2025-07")).toMatchInlineSnapshot(`"Jul 2025"`);
    expect(formatMonth("2025-12")).toMatchInlineSnapshot(`"Dec 2025"`);
  });

  it("returns input for invalid month strings", () => {
    expect(formatMonth("invalid")).toBe("invalid");
  });
});
