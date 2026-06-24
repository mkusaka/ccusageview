import { Suspense, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type RechartsTooltipProps,
  type ChartRowData,
  syncTooltipByIndexToLocalCoordinate,
} from "./recharts-components";
import type { NormalizedEntry } from "../utils/normalize";
import type { BreakdownMode } from "../utils/breakdown";
import {
  buildCacheEfficiencyChartData,
  buildCacheEfficiencyChartDataForBreakdowns,
  formatCacheReadRate,
  type CacheEfficiencyChartDatum,
} from "../utils/cacheEfficiency";
import { formatTokens } from "../utils/format";
import { collectModels, buildModelSeries, MODEL_COLORS } from "../utils/chart";
import type { ChartDataSeries } from "../utils/chartData";
import { buildMarkdownSection } from "../utils/chartData";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";

interface Props {
  entries: NormalizedEntry[];
  syncId?: string;
}

const TOKEN_SERIES = [
  { key: "inputTokens", name: "Input", color: "var(--color-chart-blue)" },
  { key: "cacheReadTokens", name: "Cache Read", color: "var(--color-chart-purple)" },
] as const;

const RATE_SERIES = {
  key: "cacheReadRate",
  name: "Cache Read Rate",
  color: "var(--color-chart-teal)",
} as const;

type ViewMode = "total" | "model" | "provider";

export function CacheEfficiencyChart({ entries, syncId }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [hiddenBreakdowns, setHiddenBreakdowns] = useState<Set<string>>(new Set());
  const breakdownMode: BreakdownMode = viewMode === "provider" ? "provider" : "model";

  const hasBreakdownData = useMemo(() => collectModels(entries).length > 0, [entries]);
  const breakdownKeys = useMemo(
    () => (hasBreakdownData ? collectModels(entries, breakdownMode) : []),
    [entries, hasBreakdownData, breakdownMode],
  );
  const breakdownSeries = useMemo(
    () =>
      hasBreakdownData ? buildModelSeries(breakdownKeys, entries, MODEL_COLORS, breakdownMode) : [],
    [breakdownKeys, entries, hasBreakdownData, breakdownMode],
  );
  const visibleBreakdowns = useMemo(
    () => new Set(breakdownKeys.filter((key) => !hiddenBreakdowns.has(key))),
    [breakdownKeys, hiddenBreakdowns],
  );
  const includeOther = !hiddenBreakdowns.has("Other");
  const isBreakdownView = viewMode !== "total" && hasBreakdownData;
  const chartData = useMemo(
    () =>
      isBreakdownView
        ? buildCacheEfficiencyChartDataForBreakdowns(
            entries,
            visibleBreakdowns,
            includeOther,
            breakdownMode,
          )
        : buildCacheEfficiencyChartData(entries),
    [entries, isBreakdownView, visibleBreakdowns, includeOther, breakdownMode],
  );
  const handleViewModeChange = (nextMode: ViewMode) => {
    setViewMode(nextMode);
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
  const chartMarkdown = useMemo(
    () =>
      buildMarkdownSection({
        title: "Cache Efficiency",
        metadata: [
          [
            "View",
            viewMode === "total" ? "Total" : viewMode === "model" ? "By Model" : "By Provider",
          ],
          ["Hidden breakdowns", Array.from(hiddenBreakdowns)],
          ["Rate definition", "cacheReadTokens / (inputTokens + cacheReadTokens)"],
        ],
        tables: [
          {
            columns: [
              { key: "label", label: "Label" },
              { key: "inputTokens", label: "Input", align: "right" },
              { key: "cacheReadTokens", label: "Cache Read", align: "right" },
              { key: "inputPlusCacheReadTokens", label: "Input+Read", align: "right" },
              { key: "cacheReadRate", label: "Cache Read Rate", align: "right" },
            ],
            rows: chartData as unknown as Record<string, unknown>[],
          },
        ],
      }),
    [chartData, hiddenBreakdowns, viewMode],
  );
  const markdownRegistration = useMemo(
    () => ({
      id: "cache-efficiency",
      order: 60,
      markdown: chartMarkdown,
    }),
    [chartMarkdown],
  );
  useRegisterChartMarkdown(markdownRegistration);

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">Cache Efficiency</h3>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={chartMarkdown} />
        </div>
        {hasBreakdownData && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
            {(["total", "model", "provider"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === mode
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {mode === "total" ? "Total" : mode === "model" ? "By Model" : "By Provider"}
              </button>
            ))}
          </div>
        )}
      </div>

      <Suspense fallback={<div className="h-80" />}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart
            data={chartData as unknown as ChartRowData}
            syncId={syncId}
            syncMethod={syncTooltipByIndexToLocalCoordinate}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="tokens"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatTokens(value)}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              domain={[0, 1]}
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatCacheReadRate(value)}
              width={56}
            />
            <Tooltip content={<CacheEfficiencyTooltip />} />
            <Legend content={<CacheEfficiencyLegend />} />
            {TOKEN_SERIES.map((series) => (
              <Bar
                key={series.key}
                yAxisId="tokens"
                dataKey={series.key}
                name={series.name}
                stackId="tokens"
                fill={series.color}
                fillOpacity={0.85}
              />
            ))}
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="cacheReadRate"
              name={RATE_SERIES.name}
              stroke={RATE_SERIES.color}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Suspense>
      {isBreakdownView && (
        <CacheEfficiencyBreakdownLegend
          breakdownSeries={breakdownSeries}
          hiddenBreakdowns={hiddenBreakdowns}
          toggleBreakdown={toggleBreakdown}
        />
      )}
    </div>
  );
}

function CacheEfficiencyLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-1">
      {[...TOKEN_SERIES, RATE_SERIES].map((series) => (
        <span key={series.key} className="inline-flex items-center gap-1">
          <span
            style={{
              width: 10,
              height: 10,
              backgroundColor: series.color,
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--color-text-secondary)" }}>{series.name}</span>
        </span>
      ))}
    </div>
  );
}

function CacheEfficiencyBreakdownLegend({
  breakdownSeries,
  hiddenBreakdowns,
  toggleBreakdown,
}: {
  breakdownSeries: ChartDataSeries[];
  hiddenBreakdowns: Set<string>;
  toggleBreakdown: (key: string) => void;
}) {
  if (breakdownSeries.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-1">
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

function CacheEfficiencyTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as unknown as CacheEfficiencyChartDatum | undefined;
  if (!row) return null;

  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-text-primary mb-1">{label}</p>
      <p className="text-text-secondary">
        Cache Read Rate:{" "}
        <span className="text-text-primary">{formatCacheReadRate(row.cacheReadRate)}</span>
      </p>
      <p className="text-text-secondary">
        Input: <span className="text-text-primary">{formatTokens(row.inputTokens)}</span>
      </p>
      <p className="text-text-secondary">
        Cache Read: <span className="text-text-primary">{formatTokens(row.cacheReadTokens)}</span>
      </p>
      <p className="text-text-secondary">
        Input+Read:{" "}
        <span className="text-text-primary">{formatTokens(row.inputPlusCacheReadTokens)}</span>
      </p>
    </div>
  );
}
