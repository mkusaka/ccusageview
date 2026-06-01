import { describe, expect, it } from "vitest";
import type { MouseHandlerDataParam } from "recharts";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  syncTooltipByIndexToLocalCoordinate,
} from "../recharts-components";

const chartComponentExports = [
  ["Area", Area],
  ["AreaChart", AreaChart],
  ["Bar", Bar],
  ["BarChart", BarChart],
  ["CartesianGrid", CartesianGrid],
  ["Cell", Cell],
  ["Legend", Legend],
  ["Pie", Pie],
  ["PieChart", PieChart],
  ["ReferenceLine", ReferenceLine],
  ["ResponsiveContainer", ResponsiveContainer],
  ["Tooltip", Tooltip],
  ["XAxis", XAxis],
  ["YAxis", YAxis],
] as const;

describe("recharts-components", () => {
  it.each(chartComponentExports)("keeps %s on direct exports", (name, component) => {
    const reactLazyType = Symbol.for("react.lazy");

    expect(
      component,
      `${name} must not be React.lazy; lazy wrappers can retrigger React error #185 on ccost JSON dashboards`,
    ).not.toHaveProperty("$$typeof", reactLazyType);
  });

  it("syncs by tooltip index even when tick labels are duplicated", () => {
    const ticks = [{ value: "same" }, { value: "same" }, { value: "other" }];

    expect(syncTooltipByIndexToLocalCoordinate(ticks, syncData(1))).toBe(1);
  });

  it("deactivates sync when tooltip index is invalid", () => {
    const ticks = [{ value: "first" }];

    expect(syncTooltipByIndexToLocalCoordinate(ticks, syncData(undefined))).toBe(-1);
    expect(syncTooltipByIndexToLocalCoordinate(ticks, syncData(-1))).toBe(-1);
    expect(syncTooltipByIndexToLocalCoordinate(ticks, syncData(1))).toBe(-1);
  });
});

function syncData(
  activeTooltipIndex: MouseHandlerDataParam["activeTooltipIndex"],
): MouseHandlerDataParam {
  return {
    activeTooltipIndex,
    activeIndex: activeTooltipIndex,
    isTooltipActive: true,
    activeLabel: undefined,
    activeDataKey: undefined,
    activeCoordinate: undefined,
  };
}
