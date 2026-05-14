import { describe, expect, it } from "vitest";
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
  it("keeps Recharts primitives on direct exports", () => {
    const reactLazyType = Symbol.for("react.lazy");

    for (const [name, component] of chartComponentExports) {
      expect(
        component,
        `${name} must not be React.lazy; lazy wrappers can retrigger React error #185 on ccost JSON dashboards`,
      ).not.toHaveProperty("$$typeof", reactLazyType);
    }
  });
});
