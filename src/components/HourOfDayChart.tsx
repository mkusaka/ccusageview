import { useMemo, useReducer, useRef } from "react";
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
import type { BreakdownMode } from "../utils/breakdown";
import { formatCost, formatCostAxis, formatTokens } from "../utils/format";
import { collectModels, buildModelSeries, shortenModelName, MODEL_COLORS } from "../utils/chart";
import type { ChartDataSeries, MarkdownColumn } from "../utils/chartData";
import { buildMarkdownSection, pickDataKeys, seriesToColumns } from "../utils/chartData";
import {
  buildHourOfDayByBreakdown,
  buildHourOfDayData,
  HOUR_OF_DAY_AGGREGATIONS,
  type HourOfDayAggregation,
  type HourOfDayMetric,
} from "../utils/dayOfWeek";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { SeriesLegend } from "./SeriesLegend";
import {
  asNumber,
  getChartJsColor,
  getChartJsColorForSeries,
  getOrCreateExternalTooltipElement,
  hideExternalTooltip,
  normalizeStackValue,
  positionExternalTooltip,
  withOpacity,
} from "./chartjs-utils";

interface Props {
  entries: NormalizedEntry[];
}

type ViewMode = "total" | "model" | "provider";
type HourOfDayData = ReturnType<typeof buildHourOfDayData>;
type HourOfDayBreakdownData = ReturnType<typeof buildHourOfDayByBreakdown>;
type HourOfDayChartRow = HourOfDayData[number] | HourOfDayBreakdownData[number];
type HourOfDayChartDataset = ChartDataset<"bar", number[]>;
type HourOfDayChartJsData = ChartData<"bar", number[], string>;
interface HourOfDayState {
  metric: HourOfDayMetric;
  aggregation: HourOfDayAggregation;
  viewMode: ViewMode;
  showPercent: boolean;
  hiddenSeries: Set<string>;
}

type HourOfDayAction =
  | { type: "setMetric"; metric: HourOfDayMetric }
  | { type: "setAggregation"; aggregation: HourOfDayAggregation }
  | { type: "setViewMode"; viewMode: ViewMode }
  | { type: "togglePercent" }
  | { type: "toggleSeries"; key: string }
  | { type: "setHiddenSeries"; hiddenSeries: Set<string> };

const INITIAL_HOUR_OF_DAY_STATE: HourOfDayState = {
  metric: "cost",
  aggregation: "avg",
  viewMode: "total",
  showPercent: false,
  hiddenSeries: new Set(),
};

function hourOfDayReducer(state: HourOfDayState, action: HourOfDayAction): HourOfDayState {
  switch (action.type) {
    case "setMetric":
      return { ...state, metric: action.metric };
    case "setAggregation":
      return { ...state, aggregation: action.aggregation };
    case "setViewMode":
      return {
        ...state,
        viewMode: action.viewMode,
        showPercent: action.viewMode === "total" ? false : state.showPercent,
        hiddenSeries: new Set(),
      };
    case "togglePercent":
      return { ...state, showPercent: !state.showPercent };
    case "toggleSeries": {
      const hiddenSeries = new Set(state.hiddenSeries);
      if (hiddenSeries.has(action.key)) hiddenSeries.delete(action.key);
      else hiddenSeries.add(action.key);
      return { ...state, hiddenSeries };
    }
    case "setHiddenSeries":
      return { ...state, hiddenSeries: action.hiddenSeries };
  }
}

const METRICS: Record<
  HourOfDayMetric,
  { label: string; format: (v: number) => string; axisFormat: (v: number) => string }
> = {
  cost: { label: "Cost", format: formatCost, axisFormat: formatCostAxis },
  totalTokens: { label: "Total Tokens", format: formatTokens, axisFormat: formatTokens },
  inputTokens: { label: "Input", format: formatTokens, axisFormat: formatTokens },
  outputTokens: { label: "Output", format: formatTokens, axisFormat: formatTokens },
  cacheCreationTokens: { label: "Cache Write", format: formatTokens, axisFormat: formatTokens },
  cacheReadTokens: { label: "Cache Read", format: formatTokens, axisFormat: formatTokens },
};

const METRIC_KEYS = Object.keys(METRICS) as HourOfDayMetric[];
const AGGREGATION_LABELS: Record<HourOfDayAggregation, string> = {
  avg: "Avg",
  max: "Max",
  min: "Min",
  sum: "Sum",
};

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

export function HourOfDayChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [{ metric, aggregation, viewMode, showPercent, hiddenSeries }, dispatch] = useReducer(
    hourOfDayReducer,
    INITIAL_HOUR_OF_DAY_STATE,
  );
  const breakdownMode: BreakdownMode = viewMode === "provider" ? "provider" : "model";

  const toggleSeries = (key: string) => {
    dispatch({ type: "toggleSeries", key });
  };

  const hasBreakdownData = useMemo(() => collectModels(entries).length > 0, [entries]);
  const breakdownKeys = useMemo(
    () => (hasBreakdownData ? collectModels(entries, breakdownMode) : []),
    [entries, hasBreakdownData, breakdownMode],
  );

  const data = useMemo(() => buildHourOfDayData(entries, metric), [entries, metric]);
  const breakdownData = useMemo(
    () =>
      hasBreakdownData
        ? buildHourOfDayByBreakdown(entries, metric, breakdownKeys, breakdownMode, aggregation)
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
      const series = getVisibleChartSeries(breakdownSeries, hiddenSeries);
      return buildMarkdownSection({
        title: "Hour of Day",
        metadata: [
          ["Metric", metricConfig.label],
          ["Aggregation", AGGREGATION_LABELS[aggregation]],
          ["View", viewMode === "provider" ? "By Provider" : "By Model"],
          ["Show percent", showPercent],
          ["Hidden series", Array.from(hiddenSeries)],
        ],
        tables: [
          {
            columns: seriesToColumns({ key: "hour", label: "Hour" }, series),
            rows: pickDataKeys(breakdownData, ["hour", ...series.map((item) => item.key)]),
          },
        ],
      });
    }

    const columns: MarkdownColumn[] = [
      { key: "hour", label: "Hour" },
      { key: "avg", label: "Avg", align: "right" },
      { key: "max", label: "Max", align: "right" },
      { key: "min", label: "Min", align: "right" },
      { key: "sum", label: "Sum", align: "right" },
      { key: "count", label: "Hours", align: "right" },
    ];

    return buildMarkdownSection({
      title: "Hour of Day",
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
            id: "hour-of-day",
            order: 35,
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
          <h3 className="text-sm font-medium text-text-secondary">Hour of Day</h3>
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
            {HOUR_OF_DAY_AGGREGATIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => dispatch({ type: "setAggregation", aggregation: key })}
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
                  dispatch({ type: "setViewMode", viewMode: "total" });
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
                  dispatch({ type: "setViewMode", viewMode: "model" });
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
                  dispatch({ type: "setViewMode", viewMode: "provider" });
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
                  onClick={() => dispatch({ type: "togglePercent" })}
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
                onClick={() => dispatch({ type: "setMetric", metric: key })}
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

      <HourOfDayBarChart
        aggregation={aggregation}
        breakdownData={breakdownData}
        breakdownMode={breakdownMode}
        breakdownSeries={breakdownSeries}
        data={data}
        hiddenSeries={hiddenSeries}
        isBreakdownView={isBreakdownView}
        metricConfig={metricConfig}
        showPercent={showPercent}
        toggleSeries={toggleSeries}
        onHiddenSeriesChange={(nextHiddenSeries) =>
          dispatch({ type: "setHiddenSeries", hiddenSeries: nextHiddenSeries })
        }
      />
    </div>
  );
}

function HourOfDayBarChart({
  aggregation,
  breakdownData,
  breakdownMode,
  breakdownSeries,
  data,
  hiddenSeries,
  isBreakdownView,
  metricConfig,
  showPercent,
  toggleSeries,
  onHiddenSeriesChange,
}: {
  aggregation: HourOfDayAggregation;
  breakdownData: HourOfDayBreakdownData;
  breakdownMode: BreakdownMode;
  breakdownSeries: ChartDataSeries[];
  data: HourOfDayData;
  hiddenSeries: Set<string>;
  isBreakdownView: boolean;
  metricConfig: (typeof METRICS)[HourOfDayMetric];
  showPercent: boolean;
  toggleSeries: (key: string) => void;
  onHiddenSeriesChange: (hiddenSeries: Set<string>) => void;
}) {
  const sourceData = (isBreakdownView ? breakdownData : data) as HourOfDayChartRow[];
  const visibleSeries = useMemo(() => {
    if (!isBreakdownView) {
      return [
        { key: aggregation, label: AGGREGATION_LABELS[aggregation], color: getChartJsColor(0) },
      ];
    }
    return getVisibleChartSeries(breakdownSeries, hiddenSeries).map((series) => ({
      key: series.key,
      label: series.label,
      color: getChartJsColorForSeries(series.key, breakdownSeries),
    }));
  }, [aggregation, breakdownSeries, hiddenSeries, isBreakdownView]);
  const visibleKeys = useMemo(() => visibleSeries.map((series) => series.key), [visibleSeries]);
  const chartJsData = useMemo<HourOfDayChartJsData>(() => {
    const labels = sourceData.map((row) => String((row as Record<string, unknown>).hour));
    const datasets: HourOfDayChartDataset[] = visibleSeries.map((series) => {
      const color = series.color;
      return {
        type: "bar",
        label: series.label,
        data: sourceData.map((row) => {
          const record = row as Record<string, unknown>;
          return isBreakdownView && showPercent
            ? normalizeStackValue(record, series.key, visibleKeys)
            : (asNumber(record[series.key]) ?? 0);
        }),
        backgroundColor: withOpacity(color, isBreakdownView ? 0.85 : 0.7),
        borderColor: color,
        borderWidth: 0,
        borderRadius: isBreakdownView ? 0 : 4,
        stack: isBreakdownView ? "breakdown" : undefined,
      };
    });
    return { labels, datasets };
  }, [isBreakdownView, showPercent, sourceData, visibleKeys, visibleSeries]);
  const chartJsOptions = useMemo<ChartOptions<"bar">>(
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
            renderHourOfDayTooltip(context, {
              aggregation,
              breakdownMode,
              data,
              isBreakdownView,
              metricConfig,
              showPercent,
              sourceData,
              visibleKeys,
            });
          },
        },
      },
      scales: {
        x: {
          stacked: isBreakdownView,
          grid: { display: false },
          ticks: { color: "rgb(107, 114, 128)", font: { size: 11 } },
        },
        y: {
          stacked: isBreakdownView,
          min: 0,
          max: isBreakdownView && showPercent ? 1 : undefined,
          grid: { color: "rgba(148, 163, 184, 0.2)" },
          ticks: {
            color: "rgb(107, 114, 128)",
            font: { size: 11 },
            callback(value) {
              return isBreakdownView && showPercent
                ? `${(Number(value) * 100).toFixed(0)}%`
                : metricConfig.axisFormat(Number(value));
            },
          },
        },
      },
    }),
    [
      aggregation,
      breakdownMode,
      data,
      isBreakdownView,
      metricConfig,
      showPercent,
      sourceData,
      visibleKeys,
    ],
  );

  return (
    <>
      <div className="relative h-60">
        <Bar data={chartJsData} options={chartJsOptions} />
      </div>
      {isBreakdownView && (
        <SeriesLegend
          items={breakdownSeries.map((series) => ({
            key: series.key,
            label: series.label,
            color: series.color ?? "",
          }))}
          hiddenSeries={hiddenSeries}
          onToggleSeries={toggleSeries}
          onHiddenSeriesChange={onHiddenSeriesChange}
        />
      )}
    </>
  );
}

function renderHourOfDayTooltip(
  { chart, tooltip }: { chart: ChartJsInstance; tooltip: TooltipModel<"bar"> },
  {
    aggregation,
    breakdownMode,
    data,
    isBreakdownView,
    metricConfig,
    showPercent,
    sourceData,
    visibleKeys,
  }: {
    aggregation: HourOfDayAggregation;
    breakdownMode: BreakdownMode;
    data: HourOfDayData;
    isBreakdownView: boolean;
    metricConfig: (typeof METRICS)[HourOfDayMetric];
    showPercent: boolean;
    sourceData: readonly HourOfDayChartRow[];
    visibleKeys: readonly string[];
  },
) {
  const tooltipEl = getOrCreateExternalTooltipElement(chart, "hour-of-day");
  if (tooltip.opacity === 0) {
    hideExternalTooltip(tooltipEl);
    return;
  }
  tooltipEl.replaceChildren();
  if (!isBreakdownView) {
    const label = tooltip.title[0] ?? "";
    const bucket = data.find((item) => String(item.hour) === label);
    if (!bucket || bucket.count === 0) {
      hideExternalTooltip(tooltipEl);
      return;
    }
    appendTooltipLine(tooltipEl, `${bucket.hour}:00`, true);
    appendTooltipLine(
      tooltipEl,
      `${AGGREGATION_LABELS[aggregation]}: ${metricConfig.format(bucket[aggregation])}`,
    );
    for (const key of HOUR_OF_DAY_AGGREGATIONS) {
      if (key === aggregation) continue;
      appendTooltipLine(
        tooltipEl,
        `${AGGREGATION_LABELS[key]}: ${metricConfig.format(bucket[key])}`,
      );
    }
    appendTooltipLine(tooltipEl, `${bucket.count} hours`);
    positionExternalTooltip(chart, tooltip, tooltipEl);
    return;
  }

  const items = tooltip.dataPoints.filter((item) => {
    const value = Number(item.parsed.y);
    return Number.isFinite(value) && value !== 0;
  });
  if (items.length === 0) {
    hideExternalTooltip(tooltipEl);
    return;
  }
  appendTooltipLine(tooltipEl, tooltip.title.join(" "), true);
  const row = sourceData[items[0]?.dataIndex ?? 0] as Record<string, unknown> | undefined;
  const total = row ? visibleKeys.reduce((sum, key) => sum + (asNumber(row[key]) ?? 0), 0) : 0;
  for (const item of items) {
    const key = visibleKeys[item.datasetIndex] ?? "";
    const raw = asNumber(row?.[key]) ?? 0;
    const label =
      breakdownMode === "model"
        ? shortenModelName(String(item.dataset.label ?? ""))
        : String(item.dataset.label ?? "");
    const value =
      showPercent && total > 0
        ? `${((raw / total) * 100).toFixed(1)}% (${metricConfig.format(raw)})`
        : metricConfig.format(Number(item.parsed.y ?? 0));
    appendTooltipLine(tooltipEl, `${label}: ${value}`, false, String(item.dataset.borderColor));
  }
  positionExternalTooltip(chart, tooltip, tooltipEl);
}

function appendTooltipLine(
  tooltipEl: HTMLDivElement,
  text: string,
  isTitle = false,
  color?: string,
) {
  const line = document.createElement("div");
  line.style.display = "flex";
  line.style.alignItems = "center";
  line.style.gap = "6px";
  line.style.marginBottom = isTitle ? "6px" : "3px";
  if (color) {
    const marker = document.createElement("span");
    marker.style.width = "8px";
    marker.style.height = "8px";
    marker.style.flex = "0 0 auto";
    marker.style.background = color;
    line.appendChild(marker);
  }
  const value = document.createElement("span");
  value.textContent = text;
  value.style.whiteSpace = "nowrap";
  if (isTitle) value.style.fontWeight = "600";
  line.appendChild(value);
  tooltipEl.appendChild(line);
}
