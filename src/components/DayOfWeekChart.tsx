import { useMemo, useRef, useState } from "react";
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
import type { BreakdownMode } from "../utils/breakdown";
import { formatCost, formatTokens } from "../utils/format";
import { collectModels, buildModelSeries, shortenModelName, MODEL_COLORS } from "../utils/chart";
import type { ChartDataSeries, MarkdownColumn } from "../utils/chartData";
import { buildMarkdownSection, pickDataKeys, seriesToColumns } from "../utils/chartData";
import {
  buildDayOfWeekByBreakdown,
  buildDayOfWeekData,
  DAY_OF_WEEK_AGGREGATIONS,
  type DayBucket,
  type DayOfWeekAggregation,
  type DayOfWeekMetric,
} from "../utils/dayOfWeek";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";

interface Props {
  entries: NormalizedEntry[];
}

type ViewMode = "total" | "model" | "provider";

const METRICS: Record<DayOfWeekMetric, { label: string; format: (v: number) => string }> = {
  cost: { label: "Cost", format: formatCost },
  totalTokens: { label: "Total Tokens", format: formatTokens },
  inputTokens: { label: "Input", format: formatTokens },
  outputTokens: { label: "Output", format: formatTokens },
  cacheCreationTokens: { label: "Cache Create", format: formatTokens },
  cacheReadTokens: { label: "Cache Read", format: formatTokens },
};

const METRIC_KEYS = Object.keys(METRICS) as DayOfWeekMetric[];
const TOOLTIP_WRAPPER_STYLE = { zIndex: 20 };
const AGGREGATION_LABELS: Record<DayOfWeekAggregation, string> = {
  avg: "Avg",
  max: "Max",
  min: "Min",
  sum: "Sum",
};

export function DayOfWeekChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<DayOfWeekMetric>("cost");
  const [aggregation, setAggregation] = useState<DayOfWeekAggregation>("avg");
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [showPercent, setShowPercent] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const breakdownMode: BreakdownMode = viewMode === "provider" ? "provider" : "model";

  const toggleSeries = (key: string) => {
    setHiddenSeries((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasBreakdownData = useMemo(() => collectModels(entries).length > 0, [entries]);
  const breakdownKeys = useMemo(
    () => (hasBreakdownData ? collectModels(entries, breakdownMode) : []),
    [entries, hasBreakdownData, breakdownMode],
  );

  const data = useMemo(() => buildDayOfWeekData(entries, metric), [entries, metric]);
  const breakdownData = useMemo(
    () =>
      hasBreakdownData
        ? buildDayOfWeekByBreakdown(entries, metric, breakdownKeys, breakdownMode, aggregation)
        : [],
    [entries, metric, breakdownKeys, breakdownMode, aggregation, hasBreakdownData],
  );
  const breakdownSeries = useMemo(
    () =>
      hasBreakdownData ? buildModelSeries(breakdownKeys, entries, MODEL_COLORS, breakdownMode) : [],
    [breakdownKeys, entries, breakdownMode, hasBreakdownData],
  );

  const hasData = data.some((bucket) => bucket.count > 0);
  const isBreakdownView = (viewMode === "model" || viewMode === "provider") && hasBreakdownData;
  const metricConfig = METRICS[metric];
  const chartMarkdown = useMemo(() => {
    if (isBreakdownView) {
      const series: ChartDataSeries[] = breakdownSeries
        .filter((item) => !hiddenSeries.has(item.key))
        .map((item) => ({ key: item.key, label: item.label, color: item.color }));
      return buildMarkdownSection({
        title: "Day of Week",
        metadata: [
          ["Metric", metricConfig.label],
          ["Aggregation", AGGREGATION_LABELS[aggregation]],
          ["View", viewMode === "provider" ? "By Provider" : "By Model"],
          ["Show percent", showPercent],
          ["Hidden series", Array.from(hiddenSeries)],
        ],
        tables: [
          {
            columns: seriesToColumns({ key: "day", label: "Day" }, series),
            rows: pickDataKeys(breakdownData, ["day", ...series.map((item) => item.key)]),
          },
        ],
      });
    }

    const columns: MarkdownColumn[] = [
      { key: "day", label: "Day" },
      { key: "avg", label: "Avg", align: "right" },
      { key: "max", label: "Max", align: "right" },
      { key: "min", label: "Min", align: "right" },
      { key: "sum", label: "Sum", align: "right" },
      { key: "count", label: "Days", align: "right" },
    ];

    return buildMarkdownSection({
      title: "Day of Week",
      metadata: [
        ["Metric", metricConfig.label],
        ["Aggregation", AGGREGATION_LABELS[aggregation]],
        ["View", "Total"],
      ],
      tables: [
        {
          columns,
          rows: pickDataKeys(
            data,
            columns.map((column) => column.key),
          ),
        },
      ],
    });
  }, [
    aggregation,
    breakdownData,
    breakdownSeries,
    data,
    hiddenSeries,
    isBreakdownView,
    metricConfig.label,
    showPercent,
    viewMode,
  ]);
  const markdownRegistration = useMemo(
    () =>
      hasData
        ? {
            id: "day-of-week",
            order: 30,
            markdown: chartMarkdown,
          }
        : null,
    [chartMarkdown, hasData],
  );
  useRegisterChartMarkdown(markdownRegistration);

  if (!hasData) return null;

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 shrink-0">
          <h3 className="text-sm font-medium text-text-secondary">Day of Week</h3>
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
            {DAY_OF_WEEK_AGGREGATIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAggregation(key)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  aggregation === key
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {AGGREGATION_LABELS[key]}
              </button>
            ))}
          </div>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={chartMarkdown} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {hasBreakdownData && (
            <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
              <button
                onClick={() => {
                  setViewMode("total");
                  setShowPercent(false);
                  setHiddenSeries(new Set());
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
                onClick={() => {
                  setViewMode("model");
                  setHiddenSeries(new Set());
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === "model"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                By Model
              </button>
              <button
                onClick={() => {
                  setViewMode("provider");
                  setHiddenSeries(new Set());
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === "provider"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                By Provider
              </button>
              {isBreakdownView && (
                <button
                  onClick={() => setShowPercent((previous) => !previous)}
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
          data={isBreakdownView ? breakdownData : data}
          margin={{ top: 10, right: 20, bottom: 0, left: 10 }}
          stackOffset={isBreakdownView && showPercent ? "expand" : undefined}
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
              isBreakdownView && showPercent
                ? (value: number) => `${(value * 100).toFixed(0)}%`
                : (value: number) => metricConfig.format(value)
            }
            width={80}
            domain={isBreakdownView && showPercent ? [0, 1] : undefined}
          />
          {isBreakdownView ? (
            <>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                content={
                  showPercent
                    ? ({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const total = payload.reduce(
                          (sum, item) => sum + Number(item.payload?.[String(item.dataKey)] ?? 0),
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
                            {payload.map((item) => {
                              const raw = Number(item.payload?.[String(item.dataKey)] ?? 0);
                              const pct = total > 0 ? (raw / total) * 100 : 0;
                              return (
                                <p key={String(item.dataKey)} className="text-text-secondary">
                                  <span style={{ color: item.color }}>■</span> {item.name}:{" "}
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
                        breakdownMode === "model" ? shortenModelName(String(name)) : String(name),
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
                    {breakdownSeries.map((series) => (
                      <button
                        key={series.key}
                        type="button"
                        onClick={() => toggleSeries(series.key)}
                        className="inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
                        style={{
                          opacity: hiddenSeries.has(series.key) ? 0.3 : 1,
                          fontSize: "inherit",
                          color: "inherit",
                          textDecoration: hiddenSeries.has(series.key) ? "line-through" : "none",
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            backgroundColor: series.color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: "var(--color-text-secondary)" }}>{series.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              />
              {breakdownSeries
                .filter((series) => !hiddenSeries.has(series.key))
                .map((series) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label}
                    stackId="breakdown"
                    fill={series.color}
                  />
                ))}
            </>
          ) : (
            <>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const bucket = payload[0].payload as DayBucket;
                  if (bucket.count === 0) return null;
                  return (
                    <div
                      className="px-2.5 py-1.5 rounded-md text-xs shadow-lg"
                      style={{
                        backgroundColor: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <p className="text-text-primary font-medium">{bucket.day}</p>
                      <p className="text-text-secondary">
                        {AGGREGATION_LABELS[aggregation]}:{" "}
                        {metricConfig.format(bucket[aggregation])}
                      </p>
                      <p className="text-text-secondary">Avg: {metricConfig.format(bucket.avg)}</p>
                      <p className="text-text-secondary">Max: {metricConfig.format(bucket.max)}</p>
                      <p className="text-text-secondary">Min: {metricConfig.format(bucket.min)}</p>
                      <p className="text-text-secondary">Sum: {metricConfig.format(bucket.sum)}</p>
                      <p className="text-text-secondary">{bucket.count} days</p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey={aggregation}
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
