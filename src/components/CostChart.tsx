import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import { formatCost } from "../utils/format";

interface Props {
  entries: NormalizedEntry[];
}

export function CostChart({ entries }: Props) {
  const useBars = entries.length < 20;

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-text-secondary mb-4">
        Cost Over Time
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        {useBars ? (
          <BarChart data={entries}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              formatter={(value) => [formatCost(Number(value ?? 0)), "Cost"]}
              contentStyle={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="cost"
              fill="var(--color-chart-blue)"
              radius={[4, 4, 0, 0]}
              fillOpacity={0.85}
            />
          </BarChart>
        ) : (
          <AreaChart data={entries}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              formatter={(value) => [formatCost(Number(value ?? 0)), "Cost"]}
              contentStyle={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              fill="var(--color-chart-blue)"
              stroke="var(--color-chart-blue)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
