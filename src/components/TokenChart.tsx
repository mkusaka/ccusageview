import { useEffect, useMemo, useRef, useState } from "react";
import "chart.js/auto";
import type {
  Chart as ChartJsInstance,
  ChartData,
  ChartDataset,
  ChartOptions,
  TooltipModel,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { NormalizedEntry } from "../utils/normalize";
import type { TimeGranularity } from "../utils/projection";
import { formatProjectionMetadata, getProjectionMetrics } from "../utils/projection";
import type { BreakdownMode } from "../utils/breakdown";
import { formatTokens } from "../utils/format";
import {
  collectModels,
  buildModelSeries,
  buildTokenTypeByModel,
  MODEL_COLORS,
} from "../utils/chart";
import type { ModelTokenType } from "../utils/chart";
import type { ChartDataSeries } from "../utils/chartData";
import { buildMarkdownSection, pickDataKeys, seriesToColumns } from "../utils/chartData";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { SeriesLegend } from "./SeriesLegend";
import {
  asNumber,
  buildExternalTooltipSignature,
  createVerticalHoverLinePlugin,
  getActiveDataIndex,
  getChartJsColor,
  getChartJsColorForSeries,
  getOrCreateExternalTooltipElement,
  getParsedTooltipValue,
  normalizeStackValue,
  positionExternalTooltip,
  shouldSyncChartHover,
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

const TYPE_SERIES = [
  { key: "inputTokens", name: "Input", color: "var(--color-chart-blue)" },
  { key: "outputTokens", name: "Output", color: "var(--color-chart-green)" },
  {
    key: "cacheCreationTokens",
    name: "Cache Write",
    color: "var(--color-chart-orange)",
  },
  {
    key: "cacheReadTokens",
    name: "Cache Read",
    color: "var(--color-chart-purple)",
  },
] as const;

const TOKEN_TYPE_TABS: { key: ModelTokenType; label: string }[] = [
  { key: "totalTokens", label: "Total" },
  { key: "inputTokens", label: "Input" },
  { key: "outputTokens", label: "Output" },
  { key: "cacheCreationTokens", label: "Cache Write" },
  { key: "cacheReadTokens", label: "Cache Read" },
];

type ViewMode = "type" | "model" | "provider" | "providerModel";
type TokenTypeSeries = (typeof TYPE_SERIES)[number];
type TokenBreakdownChartData = ReturnType<typeof buildTokenTypeByModel>;
type TokenChartRow = NormalizedEntry | TokenBreakdownChartData[number];
type TokenChartDataset = ChartDataset<"bar", number[]>;
type TokenChartJsData = ChartData<"bar", number[], string>;

function getTypeSeries(tokenType: ModelTokenType): TokenTypeSeries[] {
  if (tokenType === "totalTokens") return [...TYPE_SERIES];
  return TYPE_SERIES.filter((series) => series.key === tokenType);
}

function getVisibleTypeSeries(
  typeSeries: readonly TokenTypeSeries[],
  hiddenSeries: Set<string>,
): TokenTypeSeries[] {
  const visible: TokenTypeSeries[] = [];
  for (const series of typeSeries) {
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
  sourceRow: TokenChartRow | undefined,
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

export function TokenChart({
  entries,
  syncId,
  timeGranularity,
  hoveredDataIndex = null,
  hoveredSyncSource = null,
  onHoverDataIndexChange,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [breakdownTokenType, setBreakdownTokenType] = useState<ModelTokenType>("inputTokens");
  const [typeTokenType, setTypeTokenType] = useState<ModelTokenType>("totalTokens");
  const [showPercent, setShowPercent] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
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
  const providerKeys = useMemo(
    () => (hasBreakdownData ? collectModels(entries, "provider") : []),
    [entries, hasBreakdownData],
  );
  const selectedProvider =
    providerFilter && providerKeys.includes(providerFilter)
      ? providerFilter
      : (providerKeys[0] ?? null);
  const isProviderModelView = viewMode === "providerModel";

  useEffect(() => {
    setProviderFilter((current) => {
      if (current && providerKeys.includes(current)) return current;
      return providerKeys[0] ?? null;
    });
  }, [providerKeys]);

  const breakdownKeys = useMemo(
    () =>
      hasBreakdownData
        ? collectModels(entries, breakdownMode, isProviderModelView ? selectedProvider : undefined)
        : [],
    [entries, hasBreakdownData, breakdownMode, isProviderModelView, selectedProvider],
  );

  const breakdownChartData = useMemo(
    () =>
      hasBreakdownData
        ? buildTokenTypeByModel(
            entries,
            breakdownTokenType,
            breakdownMode,
            isProviderModelView ? selectedProvider : undefined,
          )
        : [],
    [
      entries,
      hasBreakdownData,
      breakdownTokenType,
      breakdownMode,
      isProviderModelView,
      selectedProvider,
    ],
  );

  const breakdownSeries = useMemo(
    () =>
      hasBreakdownData
        ? buildModelSeries(
            breakdownKeys,
            entries,
            MODEL_COLORS,
            breakdownMode,
            isProviderModelView ? selectedProvider : undefined,
          )
        : [],
    [
      breakdownKeys,
      entries,
      hasBreakdownData,
      breakdownMode,
      isProviderModelView,
      selectedProvider,
    ],
  );

  const isBreakdownView =
    (viewMode === "model" || viewMode === "provider" || isProviderModelView) && hasBreakdownData;
  const selectedTokenType = viewMode === "type" ? typeTokenType : breakdownTokenType;
  const typeSeries = useMemo(() => getTypeSeries(typeTokenType), [typeTokenType]);
  const isTokenTypeSelectorVisible = viewMode === "type" || isBreakdownView;
  const chartMarkdown = useMemo(() => {
    let series: ChartDataSeries[];
    let sourceRows: readonly TokenChartRow[];
    let viewLabel: string;

    if (isBreakdownView) {
      viewLabel =
        viewMode === "provider"
          ? "By Provider"
          : isProviderModelView
            ? "By Provider → Model"
            : "By Model";
      series = getVisibleChartSeries(breakdownSeries, hiddenSeries);
      sourceRows = breakdownChartData;
    } else {
      viewLabel = "By Type";
      series = getVisibleTypeSeries(typeSeries, hiddenSeries).map((s) => ({
        key: s.key,
        label: s.name,
        color: s.color,
      }));
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
      title: "Token Breakdown",
      metadata: [
        ["View", viewLabel],
        ...(isProviderModelView
          ? ([["Provider", selectedProvider ?? "None"]] as [string, unknown][])
          : []),
        ["Token type", TOKEN_TYPE_TABS.find((tab) => tab.key === selectedTokenType)?.label],
        ["Show percent", showPercent],
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
    isProviderModelView,
    selectedTokenType,
    selectedProvider,
    showPercent,
    timeGranularity,
    typeSeries,
    viewMode,
  ]);
  const markdownRegistration = useMemo(
    () => ({
      id: "tokens",
      order: 50,
      markdown: chartMarkdown,
    }),
    [chartMarkdown],
  );
  useRegisterChartMarkdown(markdownRegistration);

  const handleTokenTypeChange = (nextTokenType: ModelTokenType) => {
    if (viewMode === "type") setTypeTokenType(nextTokenType);
    else setBreakdownTokenType(nextTokenType);
    setHiddenSeries(new Set());
  };

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">Token Breakdown</h3>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={chartMarkdown} />
        </div>
        <div className="flex items-center gap-1">
          {hasBreakdownData && (
            <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
              <button
                onClick={() => {
                  setViewMode("type");
                  setHiddenSeries(new Set());
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === "type"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                By Type
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
              <button
                onClick={() => {
                  setViewMode("providerModel");
                  setHiddenSeries(new Set());
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  viewMode === "providerModel"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                By Provider → Model
              </button>
            </div>
          )}
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
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
          </div>
        </div>
      </div>
      {isProviderModelView && selectedProvider && (
        <label className="flex items-center gap-2 mb-3 w-fit text-xs text-text-secondary">
          <span>Provider</span>
          <select
            value={selectedProvider}
            onChange={(event) => {
              setProviderFilter(event.target.value);
              setHiddenSeries(new Set());
            }}
            className="px-2 py-0.5 text-xs rounded border border-border bg-bg-card text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent"
          >
            {providerKeys.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
      )}
      {isTokenTypeSelectorVisible && (
        <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 mb-3 w-fit">
          {TOKEN_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTokenTypeChange(tab.key)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                selectedTokenType === tab.key
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <TokenBarChart
        entries={entries}
        syncId={syncId}
        isBreakdownView={isBreakdownView}
        typeSeries={typeSeries}
        showPercent={showPercent}
        hiddenSeries={hiddenSeries}
        breakdownChartData={breakdownChartData}
        breakdownSeries={breakdownSeries}
        timeGranularity={timeGranularity}
        toggleSeries={toggleSeries}
        onHiddenSeriesChange={setHiddenSeries}
        hoveredDataIndex={hoveredDataIndex}
        hoveredSyncSource={hoveredSyncSource}
        onHoverDataIndexChange={onHoverDataIndexChange}
      />
    </div>
  );
}

function TokenBarChart({
  entries,
  syncId,
  isBreakdownView,
  typeSeries,
  showPercent,
  hiddenSeries,
  breakdownChartData,
  breakdownSeries,
  timeGranularity,
  toggleSeries,
  onHiddenSeriesChange,
  hoveredDataIndex,
  hoveredSyncSource,
  onHoverDataIndexChange,
}: {
  entries: NormalizedEntry[];
  syncId?: string;
  isBreakdownView: boolean;
  typeSeries: TokenTypeSeries[];
  showPercent: boolean;
  hiddenSeries: Set<string>;
  breakdownChartData: TokenBreakdownChartData;
  breakdownSeries: ChartDataSeries[];
  timeGranularity?: TimeGranularity;
  toggleSeries: (key: string) => void;
  onHiddenSeriesChange: (hiddenSeries: Set<string>) => void;
  hoveredDataIndex: number | null;
  hoveredSyncSource: string | null;
  onHoverDataIndexChange?: (index: number | null, source?: string | null) => void;
}) {
  void syncId;
  const sourceData = useMemo(
    () => (isBreakdownView ? breakdownChartData : entries) as TokenChartRow[],
    [breakdownChartData, entries, isBreakdownView],
  );
  const visibleSeries = useMemo(() => {
    if (isBreakdownView) {
      return getVisibleChartSeries(breakdownSeries, hiddenSeries).map((series) => ({
        key: series.key,
        label: series.label,
        color: getChartJsColorForSeries(series.key, breakdownSeries),
      }));
    }
    return getVisibleTypeSeries(typeSeries, hiddenSeries).map((series) => ({
      key: series.key,
      label: series.name,
      color: getChartJsColorForSeries(series.key, TYPE_SERIES),
    }));
  }, [breakdownSeries, hiddenSeries, isBreakdownView, typeSeries]);
  const visibleKeys = useMemo(() => visibleSeries.map((series) => series.key), [visibleSeries]);
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
  const chartInstanceRef = useRef<ChartJsInstance<"bar"> | null>(null);
  const hoveredDataIndexRef = useRef<number | null>(hoveredDataIndex);
  hoveredDataIndexRef.current = hoveredDataIndex;
  const hoverLinePlugin = useMemo(
    () => createVerticalHoverLinePlugin<"bar">(hoveredDataIndexRef),
    [],
  );
  useEffect(() => {
    if (!shouldSyncChartHover(hoveredSyncSource, "tokens")) return;
    syncChartHoverState(chartInstanceRef.current, hoveredDataIndex);
  }, [hoveredDataIndex, hoveredSyncSource]);
  const chartJsData = useMemo<TokenChartJsData>(() => {
    const labels = sourceData.map((row) => String(row.label));
    const actualDatasets: TokenChartDataset[] = visibleSeries.map((series) => {
      const color = series.color;
      return {
        type: "bar",
        label: series.label,
        data: sourceData.map((row) => {
          const record = row as Record<string, unknown>;
          return showPercent
            ? normalizeStackValue(record, series.key, visibleKeys)
            : (asNumber(record[series.key]) ?? 0);
        }),
        backgroundColor: withOpacity(color, 0.85),
        borderColor: color,
        borderWidth: 0,
        stack: "tokens",
      };
    });

    const projectedDatasets: TokenChartDataset[] = hasProjection
      ? visibleSeries.map((series) => {
          const color = series.color;
          return {
            type: "bar",
            label: `${series.label} projected`,
            data: sourceData.map((_, rowIndex) =>
              rowIndex === sourceData.length - 1 ? (projection.remaining[series.key] ?? 0) : 0,
            ),
            backgroundColor: withOpacity(color, 0.28),
            borderColor: withOpacity(color, 0.45),
            borderWidth: 0,
            stack: "tokens",
          };
        })
      : [];

    return { labels, datasets: [...actualDatasets, ...projectedDatasets] };
  }, [hasProjection, projection.remaining, showPercent, sourceData, visibleKeys, visibleSeries]);
  const chartJsOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: { mode: "index", intersect: false },
      onHover(_event, elements) {
        const nextIndex = getActiveDataIndex(elements);
        hoveredDataIndexRef.current = nextIndex;
        onHoverDataIndexChange?.(nextIndex, "tokens");
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external(context) {
            renderTokenTooltip(context, sourceData, visibleKeys, showPercent);
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: "rgb(107, 114, 128)",
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
          },
        },
        y: {
          stacked: true,
          min: 0,
          max: showPercent ? 1 : undefined,
          grid: { color: "rgba(148, 163, 184, 0.2)" },
          ticks: {
            color: "rgb(107, 114, 128)",
            font: { size: 11 },
            callback(value) {
              return showPercent
                ? `${(Number(value) * 100).toFixed(0)}%`
                : formatTokens(Number(value));
            },
          },
        },
      },
    }),
    [onHoverDataIndexChange, showPercent, sourceData, visibleKeys],
  );
  const legendItems = isBreakdownView
    ? breakdownSeries.map((series, index) => ({
        key: series.key,
        label: series.label,
        color: series.color ?? getChartJsColor(index),
      }))
    : typeSeries.map((series) => ({ key: series.key, label: series.name, color: series.color }));

  return (
    <>
      <div className="relative h-96">
        <Bar
          ref={chartInstanceRef}
          data={chartJsData}
          options={chartJsOptions}
          plugins={[hoverLinePlugin]}
        />
      </div>
      <SeriesLegend
        items={legendItems}
        hiddenSeries={hiddenSeries}
        onToggleSeries={toggleSeries}
        onHiddenSeriesChange={onHiddenSeriesChange}
      />
    </>
  );
}

function renderTokenTooltip(
  { chart, tooltip }: { chart: ChartJsInstance; tooltip: TooltipModel<"bar"> },
  sourceData: readonly TokenChartRow[],
  visibleKeys: readonly string[],
  showPercent: boolean,
) {
  const tooltipEl = getOrCreateExternalTooltipElement(chart, "tokens");
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
  const row = sourceData[items[0]?.dataIndex ?? 0] as Record<string, unknown> | undefined;
  const total = row ? visibleKeys.reduce((sum, key) => sum + (asNumber(row[key]) ?? 0), 0) : 0;
  const signature = buildExternalTooltipSignature(
    tooltip.title,
    items.map((item) => ({
      dataIndex: item.dataIndex,
      datasetIndex: item.datasetIndex,
      value: getParsedTooltipValue(item),
      label: item.dataset.label ?? "",
      color: String(item.dataset.borderColor ?? item.dataset.backgroundColor),
    })),
  );
  if (tooltipEl.dataset.chartjsTooltipSignature !== signature) {
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
    for (const item of items) {
      const keyIndex =
        visibleKeys.length > 0 ? item.datasetIndex % visibleKeys.length : item.datasetIndex;
      const key = visibleKeys[keyIndex] ?? "";
      const isProjectionItem = item.datasetIndex >= visibleKeys.length;
      const raw = isProjectionItem ? Number(item.parsed.y ?? 0) : (asNumber(row?.[key]) ?? 0);
      const value =
        !isProjectionItem && showPercent && total > 0
          ? `${((raw / total) * 100).toFixed(1)}% (${formatTokens(raw)})`
          : formatTokens(raw);
      const line = document.createElement("div");
      line.style.display = "flex";
      line.style.alignItems = "center";
      line.style.gap = "6px";
      const marker = document.createElement("span");
      marker.style.width = "8px";
      marker.style.height = "8px";
      marker.style.flex = "0 0 auto";
      marker.style.background = String(item.dataset.borderColor ?? item.dataset.backgroundColor);
      const text = document.createElement("span");
      text.textContent = `${item.dataset.label}: ${value}`;
      text.style.whiteSpace = "nowrap";
      line.append(marker, text);
      body.appendChild(line);
    }
    tooltipEl.appendChild(body);
    tooltipEl.dataset.chartjsTooltipSignature = signature;
  }
  positionExternalTooltip(chart, tooltip, tooltipEl);
}
