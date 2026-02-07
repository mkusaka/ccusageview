import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import { formatCost } from "../utils/format";
import { collectModels, buildModelSeries, buildCostByModel, MODEL_COLORS } from "../utils/chart";

interface Props {
  entries: NormalizedEntry[];
}

type ViewMode = "total" | "model";

export function CostChart({ entries }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("total");

  const allModels = useMemo(() => collectModels(entries), [entries]);
  const hasModelData = allModels.length > 0;

  const modelChartData = useMemo(
    () => (hasModelData ? buildCostByModel(entries) : []),
    [entries, hasModelData],
  );

  const modelSeries = useMemo(
    () => (hasModelData ? buildModelSeries(allModels, entries, MODEL_COLORS) : []),
    [allModels, hasModelData, entries],
  );

  const isModelView = viewMode === "model" && hasModelData;

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-secondary">Cost Over Time</h3>
        {hasModelData && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
            <button
              onClick={() => setViewMode("total")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                viewMode === "total"
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Total
            </button>
            <button
              onClick={() => setViewMode("model")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                viewMode === "model"
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              By Model
            </button>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={isModelView ? modelChartData : entries}>
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
            formatter={(value, name) => [formatCost(Number(value ?? 0)), String(name)]}
            contentStyle={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          {isModelView ? (
            <>
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
              {modelSeries.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  stroke={s.color}
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              ))}
            </>
          ) : (
            <Area
              type="monotone"
              dataKey="cost"
              fill="var(--color-chart-blue)"
              stroke="var(--color-chart-blue)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
