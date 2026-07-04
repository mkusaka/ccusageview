import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "chart.js/auto";
import type {
  Chart as ChartJsInstance,
  ChartData,
  ChartDataset,
  ChartOptions,
  TooltipItem,
  TooltipModel,
} from "chart.js";
import { Chart as ReactChart } from "react-chartjs-2";
import type { NormalizedEntry } from "../utils/normalize";
import type { BreakdownMode } from "../utils/breakdown";
import {
  buildCacheEfficiencyChartData,
  buildCacheEfficiencyChartDataByBreakdown,
  formatCacheReadRate,
  getCacheEfficiencyBreakdownDataKey,
  type CacheEfficiencyChartDatum,
} from "../utils/cacheEfficiency";
import { collectModels, buildModelSeries, MODEL_COLORS } from "../utils/chart";
import type { ChartDataSeries } from "../utils/chartData";
import { buildMarkdownSection } from "../utils/chartData";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import {
  asNumber,
  createVerticalHoverLinePlugin,
  getActiveDataIndex,
  getChartJsColor,
  getOrCreateExternalTooltipElement,
  positionExternalTooltip,
  syncChartHoverState,
  withOpacity,
} from "./chartjs-utils";

interface Props {
  entries: NormalizedEntry[];
  syncId?: string;
  hoveredDataIndex?: number | null;
  hoveredSyncSource?: string | null;
  onHoverDataIndexChange?: (index: number | null, source?: string | null) => void;
}

const RATE_SERIES = {
  key: "cacheReadRate",
  name: "Cache Read Rate",
  color: "var(--color-chart-teal)",
} as const;

type ViewMode = "total" | "model" | "provider";
type CacheEfficiencyChartRow = CacheEfficiencyChartDatum | CacheEfficiencyBreakdownChartDatum;
type CacheEfficiencyBreakdownChartDatum = {
  label: string;
} & Record<string, string | number | null>;
type CacheEfficiencyDataset = ChartDataset<"line", (number | null)[]>;
type CacheEfficiencyChartData = ChartData<"line", (number | null)[], string>;

type CacheEfficiencyBreakdownSeries = ChartDataSeries & {
  inputKey: string;
  cacheCreationKey: string;
  cacheReadKey: string;
  rateKey: string;
};

function getVisibleBreakdownSeries(
  series: ChartDataSeries[],
  hiddenBreakdowns: Set<string>,
): CacheEfficiencyBreakdownSeries[] {
  return series
    .filter((item) => !hiddenBreakdowns.has(item.key))
    .map((item) => ({
      key: item.key,
      label: item.label,
      color: item.color,
      inputKey: getCacheEfficiencyBreakdownDataKey(item.key, "inputTokens"),
      cacheCreationKey: getCacheEfficiencyBreakdownDataKey(item.key, "cacheCreationTokens"),
      cacheReadKey: getCacheEfficiencyBreakdownDataKey(item.key, "cacheReadTokens"),
      rateKey: getCacheEfficiencyBreakdownDataKey(item.key, "cacheReadRate"),
    }));
}

function hasAnyBreakdownData(entries: readonly NormalizedEntry[]): boolean {
  return entries.some((entry) => entry.modelBreakdowns && entry.modelBreakdowns.length > 0);
}

function shouldShowTooltipItem(context: TooltipItem<"line">): boolean {
  const value = context.parsed.y;
  return typeof value === "number" && Number.isFinite(value);
}

function formatTooltipItem(context: TooltipItem<"line">): string {
  const label = context.dataset.label ?? "";
  const value = context.parsed.y;
  return `${label}: ${formatCacheReadRate(value == null ? null : value)}`;
}

function renderExternalTooltip({
  chart,
  tooltip,
}: {
  chart: ChartJsInstance;
  tooltip: TooltipModel<"line">;
}) {
  const tooltipEl = getOrCreateExternalTooltipElement(chart, "cache-efficiency");

  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = "0";
    return;
  }

  const items = tooltip.dataPoints.filter(shouldShowTooltipItem);
  if (items.length === 0) {
    tooltipEl.style.opacity = "0";
    return;
  }

  tooltipEl.replaceChildren();

  const title = document.createElement("div");
  title.textContent = tooltip.title.join(" ");
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  tooltipEl.appendChild(title);

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gridTemplateColumns = items.length > 10 ? "repeat(2, minmax(300px, 1fr))" : "1fr";
  body.style.columnGap = "12px";
  body.style.rowGap = "3px";

  for (const item of items) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.minWidth = "0";

    const marker = document.createElement("span");
    marker.style.width = "8px";
    marker.style.height = "8px";
    marker.style.flex = "0 0 auto";
    marker.style.background = String(item.dataset.borderColor ?? item.dataset.backgroundColor);

    const text = document.createElement("span");
    text.textContent = formatTooltipItem(item);
    text.style.minWidth = "0";
    text.style.whiteSpace = "nowrap";

    row.append(marker, text);
    body.appendChild(row);
  }

  tooltipEl.appendChild(body);

  positionExternalTooltip(chart, tooltip, tooltipEl);
}

function buildChartJsData(
  chartData: readonly CacheEfficiencyChartRow[],
  isBreakdownView: boolean,
  visibleBreakdownSeries: readonly CacheEfficiencyBreakdownSeries[],
): CacheEfficiencyChartData {
  const labels = chartData.map((row) => row.label);

  if (!isBreakdownView) {
    return {
      labels,
      datasets: [
        {
          type: "line",
          label: RATE_SERIES.name,
          data: chartData.map((row) => asNumber(row.cacheReadRate)),
          yAxisID: "rate",
          borderColor: getChartJsColor(4),
          backgroundColor: getChartJsColor(4),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          spanGaps: false,
        },
      ],
    };
  }

  const datasets: CacheEfficiencyDataset[] = [];

  for (const [index, series] of visibleBreakdownSeries.entries()) {
    const color = getChartJsColor(index);
    datasets.push({
      type: "line",
      label: `${series.label} ${RATE_SERIES.name}`,
      data: chartData.map((row) => asNumber((row as Record<string, unknown>)[series.rateKey])),
      yAxisID: "rate",
      borderColor: color,
      backgroundColor: withOpacity(color, 0.12),
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 3,
      spanGaps: false,
    });
  }

  return { labels, datasets };
}

function buildChartJsOptions(
  onHoverDataIndexChange?: (index: number | null, source?: string | null) => void,
): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    normalized: true,
    interaction: {
      mode: "index",
      intersect: false,
    },
    onHover(_event, elements) {
      onHoverDataIndexChange?.(getActiveDataIndex(elements), "cache-efficiency");
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
        filter: shouldShowTooltipItem,
        external: renderExternalTooltip,
        callbacks: {
          label(context: TooltipItem<"line">) {
            return formatTooltipItem(context);
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: "rgb(107, 114, 128)",
          font: {
            size: 11,
          },
          maxRotation: 0,
          autoSkip: true,
        },
      },
      rate: {
        type: "linear",
        position: "left",
        min: 0,
        max: 1,
        grid: {
          color: "rgba(148, 163, 184, 0.2)",
        },
        ticks: {
          color: "rgb(107, 114, 128)",
          font: {
            size: 11,
          },
          callback(value) {
            return formatCacheReadRate(Number(value));
          },
        },
      },
    },
  };
}

export function CacheEfficiencyChart({
  entries,
  syncId,
  hoveredDataIndex = null,
  hoveredSyncSource = null,
  onHoverDataIndexChange,
}: Props) {
  void syncId;
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ChartJsInstance<"line"> | null>(null);
  const hoveredDataIndexRef = useRef<number | null>(hoveredDataIndex);
  hoveredDataIndexRef.current = hoveredDataIndex;
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [hiddenBreakdowns, setHiddenBreakdowns] = useState<Set<string>>(new Set());
  const breakdownMode: BreakdownMode = viewMode === "provider" ? "provider" : "model";

  const hasBreakdownData = useMemo(() => hasAnyBreakdownData(entries), [entries]);
  const breakdownKeys = useMemo(
    () => (hasBreakdownData ? collectModels(entries, breakdownMode) : []),
    [entries, hasBreakdownData, breakdownMode],
  );
  const breakdownSeries = useMemo(
    () =>
      hasBreakdownData ? buildModelSeries(breakdownKeys, entries, MODEL_COLORS, breakdownMode) : [],
    [breakdownKeys, entries, hasBreakdownData, breakdownMode],
  );
  const includeOther = !hiddenBreakdowns.has("Other");
  const isBreakdownView = viewMode !== "total" && hasBreakdownData;
  const visibleBreakdownSeries = useMemo(
    () => getVisibleBreakdownSeries(breakdownSeries, hiddenBreakdowns),
    [breakdownSeries, hiddenBreakdowns],
  );
  const chartData = useMemo(
    () =>
      isBreakdownView
        ? buildCacheEfficiencyChartDataByBreakdown(
            entries,
            visibleBreakdownSeries.map((series) => series.key),
            includeOther,
            breakdownMode,
          )
        : buildCacheEfficiencyChartData(entries),
    [entries, isBreakdownView, visibleBreakdownSeries, includeOther, breakdownMode],
  );
  const chartJsData = useMemo(
    () => buildChartJsData(chartData, isBreakdownView, visibleBreakdownSeries),
    [chartData, isBreakdownView, visibleBreakdownSeries],
  );
  const chartJsOptions = useMemo(
    () => buildChartJsOptions(onHoverDataIndexChange),
    [onHoverDataIndexChange],
  );
  const hoverLinePlugin = useMemo(
    () => createVerticalHoverLinePlugin<"line">(hoveredDataIndexRef),
    [],
  );
  useEffect(() => {
    syncChartHoverState(chartInstanceRef.current, hoveredDataIndex);
  }, [hoveredDataIndex, hoveredSyncSource]);
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
  const getChartMarkdown = useCallback(() => {
    const tables = isBreakdownView
      ? [
          {
            columns: [
              { key: "label", label: "Label" },
              ...visibleBreakdownSeries.flatMap((series) => [
                { key: series.inputKey, label: `${series.label} Input`, align: "right" as const },
                {
                  key: series.cacheCreationKey,
                  label: `${series.label} Cache Create`,
                  align: "right" as const,
                },
                {
                  key: series.cacheReadKey,
                  label: `${series.label} Cache Read`,
                  align: "right" as const,
                },
                {
                  key: series.rateKey,
                  label: `${series.label} Cache Read Rate`,
                  align: "right" as const,
                },
              ]),
            ],
            rows: chartData as unknown as Record<string, unknown>[],
          },
        ]
      : [
          {
            columns: [
              { key: "label", label: "Label" },
              { key: "inputTokens", label: "Input", align: "right" as const },
              { key: "cacheCreationTokens", label: "Cache Create", align: "right" as const },
              { key: "cacheReadTokens", label: "Cache Read", align: "right" as const },
              {
                key: "cacheEfficiencyDenominatorTokens",
                label: "Input+Create+Read",
                align: "right" as const,
              },
              { key: "cacheReadRate", label: "Cache Read Rate", align: "right" as const },
            ],
            rows: chartData as unknown as Record<string, unknown>[],
          },
        ];

    return buildMarkdownSection({
      title: "Cache Efficiency",
      metadata: [
        [
          "View",
          viewMode === "total" ? "Total" : viewMode === "model" ? "By Model" : "By Provider",
        ],
        ["Hidden breakdowns", Array.from(hiddenBreakdowns)],
        [
          "Rate definition",
          "cacheReadTokens / (inputTokens + cacheCreationTokens + cacheReadTokens)",
        ],
      ],
      tables,
    });
  }, [chartData, hiddenBreakdowns, isBreakdownView, viewMode, visibleBreakdownSeries]);
  const markdownRegistration = useMemo(
    () => ({
      id: "cache-efficiency",
      order: 60,
      markdown: getChartMarkdown,
    }),
    [getChartMarkdown],
  );
  useRegisterChartMarkdown(markdownRegistration);

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">Cache Efficiency</h3>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={getChartMarkdown} />
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
        <div className="relative h-80 overflow-visible">
          <ReactChart
            ref={chartInstanceRef}
            type="line"
            data={chartJsData}
            options={chartJsOptions}
            plugins={[hoverLinePlugin]}
          />
        </div>
      </Suspense>
      {!isBreakdownView && <CacheEfficiencyLegend />}
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
      <span className="inline-flex items-center gap-1">
        <span
          style={{
            width: 10,
            height: 10,
            backgroundColor: RATE_SERIES.color,
            display: "inline-block",
          }}
        />
        <span style={{ color: "var(--color-text-secondary)" }}>{RATE_SERIES.name}</span>
      </span>
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
