import { useMemo, useState, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import {
  computeAllStats,
  computeAllStatsByModel,
  buildDistribution,
  buildDistributionFromValues,
  extractMetricByModel,
  extractMetricWithLabels,
  extractMetricByModelWithLabels,
  findStatSources,
  type StatMetricKey,
  type DescriptiveStats,
  type StatSource,
} from "../utils/statistics";
import { collectModels, shortenModelName } from "../utils/chart";
import { formatCost, formatTokens, formatSkewness } from "../utils/format";
import { CopyImageButton } from "./CopyImageButton";

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

function truncateLabels(labels: string[]): string {
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} (+${labels.length - 3})`;
}

/** Format source info for tooltip display */
function formatStatSource(source: StatSource): string {
  if (source.type === "interpolated") {
    return `${truncateLabels(source.loLabels)} 〜 ${truncateLabels(source.hiLabels)}`;
  }
  return truncateLabels(source.labels);
}

/** Color mapping for percentile labels that match chart reference lines */
const STAT_LABEL_COLORS: Record<string, string> = {
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
  /** Source info for stats that correspond to actual data entries */
  source?: StatSource;
}

/** Map from StatItem label to the DescriptiveStats source field name */
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
  fmt: (v: number) => string,
  sourceMap: Partial<Record<string, StatSource>>,
): StatItem[] {
  const items: StatItem[] = [
    { label: "Mean", value: fmt(stats.mean) },
    { label: "Median (P50)", value: fmt(stats.median) },
    { label: "Min", value: fmt(stats.min) },
    { label: "Max", value: fmt(stats.max) },
    { label: "P75", value: fmt(stats.p75) },
    { label: "P90", value: fmt(stats.p90) },
    { label: "P95", value: fmt(stats.p95) },
    { label: "P99", value: fmt(stats.p99) },
    { label: "Std Dev", value: fmt(stats.standardDeviation) },
    {
      label: "IQR",
      value: fmt(stats.iqr),
      subLabel: `P25: ${fmt(stats.p25)} – P75: ${fmt(stats.p75)}`,
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
    const c = STAT_LABEL_COLORS[item.label];
    if (c) item.color = c;
    const field = STAT_SOURCE_FIELD[item.label];
    if (field && sourceMap[field]) {
      item.source = sourceMap[field];
    }
  }
  return items;
}

export function StatisticsSummary({ entries }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<StatMetricKey>("cost");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const models = useMemo(() => collectModels(entries), [entries]);

  const allStats = useMemo(() => {
    if (selectedModel) return computeAllStatsByModel(entries, selectedModel);
    return computeAllStats(entries);
  }, [entries, selectedModel]);

  if (entries.length < 2) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary">Statistics</h3>
        <p className="text-sm text-text-secondary mt-2">Need at least 2 entries for statistics</p>
      </div>
    );
  }

  const stats = allStats[metric];
  const metricConfig = METRICS[metric];

  const sourceMap = useMemo(() => {
    const labeled = selectedModel
      ? extractMetricByModelWithLabels(entries, metric, selectedModel)
      : extractMetricWithLabels(entries, metric);
    return findStatSources(labeled, stats);
  }, [entries, metric, selectedModel, stats]);

  const items = buildStatItems(stats, metricConfig.format, sourceMap);

  return (
    <div ref={panelRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 shrink-0">
          <h3 className="text-sm font-medium text-text-secondary">Statistics</h3>
          <span className="text-xs text-text-secondary">({stats.count} entries)</span>
          <CopyImageButton targetRef={panelRef} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {models.length > 0 && (
            <select
              value={selectedModel ?? ""}
              onChange={(e) => setSelectedModel(e.target.value || null)}
              className="bg-bg-secondary text-text-primary text-xs rounded-md px-2 py-1 border border-border shrink-0"
            >
              <option value="">All Models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {shortenModelName(m)}
                </option>
              ))}
            </select>
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

      <DistributionChart
        entries={entries}
        metric={metric}
        metricConfig={metricConfig}
        stats={stats}
        selectedModel={selectedModel}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {items.map((item) => (
          <div key={item.label} className={item.source ? "group/stat relative" : ""}>
            <p
              className="text-xs uppercase tracking-wide flex items-center gap-1.5"
              style={{ color: item.color ?? "var(--color-text-secondary)" }}
            >
              {item.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {item.label}
            </p>
            <p
              className={`text-lg font-semibold mt-0.5 text-text-primary${
                item.source
                  ? " cursor-help underline decoration-dashed decoration-1 decoration-text-secondary/40 underline-offset-4"
                  : ""
              }`}
            >
              {item.value}
            </p>
            {item.source && (
              <div className="pointer-events-none absolute bottom-full left-0 mb-1 hidden group-hover/stat:block z-10 bg-bg-secondary border border-border rounded-md px-2.5 py-1.5 text-xs text-text-secondary whitespace-nowrap shadow-lg">
                {formatStatSource(item.source)}
              </div>
            )}
            {item.subLabel && <p className="text-xs text-text-secondary mt-0.5">{item.subLabel}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

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
  selectedModel,
}: {
  entries: NormalizedEntry[];
  metric: StatMetricKey;
  metricConfig: MetricConfig;
  stats: DescriptiveStats;
  selectedModel: string | null;
}) {
  const chartData = useMemo(() => {
    if (selectedModel) {
      return buildDistributionFromValues(extractMetricByModel(entries, metric, selectedModel));
    }
    return buildDistribution(entries, metric);
  }, [entries, metric, selectedModel]);

  if (chartData.length < 2) return null;

  const percentileValues: Record<number, number> = {
    50: stats.median,
    90: stats.p90,
    95: stats.p95,
    99: stats.p99,
  };

  return (
    <div className="mb-2">
      <p className="text-xs text-text-secondary mb-2">Distribution (sorted ascending)</p>
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
            tickFormatter={(v: number) => `${v}%`}
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
            tickFormatter={(v: number) => metricConfig.format(v)}
            width={80}
          />
          <Tooltip
            formatter={(value) => [metricConfig.format(Number(value ?? 0)), metricConfig.label]}
            labelFormatter={(rank) => `Percentile: ${rank}%`}
            contentStyle={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            fill="var(--color-chart-blue)"
            stroke="var(--color-chart-blue)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          {PERCENTILE_LINES.map(({ rank, label, color }) => (
            <ReferenceLine
              key={rank}
              x={rank}
              stroke={color}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `${label} ${metricConfig.format(percentileValues[rank])}`,
                position: "top",
                style: { fontSize: 10, fill: color },
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
