import { lazy, type ComponentType } from "react";

type RechartsModule = typeof import("recharts");
type LazyRechartsComponent = ComponentType<Record<string, unknown>>;

interface RechartsPayloadItem {
  dataKey?: string | number;
  payload?: Record<string, unknown>;
  color?: string;
  name?: string | number;
}

export interface RechartsTooltipProps {
  active?: boolean;
  payload?: RechartsPayloadItem[];
  label?: string | number;
}

function lazyRechartsComponent(name: keyof RechartsModule) {
  return lazy(async () => {
    const recharts = await import("recharts");
    return {
      default: recharts[name] as unknown as LazyRechartsComponent,
    };
  });
}

export const Area = lazyRechartsComponent("Area");
export const AreaChart = lazyRechartsComponent("AreaChart");
export const Bar = lazyRechartsComponent("Bar");
export const BarChart = lazyRechartsComponent("BarChart");
export const CartesianGrid = lazyRechartsComponent("CartesianGrid");
export const Cell = lazyRechartsComponent("Cell");
export const Legend = lazyRechartsComponent("Legend");
export const Pie = lazyRechartsComponent("Pie");
export const PieChart = lazyRechartsComponent("PieChart");
export const ReferenceLine = lazyRechartsComponent("ReferenceLine");
export const ResponsiveContainer = lazyRechartsComponent("ResponsiveContainer");
export const Tooltip = lazyRechartsComponent("Tooltip");
export const XAxis = lazyRechartsComponent("XAxis");
export const YAxis = lazyRechartsComponent("YAxis");
