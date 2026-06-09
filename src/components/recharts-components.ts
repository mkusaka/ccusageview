import type { MouseHandlerDataParam } from "recharts";

// Recharts child components must stay on the original module exports. Wrapping
// them individually in React.lazy remounts Recharts internals and can trigger
// React error #185 through the chart wrapper ref path.
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
export {
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
} from "recharts";

// Recharts' built-in "index" sync scales the source chart's active coordinate
// into receivers. A custom method keeps index matching but lets receivers use
// their own categorical coordinate, which avoids AreaChart/BarChart cursor drift.
export function syncTooltipByIndexToLocalCoordinate(
  ticks: ReadonlyArray<unknown>,
  data: MouseHandlerDataParam,
): number {
  const index = Number(data.activeTooltipIndex);
  if (!Number.isInteger(index) || index < 0 || index >= ticks.length) return -1;
  return index;
}

interface RechartsPayloadItem<TPayload extends Record<string, string | number>> {
  // Recharts 3.8 widened payload `dataKey` to `DataKey<any>`, which includes the
  // function accessor form. Mirror it here so our tooltip-content callbacks stay
  // assignable to Recharts' `ContentType` (the param type must remain a supertype
  // of Recharts' TooltipContentProps). We only ever read string dataKeys at runtime.
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: TPayload;
  color?: string;
  name?: string | number;
}

export interface RechartsTooltipProps<
  TPayload extends Record<string, string | number> = Record<string, string | number>,
> {
  active?: boolean;
  payload?: readonly RechartsPayloadItem<TPayload>[];
  label?: string | number;
}

// Recharts 3.8 made the chart `data` prop generic (`ChartData<DataPointType>`).
// Our charts switch between several row shapes via a conditional, producing a
// union of array types from which TS can no longer infer a single DataPointType.
// Casting the `data` expression to this opaque row type keeps inference stable;
// Recharts only reads rows by string dataKey, so the element type stays loose.
export type ChartRowData = readonly Record<string, unknown>[];
