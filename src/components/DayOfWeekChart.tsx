import { useMemo, useState, useRef } from "react";
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
import { formatCost, formatTokens } from "../utils/format";
import { collectModels, buildModelSeries, shortenModelName, MODEL_COLORS } from "../utils/chart";
import { CopyImageButton } from "./CopyImageButton";

interface Props {
  entries: NormalizedEntry[];
}

type Metric =
  | "cost"
  | "totalTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

type ViewMode = "total" | "model";

const METRICS: Record<Metric, { label: string; format: (v: number) => string }> = {
  cost: { label: "Cost", format: formatCost },
  totalTokens: { label: "Total Tokens", format: formatTokens },
  inputTokens: { label: "Input", format: formatTokens },
  outputTokens: { label: "Output", format: formatTokens },
  cacheCreationTokens: { label: "Cache Create", format: formatTokens },
  cacheReadTokens: { label: "Cache Read", format: formatTokens },
};

const METRIC_KEYS = Object.keys(METRICS) as Metric[];
const TOOLTIP_WRAPPER_STYLE = { zIndex: 20 };

// Mon=0 .. Sun=6 display order
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayBucket {
  day: string;
  avg: number;
  total: number;
  count: number;
}

function parseDayIndex(label: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const d = new Date(label + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const jsDay = d.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function buildDayOfWeekData(entries: NormalizedEntry[], metric: Metric): DayBucket[] {
  const buckets: { total: number; count: number }[] = Array.from({ length: 7 }, () => ({
    total: 0,
    count: 0,
  }));

  for (const e of entries) {
    const dayIndex = parseDayIndex(e.label);
    if (dayIndex === null) continue;
    buckets[dayIndex].total += e[metric];
    buckets[dayIndex].count += 1;
  }

  return buckets.map((b, i) => ({
    day: DAY_LABELS[i],
    avg: b.count > 0 ? b.total / b.count : 0,
    total: b.total,
    count: b.count,
  }));
}

/** Metric value from a ModelBreakdown-like object */
function getBreakdownValue(
  mb: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    cost: number;
  },
  metric: Metric,
): number {
  if (metric === "totalTokens") {
    return mb.inputTokens + mb.outputTokens + mb.cacheCreationTokens + mb.cacheReadTokens;
  }
  return mb[metric];
}

function buildDayOfWeekByModel(
  entries: NormalizedEntry[],
  metric: Metric,
  allModels: string[],
): Record<string, string | number>[] {
  // Per day: count of entries and total per model
  const dayCounts = Array.from({ length: 7 }, () => 0);
  const dayModelTotals = Array.from({ length: 7 }, () => new Map<string, number>());

  for (const e of entries) {
    const dayIndex = parseDayIndex(e.label);
    if (dayIndex === null) continue;
    dayCounts[dayIndex] += 1;

    if (e.modelBreakdowns && e.modelBreakdowns.length > 0) {
      for (const mb of e.modelBreakdowns) {
        const prev = dayModelTotals[dayIndex].get(mb.modelName) ?? 0;
        dayModelTotals[dayIndex].set(mb.modelName, prev + getBreakdownValue(mb, metric));
      }
    } else {
      // No breakdown — attribute to "Other"
      const prev = dayModelTotals[dayIndex].get("Other") ?? 0;
      dayModelTotals[dayIndex].set("Other", prev + getBreakdownValue(e, metric));
    }
  }

  return DAY_LABELS.map((day, i) => {
    const row: Record<string, string | number> = { day };
    const count = dayCounts[i];
    if (count === 0) return row;
    for (const model of allModels) {
      row[model] = (dayModelTotals[i].get(model) ?? 0) / count;
    }
    if (dayModelTotals[i].has("Other")) {
      row["Other"] = (dayModelTotals[i].get("Other") ?? 0) / count;
    }
    return row;
  });
}

export function DayOfWeekChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<Metric>("cost");
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

  const data = useMemo(() => buildDayOfWeekData(entries, metric), [entries, metric]);

  const modelData = useMemo(
    () => (hasModelData ? buildDayOfWeekByModel(entries, metric, allModels) : []),
    [entries, metric, allModels, hasModelData],
  );

  const modelSeries = useMemo(
    () => (hasModelData ? buildModelSeries(allModels, entries, MODEL_COLORS) : []),
    [allModels, hasModelData, entries],
  );

  const hasData = data.some((d) => d.count > 0);
  if (!hasData) return null;

  const isModelView = viewMode === "model" && hasModelData;
  const metricConfig = METRICS[metric];

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 shrink-0">
          <h3 className="text-sm font-medium text-text-secondary">Day of Week (avg)</h3>
          <CopyImageButton targetRef={chartRef} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {hasModelData && (
            <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
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
              {viewMode === "model" && (
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
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
            {METRIC_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={`shrink-0 px-2 py-0.5 text-xs rounded transition-colors ${
                  metric === key
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {METRICS[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={isModelView ? modelData : data}
          margin={{ top: 10, right: 20, bottom: 0, left: 10 }}
          stackOffset={isModelView && showPercent ? "expand" : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={
              isModelView && showPercent
                ? (v: number) => `${(v * 100).toFixed(0)}%`
                : (v: number) => metricConfig.format(v)
            }
            width={80}
            domain={isModelView && showPercent ? [0, 1] : undefined}
          />
          {isModelView ? (
            <>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                content={
                  showPercent
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
                                  <span style={{ color: p.color }}>■</span> {p.name}:{" "}
                                  {pct.toFixed(1)}% ({metricConfig.format(raw)})
                                </p>
                              );
                            })}
                          </div>
                        );
                      }
                    : undefined
                }
                formatter={
                  showPercent
                    ? undefined
                    : (value, name) => [
                        metricConfig.format(Number(value ?? 0)),
                        shortenModelName(String(name)),
                      ]
                }
                contentStyle={
                  showPercent
                    ? undefined
                    : {
                        backgroundColor: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        fontSize: 12,
                      }
                }
              />
              <Legend
                content={() => (
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-1">
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
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="model" fill={s.color} />
                ))}
            </>
          ) : (
            <>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const p = payload[0].payload as DayBucket;
                  if (p.count === 0) return null;
                  return (
                    <div
                      className="px-2.5 py-1.5 rounded-md text-xs shadow-lg"
                      style={{
                        backgroundColor: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <p className="text-text-primary font-medium">{p.day}</p>
                      <p className="text-text-secondary">Avg: {metricConfig.format(p.avg)}</p>
                      <p className="text-text-secondary">Total: {metricConfig.format(p.total)}</p>
                      <p className="text-text-secondary">{p.count} days</p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="avg"
                fill="var(--color-chart-blue)"
                fillOpacity={0.7}
                radius={[4, 4, 0, 0]}
              />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
