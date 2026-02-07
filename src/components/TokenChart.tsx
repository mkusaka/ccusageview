import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import { formatTokens } from "../utils/format";

interface Props {
  entries: NormalizedEntry[];
}

const SERIES = [
  { key: "inputTokens", name: "Input", color: "var(--color-chart-blue)" },
  { key: "outputTokens", name: "Output", color: "var(--color-chart-green)" },
  {
    key: "cacheCreationTokens",
    name: "Cache Create",
    color: "var(--color-chart-orange)",
  },
  {
    key: "cacheReadTokens",
    name: "Cache Read",
    color: "var(--color-chart-purple)",
  },
] as const;

export function TokenChart({ entries }: Props) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-text-secondary mb-4">
        Token Breakdown
      </h3>
      <ResponsiveContainer width="100%" height={380}>
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
            tickFormatter={(v: number) => formatTokens(v)}
          />
          <Tooltip
            formatter={(value, name) => [
              formatTokens(Number(value ?? 0)),
              String(name),
            ]}
            contentStyle={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="square"
            iconSize={10}
          />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="tokens"
              fill={s.color}
              fillOpacity={0.85}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
