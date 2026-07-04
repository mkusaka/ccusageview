import { describe, expect, it } from "vitest";

import { getActiveDataIndex } from "../chartjs-utils";

describe("getActiveDataIndex", () => {
  it("returns the first active element index", () => {
    expect(getActiveDataIndex([{ index: 2 }])).toBe(2);
  });

  it("returns null when there are no active elements", () => {
    expect(getActiveDataIndex([])).toBeNull();
  });
});
