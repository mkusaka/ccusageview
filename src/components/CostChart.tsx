import { useState, useMemo, useRef } from "react";
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
import { buildCostByTokenType } from "../utils/pricing";
import { CopyImageButton } from "./CopyImageButton";

interface Props {
  entries: NormalizedEntry[];
}

type ViewMode = "total" | "model" | "tokenType";

const TOKEN_TYPE_COST_SERIES = [
  { key: "inputCost", name: "Input", color: "var(--color-chart-blue)" },
  { key: "outputCost", name: "Output", color: "var(--color-chart-green)" },
  { key: "cacheWriteCost", name: "Cache Write", color: "var(--color-chart-orange)" },
  { key: "cacheReadCost", name: "Cache Read", color: "var(--color-chart-purple)" },
] as const;

export function CostChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [showPercent, setShowPercent] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const tokenTypeCostData = useMemo(() => buildCostByTokenType(entries), [entries]);
  const hasTokenTypeCostData = tokenTypeCostData.some(
    (d) => d.inputCost > 0 || d.outputCost > 0 || d.cacheWriteCost > 0 || d.cacheReadCost > 0,
  );

  const isModelView = viewMode === "model" && hasModelData;
  const isTokenTypeView = viewMode === "tokenType" && hasTokenTypeCostData;

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">Cost Over Time</h3>
          <CopyImageButton targetRef={chartRef} />
        </div>
        {(hasModelData || hasTokenTypeCostData) && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
            <button
              onClick={() => {
                setViewMode("total");
                setShowPercent(false);
              }}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                viewMode === "total"
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Total
            </button>
            {hasModelData && (
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
            )}
            {hasTokenTypeCostData && (
              <button
                onClick={() => setViewMode("tokenType")}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === "tokenType"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                By Token Type
              </button>
            )}
            {(isModelView || isTokenTypeView) && (
              <button
                onClick={() => setShowPercent((p) => !p)}
                className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                  showPercent
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                title="Show as percentage"
              >
                %
              </button>
            )}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={isTokenTypeView ? tokenTypeCostData : isModelView ? modelChartData : entries}
          stackOffset={(isModelView || isTokenTypeView) && showPercent ? "expand" : undefined}
        >
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
            tickFormatter={
              (isModelView || isTokenTypeView) && showPercent
                ? (v: number) => `${(v * 100).toFixed(0)}%`
                : (v: number) => `$${v}`
            }
            domain={(isModelView || isTokenTypeView) && showPercent ? [0, 1] : undefined}
          />
          <Tooltip
            content={
              (isModelView || isTokenTypeView) && showPercent
                ? ({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce(
                      (s, p) => s + Number(p.payload?.[String(p.dataKey)] ?? 0),
                      0,
                    );
                    return (
                      <div
                        className="px-2.5 py-1.5 rounded-lg text-xs shadow-lg"
                        style={{
                          backgroundColor: "var(--color-bg-card)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <p className="text-text-primary font-medium mb-0.5">{label}</p>
                        {payload.map((p) => {
                          const raw = Number(p.payload?.[String(p.dataKey)] ?? 0);
                          const pct = total > 0 ? (raw / total) * 100 : 0;
                          return (
                            <p key={String(p.dataKey)} className="text-text-secondary">
                              <span style={{ color: p.color }}>■</span> {p.name}: {pct.toFixed(1)}%
                              ({formatCost(raw)})
                            </p>
                          );
                        })}
                      </div>
                    );
                  }
                : undefined
            }
            formatter={
              (isModelView || isTokenTypeView) && showPercent
                ? undefined
                : (value, name) => [formatCost(Number(value ?? 0)), String(name)]
            }
            contentStyle={
              (isModelView || isTokenTypeView) && showPercent
                ? undefined
                : {
                    backgroundColor: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }
            }
          />
          {isTokenTypeView ? (
            <>
              <Legend
                content={() => (
                  <div className="flex justify-center gap-4 text-xs mt-1">
                    {TOKEN_TYPE_COST_SERIES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleSeries(s.key)}
                        className="inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
                        style={{
                          opacity: hiddenSeries.has(s.key) ? 0.3 : 1,
                          fontSize: "inherit",
                          color: "inherit",
                          textDecoration: hiddenSeries.has(s.key) ? "line-through" : "none",
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            backgroundColor: s.color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: "var(--color-text-secondary)" }}>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              />
              {TOKEN_TYPE_COST_SERIES.filter((s) => !hiddenSeries.has(s.key)).map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stackId="1"
                  fill={s.color}
                  stroke={s.color}
                  fillOpacity={0.6}
                  strokeWidth={1}
                />
              ))}
            </>
          ) : isModelView ? (
            <>
              <Legend
                content={() => (
                  <div className="flex justify-center gap-4 text-xs mt-1">
                    {modelSeries.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleSeries(s.key)}
                        className="inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
                        style={{
                          opacity: hiddenSeries.has(s.key) ? 0.3 : 1,
                          fontSize: "inherit",
                          color: "inherit",
                          textDecoration: hiddenSeries.has(s.key) ? "line-through" : "none",
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            backgroundColor: s.color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: "var(--color-text-secondary)" }}>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              />
              {modelSeries
                .filter((s) => !hiddenSeries.has(s.key))
                .map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stackId="1"
                    fill={s.color}
                    stroke={s.color}
                    fillOpacity={0.6}
                    strokeWidth={1}
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
