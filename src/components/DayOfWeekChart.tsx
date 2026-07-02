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
  buildDayOfWeekByBreakdown,
  buildDayOfWeekData,
  DAY_OF_WEEK_AGGREGATIONS,
  type DayOfWeekAggregation,
  type DayOfWeekMetric,
} from "../utils/dayOfWeek";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import {
  asNumber,
  getChartJsColor,
  getOrCreateExternalTooltipElement,
  normalizeStackValue,
  positionExternalTooltip,
  withOpacity,
} from "./chartjs-utils";

interface Props {
  entries: NormalizedEntry[];
}

type ViewMode = "total" | "model" | "provider";
type DayOfWeekData = ReturnType<typeof buildDayOfWeekData>;
type DayOfWeekBreakdownData = ReturnType<typeof buildDayOfWeekByBreakdown>;
type DayOfWeekChartRow = DayOfWeekData[number] | DayOfWeekBreakdownData[number];
type DayOfWeekChartDataset = ChartDataset<"bar", number[]>;
type DayOfWeekChartJsData = ChartData<"bar", number[], string>;
interface DayOfWeekState {
  metric: DayOfWeekMetric;
  aggregation: DayOfWeekAggregation;
  viewMode: ViewMode;
  showPercent: boolean;
  hiddenSeries: Set<string>;
}

type DayOfWeekAction =
  | { type: "setMetric"; metric: DayOfWeekMetric }
  | { type: "setAggregation"; aggregation: DayOfWeekAggregation }
  | { type: "setViewMode"; viewMode: ViewMode }
  | { type: "togglePercent" }
  | { type: "toggleSeries"; key: string };

const INITIAL_DAY_OF_WEEK_STATE: DayOfWeekState = {
  metric: "cost",
  aggregation: "avg",
  viewMode: "total",
  showPercent: false,
  hiddenSeries: new Set(),
};

function dayOfWeekReducer(state: DayOfWeekState, action: DayOfWeekAction): DayOfWeekState {
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
  }
}

const METRICS: Record<
  DayOfWeekMetric,
  { label: string; format: (v: number) => string; axisFormat: (v: number) => string }
> = {
  cost: { label: "Cost", format: formatCost, axisFormat: formatCostAxis },
  totalTokens: { label: "Total Tokens", format: formatTokens, axisFormat: formatTokens },
  inputTokens: { label: "Input", format: formatTokens, axisFormat: formatTokens },
  outputTokens: { label: "Output", format: formatTokens, axisFormat: formatTokens },
  cacheCreationTokens: { label: "Cache Create", format: formatTokens, axisFormat: formatTokens },
  cacheReadTokens: { label: "Cache Read", format: formatTokens, axisFormat: formatTokens },
};

const METRIC_KEYS = Object.keys(METRICS) as DayOfWeekMetric[];
const AGGREGATION_LABELS: Record<DayOfWeekAggregation, string> = {
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

export function DayOfWeekChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [{ metric, aggregation, viewMode, showPercent, hiddenSeries }, dispatch] = useReducer(
    dayOfWeekReducer,
    INITIAL_DAY_OF_WEEK_STATE,
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
      const series = getVisibleChartSeries(breakdownSeries, hiddenSeries);
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

      <DayOfWeekBarChart
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
      />
    </div>
  );
}

function DayOfWeekBarChart({
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
}: {
  aggregation: DayOfWeekAggregation;
  breakdownData: DayOfWeekBreakdownData;
  breakdownMode: BreakdownMode;
  breakdownSeries: ChartDataSeries[];
  data: DayOfWeekData;
  hiddenSeries: Set<string>;
  isBreakdownView: boolean;
  metricConfig: (typeof METRICS)[DayOfWeekMetric];
  showPercent: boolean;
  toggleSeries: (key: string) => void;
}) {
  const sourceData = useMemo(
    () => (isBreakdownView ? breakdownData : data) as DayOfWeekChartRow[],
    [breakdownData, data, isBreakdownView],
  );
  const visibleSeries = useMemo(() => {
    if (!isBreakdownView) {
      return [
        { key: aggregation, label: AGGREGATION_LABELS[aggregation], color: getChartJsColor(0) },
      ];
    }
    return getVisibleChartSeries(breakdownSeries, hiddenSeries).map((series, index) => ({
      key: series.key,
      label: series.label,
      color: getChartJsColor(index),
    }));
  }, [aggregation, breakdownSeries, hiddenSeries, isBreakdownView]);
  const visibleKeys = useMemo(() => visibleSeries.map((series) => series.key), [visibleSeries]);
  const chartJsData = useMemo<DayOfWeekChartJsData>(() => {
    const labels = sourceData.map((row) => String((row as Record<string, unknown>).day));
    const datasets: DayOfWeekChartDataset[] = visibleSeries.map((series, index) => {
      const color = series.color || getChartJsColor(index);
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
            renderDayOfWeekTooltip(context, {
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
    </>
  );
}

function renderDayOfWeekTooltip(
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
    aggregation: DayOfWeekAggregation;
    breakdownMode: BreakdownMode;
    data: DayOfWeekData;
    isBreakdownView: boolean;
    metricConfig: (typeof METRICS)[DayOfWeekMetric];
    showPercent: boolean;
    sourceData: readonly DayOfWeekChartRow[];
    visibleKeys: readonly string[];
  },
) {
  const tooltipEl = getOrCreateExternalTooltipElement(chart, "day-of-week");
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = "0";
    return;
  }
  tooltipEl.replaceChildren();
  if (!isBreakdownView) {
    const label = tooltip.title[0] ?? "";
    const bucket = data.find((item) => item.day === label);
    if (!bucket || bucket.count === 0) {
      tooltipEl.style.opacity = "0";
      return;
    }
    appendTooltipLine(tooltipEl, bucket.day, true);
    appendTooltipLine(
      tooltipEl,
      `${AGGREGATION_LABELS[aggregation]}: ${metricConfig.format(bucket[aggregation])}`,
    );
    for (const key of DAY_OF_WEEK_AGGREGATIONS) {
      if (key === aggregation) continue;
      appendTooltipLine(
        tooltipEl,
        `${AGGREGATION_LABELS[key]}: ${metricConfig.format(bucket[key])}`,
      );
    }
    appendTooltipLine(tooltipEl, `${bucket.count} days`);
    positionExternalTooltip(chart, tooltip, tooltipEl);
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
