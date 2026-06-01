import { Suspense, useMemo, useRef, useState, type RefObject } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type RechartsTooltipProps,
} from "./recharts-components";
import type { NormalizedEntry } from "../utils/normalize";
import type { BreakdownMode } from "../utils/breakdown";
import {
  computeAllStats,
  computeAllStatsForVisibleModels,
  buildDistributionFromLabeledValues,
  extractMetricWithLabels,
  extractMetricForVisibleModelsWithLabels,
  findStatSources,
  findRankForValue,
  type StatMetricKey,
  type DescriptiveStats,
} from "../utils/statistics";
import { collectModels, buildModelSeries, MODEL_COLORS } from "../utils/chart";
import type { ChartDataSeries } from "../utils/chartData";
import { buildMarkdownSection, pickDataKeys } from "../utils/chartData";
import { formatCost, formatTokens, formatSkewness } from "../utils/format";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";

interface Props {
  entries: NormalizedEntry[];
}

interface MetricConfig {
  label: string;
  format: (v: number) => string;
}

const METRICS: Record<StatMetricKey, MetricConfig> = {
  cost: { label: "Cost", format: formatCost },
  totalTokens: { label: "Total Tokens", format: formatTokens },
  inputTokens: { label: "Input", format: formatTokens },
  outputTokens: { label: "Output", format: formatTokens },
  cacheCreationTokens: { label: "Cache Create", format: formatTokens },
  cacheReadTokens: { label: "Cache Read", format: formatTokens },
};

const METRIC_KEYS = Object.keys(METRICS) as StatMetricKey[];

function formatSourceLabels(labels: string[]): string {
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} (+${labels.length - 3})`;
}

const STAT_LABEL_COLORS: Record<string, string> = {
  Mean: "var(--color-chart-teal)",
  "Median (P50)": "var(--color-chart-green)",
  P90: "var(--color-chart-orange)",
  P95: "var(--color-chart-purple)",
  P99: "var(--color-chart-red)",
};

interface StatItem {
  label: string;
  value: string;
  subLabel?: string;
  color?: string;
  sourceLabels?: string[];
}

type HighlightedStat = "mean" | 50 | 90 | 95 | 99 | null;
type StatisticsBreakdownMode = "total" | BreakdownMode;

const STAT_SOURCE_FIELD: Record<string, string> = {
  "Median (P50)": "median",
  Min: "min",
  Max: "max",
  P75: "p75",
  P90: "p90",
  P95: "p95",
  P99: "p99",
};

function buildStatItems(
  stats: DescriptiveStats,
  format: (v: number) => string,
  sourceMap: Partial<Record<string, string[]>>,
): StatItem[] {
  const items: StatItem[] = [
    { label: "Sum", value: format(stats.sum) },
    { label: "Mean", value: format(stats.mean) },
    { label: "Median (P50)", value: format(stats.median) },
    { label: "Min", value: format(stats.min) },
    { label: "Max", value: format(stats.max) },
    {
      label: "Range",
      value: format(stats.range),
      subLabel: `${format(stats.min)} - ${format(stats.max)}`,
    },
    { label: "P75", value: format(stats.p75) },
    { label: "P90", value: format(stats.p90) },
    { label: "P95", value: format(stats.p95) },
    { label: "P99", value: format(stats.p99) },
    { label: "Std Dev", value: format(stats.standardDeviation) },
    {
      label: "IQR",
      value: format(stats.iqr),
      subLabel: `P25: ${format(stats.p25)} - P75: ${format(stats.p75)}`,
    },
    {
      label: "CV",
      value: Number.isFinite(stats.coefficientOfVariation)
        ? `${(stats.coefficientOfVariation * 100).toFixed(1)}%`
        : "N/A",
    },
    { label: "Skewness", value: formatSkewness(stats.skewness) },
  ];

  for (const item of items) {
    const color = STAT_LABEL_COLORS[item.label];
    if (color) item.color = color;
    const field = STAT_SOURCE_FIELD[item.label];
    if (field && sourceMap[field]) {
      item.sourceLabels = sourceMap[field];
    }
  }

  return items;
}

const STAT_HIGHLIGHT_TARGET: Partial<Record<string, HighlightedStat>> = {
  Mean: "mean",
  "Median (P50)": 50,
  P90: 90,
  P95: 95,
  P99: 99,
};

export function StatisticsSummary({ entries }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<StatMetricKey>("cost");
  const [breakdownMode, setBreakdownMode] = useState<StatisticsBreakdownMode>("total");
  const [hiddenBreakdowns, setHiddenBreakdowns] = useState<Set<string>>(new Set());
  const [highlightedStat, setHighlightedStat] = useState<HighlightedStat>(null);

  const handleBreakdownModeChange = (nextMode: StatisticsBreakdownMode) => {
    setBreakdownMode(nextMode);
    setHiddenBreakdowns(new Set());
  };

  const toggleBreakdown = (key: string) => {
    setHiddenBreakdowns((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasBreakdownData = useMemo(() => collectModels(entries).length > 0, [entries]);
  const breakdownKeys = useMemo(() => {
    if (breakdownMode === "total" || !hasBreakdownData) return [];
    return collectModels(entries, breakdownMode);
  }, [entries, breakdownMode, hasBreakdownData]);

  const breakdownSeries = useMemo(() => {
    if (breakdownMode === "total" || !hasBreakdownData) return [];
    return buildModelSeries(breakdownKeys, entries, MODEL_COLORS, breakdownMode);
  }, [breakdownKeys, entries, breakdownMode, hasBreakdownData]);

  const visibleBreakdowns = useMemo(
    () => new Set(breakdownKeys.filter((key) => !hiddenBreakdowns.has(key))),
    [breakdownKeys, hiddenBreakdowns],
  );
  const includeOther = !hiddenBreakdowns.has("Other");

  const allStats = useMemo(() => {
    if (breakdownMode === "total") {
      return computeAllStats(entries);
    }
    return computeAllStatsForVisibleModels(entries, visibleBreakdowns, includeOther, breakdownMode);
  }, [entries, breakdownMode, visibleBreakdowns, includeOther]);

  const stats = entries.length >= 2 ? allStats[metric] : null;
  const metricConfig = METRICS[metric];

  const sourceMap = useMemo(() => {
    if (!stats) return {};
    const labeledValues =
      breakdownMode === "total"
        ? extractMetricWithLabels(entries, metric)
        : extractMetricForVisibleModelsWithLabels(
            entries,
            metric,
            visibleBreakdowns,
            includeOther,
            breakdownMode,
          );
    return findStatSources(labeledValues, stats);
  }, [entries, metric, breakdownMode, visibleBreakdowns, includeOther, stats]);

  const items = stats ? buildStatItems(stats, metricConfig.format, sourceMap) : [];
  const distributionData = useMemo(() => {
    if (!stats) return [];
    const labeledValues =
      breakdownMode === "total"
        ? extractMetricWithLabels(entries, metric)
        : extractMetricForVisibleModelsWithLabels(
            entries,
            metric,
            visibleBreakdowns,
            includeOther,
            breakdownMode,
          );

    return buildDistributionFromLabeledValues(labeledValues);
  }, [entries, metric, breakdownMode, visibleBreakdowns, includeOther, stats]);
  const chartMarkdown = useMemo(() => {
    if (!stats) return "";

    const statRows = [
      { stat: "Count", value: stats.count, formatted: String(stats.count) },
      { stat: "Sum", value: stats.sum, formatted: metricConfig.format(stats.sum) },
      { stat: "Mean", value: stats.mean, formatted: metricConfig.format(stats.mean) },
      {
        stat: "Median (P50)",
        value: stats.median,
        formatted: metricConfig.format(stats.median),
        sourceLabels: sourceMap.median?.join(", ") ?? "",
      },
      {
        stat: "Min",
        value: stats.min,
        formatted: metricConfig.format(stats.min),
        sourceLabels: sourceMap.min?.join(", ") ?? "",
      },
      {
        stat: "Max",
        value: stats.max,
        formatted: metricConfig.format(stats.max),
        sourceLabels: sourceMap.max?.join(", ") ?? "",
      },
      {
        stat: "Range",
        value: stats.range,
        formatted: metricConfig.format(stats.range),
      },
      {
        stat: "P25",
        value: stats.p25,
        formatted: metricConfig.format(stats.p25),
      },
      {
        stat: "P75",
        value: stats.p75,
        formatted: metricConfig.format(stats.p75),
        sourceLabels: sourceMap.p75?.join(", ") ?? "",
      },
      {
        stat: "P90",
        value: stats.p90,
        formatted: metricConfig.format(stats.p90),
        sourceLabels: sourceMap.p90?.join(", ") ?? "",
      },
      {
        stat: "P95",
        value: stats.p95,
        formatted: metricConfig.format(stats.p95),
        sourceLabels: sourceMap.p95?.join(", ") ?? "",
      },
      {
        stat: "P99",
        value: stats.p99,
        formatted: metricConfig.format(stats.p99),
        sourceLabels: sourceMap.p99?.join(", ") ?? "",
      },
      {
        stat: "Std Dev",
        value: stats.standardDeviation,
        formatted: metricConfig.format(stats.standardDeviation),
      },
      {
        stat: "IQR",
        value: stats.iqr,
        formatted: metricConfig.format(stats.iqr),
      },
      {
        stat: "CV",
        value: stats.coefficientOfVariation,
        formatted: Number.isFinite(stats.coefficientOfVariation)
          ? `${(stats.coefficientOfVariation * 100).toFixed(1)}%`
          : "N/A",
      },
      {
        stat: "Skewness",
        value: stats.skewness,
        formatted: formatSkewness(stats.skewness),
      },
    ];

    return buildMarkdownSection({
      title: "Statistics",
      metadata: [
        ["Metric", metricConfig.label],
        [
          "View",
          breakdownMode === "total"
            ? "Total"
            : breakdownMode === "model"
              ? "By Model"
              : "By Provider",
        ],
        ["Hidden breakdowns", Array.from(hiddenBreakdowns)],
        ["Entries", stats.count],
      ],
      tables: [
        {
          title: "Stats",
          columns: [
            { key: "stat", label: "Stat" },
            { key: "value", label: "Value", align: "right" },
            { key: "formatted", label: "Formatted" },
            { key: "sourceLabels", label: "Source labels" },
          ],
          rows: statRows,
        },
        {
          title: "Distribution",
          columns: [
            { key: "rank", label: "Percentile", align: "right" },
            { key: "value", label: metricConfig.label, align: "right" },
          ],
          rows: pickDataKeys(distributionData, ["rank", "value"]),
        },
      ],
    });
  }, [breakdownMode, distributionData, hiddenBreakdowns, metricConfig, sourceMap, stats]);
  const markdownRegistration = useMemo(
    () =>
      stats
        ? {
            id: "statistics",
            order: 10,
            markdown: chartMarkdown,
          }
        : null,
    [chartMarkdown, stats],
  );
  useRegisterChartMarkdown(markdownRegistration);

  if (!stats) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary">Statistics</h3>
        <p className="text-sm text-text-secondary mt-2">Need at least 2 entries for statistics</p>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="bg-bg-card border border-border rounded-lg p-4">
      <StatisticsHeader
        breakdownMode={breakdownMode}
        chartMarkdown={chartMarkdown}
        entryCount={stats.count}
        hasBreakdownData={hasBreakdownData}
        metric={metric}
        panelRef={panelRef}
        onBreakdownModeChange={handleBreakdownModeChange}
        onMetricChange={setMetric}
      />

      <DistributionChart
        entries={entries}
        metric={metric}
        metricConfig={metricConfig}
        stats={stats}
        breakdownMode={breakdownMode}
        hiddenBreakdowns={hiddenBreakdowns}
        breakdownKeys={breakdownKeys}
        highlightedStat={highlightedStat}
      />

      <StatisticsBreakdownLegend
        breakdownMode={breakdownMode}
        breakdownSeries={breakdownSeries}
        hiddenBreakdowns={hiddenBreakdowns}
        toggleBreakdown={toggleBreakdown}
      />

      <StatisticsCards items={items} onHighlightChange={setHighlightedStat} />
    </div>
  );
}

function StatisticsHeader({
  breakdownMode,
  chartMarkdown,
  entryCount,
  hasBreakdownData,
  metric,
  panelRef,
  onBreakdownModeChange,
  onMetricChange,
}: {
  breakdownMode: StatisticsBreakdownMode;
  chartMarkdown: string;
  entryCount: number;
  hasBreakdownData: boolean;
  metric: StatMetricKey;
  panelRef: RefObject<HTMLDivElement | null>;
  onBreakdownModeChange: (mode: StatisticsBreakdownMode) => void;
  onMetricChange: (metric: StatMetricKey) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-1 shrink-0">
        <h3 className="text-sm font-medium text-text-secondary">Statistics</h3>
        <span className="text-xs text-text-secondary">({entryCount} entries)</span>
        <CopyImageButton targetRef={panelRef} />
        <CopyMarkdownButton markdown={chartMarkdown} />
      </div>
      <div className="flex items-center gap-2 overflow-x-auto">
        {hasBreakdownData && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
            {(["total", "model", "provider"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onBreakdownModeChange(mode)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  breakdownMode === mode
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {mode === "total" ? "Total" : mode === "model" ? "By Model" : "By Provider"}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
          {METRIC_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => onMetricChange(key)}
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
  );
}

function StatisticsBreakdownLegend({
  breakdownMode,
  breakdownSeries,
  hiddenBreakdowns,
  toggleBreakdown,
}: {
  breakdownMode: StatisticsBreakdownMode;
  breakdownSeries: ChartDataSeries[];
  hiddenBreakdowns: Set<string>;
  toggleBreakdown: (key: string) => void;
}) {
  if (breakdownMode === "total" || breakdownSeries.length === 0) return null;

  return (
    <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 text-xs mt-1 mb-3">
      {breakdownSeries.map((series) => (
        <button
          key={series.key}
          type="button"
          onClick={() => toggleBreakdown(series.key)}
          className="inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
          style={{
            opacity: hiddenBreakdowns.has(series.key) ? 0.3 : 1,
            fontSize: "inherit",
            color: "inherit",
            textDecoration: hiddenBreakdowns.has(series.key) ? "line-through" : "none",
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
  );
}

function StatisticsCards({
  items,
  onHighlightChange,
}: {
  items: StatItem[];
  onHighlightChange: (highlightedStat: HighlightedStat) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={item.sourceLabels ? "group/stat relative" : undefined}
          onMouseEnter={() => onHighlightChange(STAT_HIGHLIGHT_TARGET[item.label] ?? null)}
          onMouseLeave={() => onHighlightChange(null)}
        >
          <p
            className="text-xs uppercase tracking-wide flex items-center gap-1.5"
            style={{ color: item.color ?? "var(--color-text-secondary)" }}
          >
            {item.color && (
              <span
                className="inline-block size-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
            )}
            {item.label}
          </p>
          <p
            className={`text-lg font-semibold mt-0.5 text-text-primary${
              item.sourceLabels
                ? " cursor-help underline decoration-dashed decoration-1 decoration-text-secondary/40 underline-offset-4"
                : ""
            }`}
          >
            {item.value}
          </p>
          {item.sourceLabels && (
            <div className="pointer-events-none absolute bottom-full left-0 mb-1 hidden group-hover/stat:block z-10 bg-bg-secondary border border-border rounded-md px-2.5 py-1.5 text-xs text-text-secondary whitespace-nowrap shadow-lg">
              {formatSourceLabels(item.sourceLabels)}
            </div>
          )}
          {item.subLabel && <p className="text-xs text-text-secondary mt-0.5">{item.subLabel}</p>}
        </div>
      ))}
    </div>
  );
}

const MEAN_COLOR = "var(--color-chart-teal)";

const PERCENTILE_LINES = [
  { rank: 50, label: "P50", color: "var(--color-chart-green)" },
  { rank: 90, label: "P90", color: "var(--color-chart-orange)" },
  { rank: 95, label: "P95", color: "var(--color-chart-purple)" },
  { rank: 99, label: "P99", color: "var(--color-chart-red)" },
] as const;

function DistributionChart({
  entries,
  metric,
  metricConfig,
  stats,
  breakdownMode,
  hiddenBreakdowns,
  breakdownKeys,
  highlightedStat,
}: {
  entries: NormalizedEntry[];
  metric: StatMetricKey;
  metricConfig: MetricConfig;
  stats: DescriptiveStats;
  breakdownMode: "total" | BreakdownMode;
  hiddenBreakdowns: Set<string>;
  breakdownKeys: string[];
  highlightedStat: HighlightedStat;
}) {
  const chartData = useMemo(() => {
    const labeledValues =
      breakdownMode === "total"
        ? extractMetricWithLabels(entries, metric)
        : extractMetricForVisibleModelsWithLabels(
            entries,
            metric,
            new Set(breakdownKeys.filter((key) => !hiddenBreakdowns.has(key))),
            !hiddenBreakdowns.has("Other"),
            breakdownMode,
          );

    return buildDistributionFromLabeledValues(labeledValues);
  }, [entries, metric, breakdownMode, hiddenBreakdowns, breakdownKeys]);

  const meanRank = useMemo(() => findRankForValue(chartData, stats.mean), [chartData, stats.mean]);

  if (chartData.length < 2) return null;

  const percentileValues: Record<number, number> = {
    50: stats.median,
    90: stats.p90,
    95: stats.p95,
    99: stats.p99,
  };
  const meanHighlighted = highlightedStat === "mean";

  return (
    <div className="mb-2">
      <p className="text-xs text-text-secondary mb-2">Distribution (sorted ascending)</p>
      <Suspense fallback={<div className="h-60" />}>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="rank"
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value}%`}
              label={{
                value: "Percentile",
                position: "insideBottomRight",
                offset: -5,
                style: { fontSize: 11, fill: "var(--color-text-secondary)" },
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => metricConfig.format(value)}
              width={80}
            />
            <Tooltip content={<DistributionTooltip metricConfig={metricConfig} />} />
            <Area
              type="monotone"
              dataKey="value"
              fill="var(--color-chart-blue)"
              stroke="var(--color-chart-blue)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            {meanRank != null && (
              <ReferenceLine
                x={meanRank}
                stroke={MEAN_COLOR}
                strokeDasharray="4 3"
                strokeWidth={meanHighlighted ? 3 : 1.5}
                strokeOpacity={highlightedStat == null || meanHighlighted ? 1 : 0.5}
                label={{
                  value: `Mean ${metricConfig.format(stats.mean)}`,
                  position: "top",
                  style: {
                    fontSize: meanHighlighted ? 11 : 10,
                    fontWeight: meanHighlighted ? 600 : 400,
                    fill: MEAN_COLOR,
                    opacity: highlightedStat == null || meanHighlighted ? 1 : 0.7,
                  },
                }}
              />
            )}
            {PERCENTILE_LINES.map(({ rank, label, color }) => (
              <ReferenceLine
                key={rank}
                x={rank}
                stroke={color}
                strokeDasharray="4 3"
                strokeWidth={highlightedStat === rank ? 3 : 1.5}
                strokeOpacity={highlightedStat == null || highlightedStat === rank ? 1 : 0.5}
                label={{
                  value: `${label} ${metricConfig.format(percentileValues[rank])}`,
                  position: "top",
                  style: {
                    fontSize: highlightedStat === rank ? 11 : 10,
                    fontWeight: highlightedStat === rank ? 600 : 400,
                    fill: color,
                    opacity: highlightedStat == null || highlightedStat === rank ? 1 : 0.7,
                  },
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Suspense>
    </div>
  );
}

function DistributionTooltip({
  active,
  payload,
  label,
  metricConfig,
}: RechartsTooltipProps & { metricConfig: MetricConfig }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  const value = Number(point?.value ?? 0);
  const sourceLabel = typeof point?.sourceLabel === "string" ? point.sourceLabel : "";
  const sourceLabelName = /^\d{4}-\d{2}(-\d{2})?$/.test(sourceLabel) ? "Period" : "Source";
  const rank = label ?? point?.rank ?? "";

  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text-primary">Percentile: {rank}%</p>
      <p className="text-text-secondary">
        {metricConfig.label}:{" "}
        <span className="text-text-primary">{metricConfig.format(value)}</span>
      </p>
      {sourceLabel && (
        <p className="text-text-secondary">
          {sourceLabelName}: {sourceLabel}
        </p>
      )}
    </div>
  );
}
