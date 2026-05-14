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

interface RechartsPayloadItem<TPayload extends Record<string, string | number>> {
  dataKey?: string | number;
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
