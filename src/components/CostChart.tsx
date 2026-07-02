import { useEffect, useMemo, useRef, useState } from "react";
import "chart.js/auto";
import type {
  Chart as ChartJsInstance,
  ChartData,
  ChartDataset,
  ChartOptions,
  TooltipModel,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { NormalizedEntry } from "../utils/normalize";
import type { TimeGranularity } from "../utils/projection";
import { formatProjectionMetadata, getProjectionMetrics } from "../utils/projection";
import { formatCost } from "../utils/format";
import type { BreakdownMode } from "../utils/breakdown";
import { collectModels, buildModelSeries, buildCostByModel, MODEL_COLORS } from "../utils/chart";
import type { ChartDataSeries } from "../utils/chartData";
import { buildMarkdownSection, pickDataKeys, seriesToColumns } from "../utils/chartData";
import { buildCostByTokenType } from "../utils/pricing";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import {
  asNumber,
  createVerticalHoverLinePlugin,
  getChartJsColor,
  getNearestDataIndexForClientX,
  getOrCreateExternalTooltipElement,
  normalizeStackValue,
  positionExternalTooltip,
  syncChartHoverState,
  withOpacity,
} from "./chartjs-utils";

interface Props {
  entries: NormalizedEntry[];
  syncId?: string;
  timeGranularity?: TimeGranularity;
  hoveredDataIndex?: number | null;
  hoveredSyncSource?: string | null;
  onHoverDataIndexChange?: (index: number | null, source?: string | null) => void;
}

type ViewMode = "total" | "model" | "provider" | "tokenType";
type CostBreakdownChartData = ReturnType<typeof buildCostByModel>;
type TokenTypeCostData = ReturnType<typeof buildCostByTokenType>;
type CostChartRow = NormalizedEntry | CostBreakdownChartData[number] | TokenTypeCostData[number];
type CostChartDataset = ChartDataset<"line", (number | null)[]>;
type CostChartJsData = ChartData<"line", (number | null)[], string>;

const TOKEN_TYPE_COST_SERIES = [
  { key: "inputCost", name: "Input", color: "var(--color-chart-blue)" },
  { key: "outputCost", name: "Output", color: "var(--color-chart-green)" },
  { key: "cacheWriteCost", name: "Cache Write", color: "var(--color-chart-orange)" },
  { key: "cacheReadCost", name: "Cache Read", color: "var(--color-chart-purple)" },
] as const;

function getVisibleTokenTypeCostSeries(hiddenSeries: Set<string>) {
  const visible: (typeof TOKEN_TYPE_COST_SERIES)[number][] = [];
  for (const series of TOKEN_TYPE_COST_SERIES) {
    if (!hiddenSeries.has(series.key)) visible.push(series);
  }
  return visible;
}

function getVisibleChartSeries(
  series: ChartDataSeries[],
  hiddenSeries: Set<string>,
): ChartDataSeries[] {
  const visible: ChartDataSeries[] = [];
  for (const item of series) {
    if (!hiddenSeries.has(item.key)) visible.push(item);
  }
  return visible;
}

function buildProjectionTableRows(
  sourceRow: CostChartRow | undefined,
  series: readonly ChartDataSeries[],
  projection: ReturnType<typeof getProjectionMetrics>,
): Record<string, unknown>[] {
  const projectionInfo = projection.projection;
  if (!projectionInfo || !sourceRow) return [];

  const record = sourceRow as Record<string, unknown>;
  return series.flatMap((item) => {
    const remaining = projection.remaining[item.key] ?? 0;
    if (remaining <= 0) return [];

    return {
      label: projectionInfo.sourceLabel,
      series: item.label,
      actual: asNumber(record[item.key]) ?? 0,
      projected: projection.projected[item.key] ?? 0,
      remaining,
    };
  });
}

export function CostChart({
  entries,
  syncId,
  timeGranularity,
  hoveredDataIndex = null,
  hoveredSyncSource = null,
  onHoverDataIndexChange,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [showPercent, setShowPercent] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const breakdownMode: BreakdownMode = viewMode === "provider" ? "provider" : "model";

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
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

  const breakdownChartData = useMemo(
    () => (hasBreakdownData ? buildCostByModel(entries, breakdownMode) : []),
    [entries, hasBreakdownData, breakdownMode],
  );

  const breakdownSeries = useMemo(
    () =>
      hasBreakdownData ? buildModelSeries(breakdownKeys, entries, MODEL_COLORS, breakdownMode) : [],
    [breakdownKeys, entries, hasBreakdownData, breakdownMode],
  );

  const tokenTypeCostData = useMemo(() => buildCostByTokenType(entries), [entries]);
  const hasTokenTypeCostData = tokenTypeCostData.some(
    (d) => d.inputCost > 0 || d.outputCost > 0 || d.cacheWriteCost > 0 || d.cacheReadCost > 0,
  );

  const isBreakdownView = (viewMode === "model" || viewMode === "provider") && hasBreakdownData;
  const isTokenTypeView = viewMode === "tokenType" && hasTokenTypeCostData;
  const chartMarkdown = useMemo(() => {
    let series: ChartDataSeries[];
    let sourceRows: readonly CostChartRow[];
    let viewLabel: string;

    if (isTokenTypeView) {
      viewLabel = "By Token Type";
      series = getVisibleTokenTypeCostSeries(hiddenSeries).map((s) => ({
        key: s.key,
        label: s.name,
        color: s.color,
      }));
      sourceRows = tokenTypeCostData;
    } else if (isBreakdownView) {
      viewLabel = viewMode === "provider" ? "By Provider" : "By Model";
      series = getVisibleChartSeries(breakdownSeries, hiddenSeries);
      sourceRows = breakdownChartData;
    } else {
      viewLabel = "Total";
      series = [{ key: "cost", label: "Cost", color: "var(--color-chart-blue)" }];
      sourceRows = entries;
    }
    const metricKeys = series.map((s) => s.key);
    const projection = getProjectionMetrics(
      sourceRows.at(-1),
      metricKeys,
      showPercent ? undefined : timeGranularity,
    );
    const projectionMetadata = formatProjectionMetadata(projection.projection);
    const projectionRows = buildProjectionTableRows(sourceRows.at(-1), series, projection);
    const data = pickDataKeys(sourceRows, ["label", ...metricKeys]);

    return buildMarkdownSection({
      title: "Cost Over Time",
      metadata: [
        ["View", viewLabel],
        ["Show percent", (isBreakdownView || isTokenTypeView) && showPercent],
        ["Hidden series", Array.from(hiddenSeries)],
        ...(projectionMetadata
          ? ([["Projection", projectionMetadata]] as [string, unknown][])
          : []),
      ],
      tables: [
        {
          columns: seriesToColumns({ key: "label", label: "Label" }, series),
          rows: data,
        },
        ...(projectionRows.length > 0
          ? [
              {
                title: "Projection",
                columns: [
                  { key: "label", label: "Label" },
                  { key: "series", label: "Series" },
                  { key: "actual", label: "Actual", align: "right" as const },
                  { key: "projected", label: "Projected", align: "right" as const },
                  { key: "remaining", label: "Remaining", align: "right" as const },
                ],
                rows: projectionRows,
              },
            ]
          : []),
      ],
    });
  }, [
    breakdownChartData,
    breakdownSeries,
    entries,
    hiddenSeries,
    isBreakdownView,
    isTokenTypeView,
    showPercent,
    timeGranularity,
    tokenTypeCostData,
    viewMode,
  ]);
  const markdownRegistration = useMemo(
    () => ({
      id: "cost",
      order: 40,
      markdown: chartMarkdown,
    }),
    [chartMarkdown],
  );
  useRegisterChartMarkdown(markdownRegistration);

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">Cost Over Time</h3>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={chartMarkdown} />
        </div>
        {(hasBreakdownData || hasTokenTypeCostData) && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
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
            {hasBreakdownData && (
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
            )}
            {hasBreakdownData && (
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
            )}
            {hasTokenTypeCostData && (
              <button
                onClick={() => {
                  setViewMode("tokenType");
                  setHiddenSeries(new Set());
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === "tokenType"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                By Token Type
              </button>
            )}
            {(isBreakdownView || isTokenTypeView) && (
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
      <CostAreaChart
        entries={entries}
        syncId={syncId}
        isBreakdownView={isBreakdownView}
        isTokenTypeView={isTokenTypeView}
        showPercent={showPercent}
        hiddenSeries={hiddenSeries}
        breakdownChartData={breakdownChartData}
        breakdownSeries={breakdownSeries}
        tokenTypeCostData={tokenTypeCostData}
        timeGranularity={timeGranularity}
        toggleSeries={toggleSeries}
        hoveredDataIndex={hoveredDataIndex}
        hoveredSyncSource={hoveredSyncSource}
        onHoverDataIndexChange={onHoverDataIndexChange}
      />
    </div>
  );
}

function CostAreaChart({
  entries,
  syncId,
  isBreakdownView,
  isTokenTypeView,
  showPercent,
  hiddenSeries,
  breakdownChartData,
  breakdownSeries,
  tokenTypeCostData,
  timeGranularity,
  toggleSeries,
  hoveredDataIndex,
  hoveredSyncSource,
  onHoverDataIndexChange,
}: {
  entries: NormalizedEntry[];
  syncId?: string;
  isBreakdownView: boolean;
  isTokenTypeView: boolean;
  showPercent: boolean;
  hiddenSeries: Set<string>;
  breakdownChartData: CostBreakdownChartData;
  breakdownSeries: ChartDataSeries[];
  tokenTypeCostData: TokenTypeCostData;
  timeGranularity?: TimeGranularity;
  toggleSeries: (key: string) => void;
  hoveredDataIndex: number | null;
  hoveredSyncSource: string | null;
  onHoverDataIndexChange?: (index: number | null, source?: string | null) => void;
}) {
  void syncId;
  const sourceData = useMemo(
    () =>
      (isTokenTypeView
        ? tokenTypeCostData
        : isBreakdownView
          ? breakdownChartData
          : entries) as CostChartRow[],
    [breakdownChartData, entries, isBreakdownView, isTokenTypeView, tokenTypeCostData],
  );
  const visibleSeries = useMemo(() => {
    if (isTokenTypeView) {
      return getVisibleTokenTypeCostSeries(hiddenSeries).map((series, index) => ({
        key: series.key,
        label: series.name,
        color: getChartJsColor(index),
      }));
    }
    if (isBreakdownView) {
      return getVisibleChartSeries(breakdownSeries, hiddenSeries).map((series, index) => ({
        key: series.key,
        label: series.label,
        color: getChartJsColor(index),
      }));
    }
    return [{ key: "cost", label: "Cost", color: getChartJsColor(0) }];
  }, [breakdownSeries, hiddenSeries, isBreakdownView, isTokenTypeView]);
  const visibleKeys = useMemo(() => visibleSeries.map((series) => series.key), [visibleSeries]);
  const isStackedView = isBreakdownView || isTokenTypeView;
  const projection = useMemo(
    () =>
      getProjectionMetrics(
        sourceData.at(-1),
        visibleKeys,
        showPercent ? undefined : timeGranularity,
      ),
    [showPercent, sourceData, timeGranularity, visibleKeys],
  );
  const hasProjection = projection.projection != null;
  const shouldStack = isStackedView || hasProjection;
  const chartInstanceRef = useRef<ChartJsInstance<"line"> | null>(null);
  const hoveredDataIndexRef = useRef<number | null>(hoveredDataIndex);
  hoveredDataIndexRef.current = hoveredDataIndex;
  const hoverLinePlugin = useMemo(
    () => createVerticalHoverLinePlugin<"line">(hoveredDataIndexRef),
    [],
  );
  useEffect(() => {
    syncChartHoverState(chartInstanceRef.current, hoveredDataIndex);
  }, [hoveredDataIndex, hoveredSyncSource]);
  const chartJsData = useMemo<CostChartJsData>(() => {
    const labels = sourceData.map((row) => String(row.label));
    const actualDatasets: CostChartDataset[] = visibleSeries.map((series, index) => {
      const color = series.color || getChartJsColor(index);
      return {
        type: "line",
        label: series.label,
        data: sourceData.map((row) => {
          const record = row as Record<string, unknown>;
          return isStackedView && showPercent
            ? normalizeStackValue(record, series.key, visibleKeys)
            : (asNumber(record[series.key]) ?? 0);
        }),
        borderColor: color,
        backgroundColor: isStackedView ? withOpacity(color, 0.55) : withOpacity(color, 0.2),
        borderWidth: isStackedView ? 1 : 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: isStackedView ? true : "origin",
        stack: shouldStack ? "cost" : undefined,
        tension: 0.25,
      };
    });

    const projectedDatasets: CostChartDataset[] = hasProjection
      ? visibleSeries.map((series, index) => {
          const color = series.color || getChartJsColor(index);
          return {
            type: "line",
            label: `${series.label} projected`,
            data: sourceData.map((_, rowIndex) =>
              rowIndex === sourceData.length - 1 ? (projection.remaining[series.key] ?? 0) : null,
            ),
            borderColor: withOpacity(color, 0.45),
            backgroundColor: withOpacity(color, 0.18),
            borderWidth: 1,
            borderDash: [4, 3],
            pointRadius: 3,
            pointHoverRadius: 4,
            fill: true,
            stack: "cost",
            tension: 0.25,
          };
        })
      : [];

    return { labels, datasets: [...actualDatasets, ...projectedDatasets] };
  }, [
    hasProjection,
    isStackedView,
    projection.remaining,
    shouldStack,
    showPercent,
    sourceData,
    visibleKeys,
    visibleSeries,
  ]);
  const chartJsOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external(context) {
            renderCostTooltip(context, sourceData, visibleKeys, isStackedView && showPercent);
          },
        },
      },
      scales: {
        x: {
          stacked: isStackedView,
          grid: { display: false },
          ticks: {
            color: "rgb(107, 114, 128)",
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
          },
        },
        y: {
          stacked: shouldStack,
          min: 0,
          max: isStackedView && showPercent ? 1 : undefined,
          grid: { color: "rgba(148, 163, 184, 0.2)" },
          ticks: {
            color: "rgb(107, 114, 128)",
            font: { size: 11 },
            callback(value) {
              return isStackedView && showPercent
                ? `${(Number(value) * 100).toFixed(0)}%`
                : `$${Number(value)}`;
            },
          },
        },
      },
    }),
    [isStackedView, shouldStack, showPercent, sourceData, visibleKeys],
  );
  const legendItems = isTokenTypeView
    ? TOKEN_TYPE_COST_SERIES.map((series) => ({
        key: series.key,
        name: series.name,
        color: series.color,
      }))
    : isBreakdownView
      ? breakdownSeries.map((series, index) => ({
          key: series.key,
          name: series.label,
          color: series.color ?? getChartJsColor(index),
        }))
      : [];

  return (
    <>
      <div
        className="relative h-80"
        onMouseMove={(event) =>
          onHoverDataIndexChange?.(
            getNearestDataIndexForClientX(event.currentTarget, event.clientX, sourceData.length),
            "cost",
          )
        }
      >
        <Line
          ref={chartInstanceRef}
          data={chartJsData}
          options={chartJsOptions}
          plugins={[hoverLinePlugin]}
        />
      </div>
      {legendItems.length > 0 && (
        <ChartLegend items={legendItems} hiddenSeries={hiddenSeries} toggleSeries={toggleSeries} />
      )}
    </>
  );
}

function renderCostTooltip(
  { chart, tooltip }: { chart: ChartJsInstance; tooltip: TooltipModel<"line"> },
  sourceData: readonly CostChartRow[],
  visibleKeys: readonly string[],
  showPercent: boolean,
) {
  const tooltipEl = getOrCreateExternalTooltipElement(chart, "cost");
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = "0";
    return;
  }
  const items = tooltip.dataPoints.filter((item) => {
    const value = Number(item.parsed.y);
    return Number.isFinite(value) && value !== 0;
  });
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
  body.style.gridTemplateColumns = items.length > 10 ? "repeat(2, minmax(260px, 1fr))" : "1fr";
  body.style.columnGap = "12px";
  body.style.rowGap = "3px";
  const row = sourceData[items[0]?.dataIndex ?? 0] as Record<string, unknown> | undefined;
  const total = row ? visibleKeys.reduce((sum, key) => sum + (asNumber(row[key]) ?? 0), 0) : 0;
  for (const item of items) {
    const keyIndex =
      visibleKeys.length > 0 ? item.datasetIndex % visibleKeys.length : item.datasetIndex;
    const key = visibleKeys[keyIndex] ?? "";
    const isProjectionItem = item.datasetIndex >= visibleKeys.length;
    const line = document.createElement("div");
    line.style.display = "flex";
    line.style.alignItems = "center";
    line.style.gap = "6px";
    const marker = document.createElement("span");
    marker.style.width = "8px";
    marker.style.height = "8px";
    marker.style.flex = "0 0 auto";
    marker.style.background = String(item.dataset.borderColor ?? item.dataset.backgroundColor);
    const raw = isProjectionItem ? Number(item.parsed.y ?? 0) : (asNumber(row?.[key]) ?? 0);
    const value =
      !isProjectionItem && showPercent && total > 0
        ? `${((raw / total) * 100).toFixed(1)}% (${formatCost(raw)})`
        : formatCost(raw);
    const text = document.createElement("span");
    text.textContent = `${item.dataset.label}: ${value}`;
    text.style.whiteSpace = "nowrap";
    line.append(marker, text);
    body.appendChild(line);
  }
  tooltipEl.appendChild(body);
  positionExternalTooltip(chart, tooltip, tooltipEl);
}

function ChartLegend({
  items,
  hiddenSeries,
  toggleSeries,
}: {
  items: readonly { key: string; name: string; color: string }[];
  hiddenSeries: Set<string>;
  toggleSeries: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-1">
      {items.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={() => toggleSeries(entry.key)}
          className="inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
          style={{
            opacity: hiddenSeries.has(entry.key) ? 0.3 : 1,
            fontSize: "inherit",
            color: "inherit",
            textDecoration: hiddenSeries.has(entry.key) ? "line-through" : "none",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              backgroundColor: entry.color,
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--color-text-secondary)" }}>{entry.name}</span>
        </button>
      ))}
    </div>
  );
}
