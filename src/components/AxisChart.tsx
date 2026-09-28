import { useMemo, useRef } from "react";
import "chart.js/auto";
import type { ChartData, ChartOptions } from "chart.js";
import { Chart } from "react-chartjs-2";
import { buildAxisAnalysisData, type AxisSource } from "../utils/axisAnalysis";
import { formatCacheReadRate } from "../utils/cacheEfficiency";
import { buildMarkdownSection } from "../utils/chartData";
import {
  ANALYSIS_AXIS_OPTIONS,
  type AnalysisAxisId,
  type ChartPresentationId,
} from "../utils/dashboardCatalog";
import { formatCostAxis, formatTokens } from "../utils/format";
import type { NormalizedEntry } from "../utils/normalize";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { getChartJsColor } from "./chartjs-utils";

interface Props {
  entries: NormalizedEntry[];
  sources?: readonly AxisSource[];
  axis: AnalysisAxisId;
  presentation?: ChartPresentationId;
}

const TOKEN_SERIES = [
  { key: "inputTokens", label: "Input" },
  { key: "outputTokens", label: "Output" },
  { key: "cacheCreationTokens", label: "Cache Write" },
  { key: "cacheReadTokens", label: "Cache Read" },
] as const;

type ChartKind = "bar" | "line";

export function AxisChart({ entries, sources, axis, presentation }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const option = ANALYSIS_AXIS_OPTIONS.find((item) => item.id === axis)!;
  const rows = useMemo(
    () => buildAxisAnalysisData(entries, axis, sources),
    [entries, sources, axis],
  );
  const isTokenMix = option.measure === "tokenMix";
  const isRate = option.measure === "cacheReadRate";
  const valueKey = isRate ? "cacheReadRate" : "costPerMillion";
  const unit = isTokenMix ? "Tokens" : isRate ? "Cache Read Rate" : "Cost per 1M Tokens";
  const formatValue = (value: number) =>
    isTokenMix ? formatTokens(value) : isRate ? formatCacheReadRate(value) : formatCostAxis(value);
  const noData = rows.length === 0 || (!isTokenMix && rows.every((row) => row[valueKey] === null));

  const markdown = useMemo(
    () =>
      buildMarkdownSection({
        title: option.label,
        metadata: [
          ["Analysis", option.description],
          ...(isRate
            ? [
                [
                  "Rate definition",
                  "cacheReadTokens / (inputTokens + cacheCreationTokens + cacheReadTokens)",
                ] as [string, string],
              ]
            : []),
          ...(!isTokenMix && !isRate
            ? [["Cost definition", "sum(cost) / sum(totalTokens) × 1,000,000"] as [string, string]]
            : []),
        ],
        tables: [
          {
            columns: [
              {
                key: "label",
                label: option.dimension === "period" ? "Period" : option.dimension,
                align: "left" as const,
              },
              ...(isTokenMix
                ? TOKEN_SERIES.map(({ key, label }) => ({ key, label, align: "right" as const }))
                : [
                    ...(!isRate
                      ? [
                          { key: "cost", label: "Cost", align: "right" as const },
                          { key: "totalTokens", label: "Total Tokens", align: "right" as const },
                        ]
                      : []),
                    ...(isRate
                      ? [
                          { key: "inputTokens", label: "Input", align: "right" as const },
                          {
                            key: "cacheCreationTokens",
                            label: "Cache Write",
                            align: "right" as const,
                          },
                          { key: "cacheReadTokens", label: "Cache Read", align: "right" as const },
                        ]
                      : []),
                    { key: valueKey, label: unit, align: "right" as const },
                  ]),
            ],
            rows,
          },
        ],
      }),
    [option, rows, isTokenMix, isRate, valueKey, unit],
  );
  const registration = useMemo(
    () => (rows.length ? { id: `analysis.${axis}`, order: 80, markdown } : null),
    [rows.length, axis, markdown],
  );
  useRegisterChartMarkdown(registration);

  const kind: ChartKind = option.dimension === "period" && presentation !== "bar" ? "line" : "bar";
  const categorical = option.dimension !== "period";
  const stacked = isTokenMix && presentation !== "bar";
  const dimensionLabel = option.dimension[0].toUpperCase() + option.dimension.slice(1);
  const data: ChartData<ChartKind, (number | null)[], string> = {
    labels: rows.map((row) => row.label),
    datasets: isTokenMix
      ? TOKEN_SERIES.map(({ key, label }, index) => ({
          label,
          data: rows.map((row) => row[key]),
          backgroundColor: getChartJsColor(index),
          borderColor: getChartJsColor(index),
          stack: stacked ? "tokens" : undefined,
        }))
      : [
          {
            label: unit,
            data: rows.map((row) => row[valueKey]),
            backgroundColor: getChartJsColor(0),
            borderColor: getChartJsColor(0),
            borderWidth: kind === "line" ? 2 : 0,
            pointRadius: kind === "line" ? 3 : undefined,
            spanGaps: false,
          },
        ],
  };
  const options: ChartOptions<ChartKind> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: categorical ? "y" : "x",
    animation: false,
    plugins: {
      legend: { display: isTokenMix },
      tooltip: {
        callbacks: {
          label(context) {
            const value = categorical ? context.parsed.x : context.parsed.y;
            return `${context.dataset.label}: ${value === null ? "N/A" : formatValue(value)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked,
        beginAtZero: categorical,
        title: { display: true, text: categorical ? unit : dimensionLabel },
        ticks: categorical
          ? {
              color: "rgb(107, 114, 128)",
              callback(value) {
                return formatValue(Number(value));
              },
            }
          : { color: "rgb(107, 114, 128)" },
        grid: categorical ? { color: "rgba(148, 163, 184, 0.2)" } : { display: false },
      },
      y: {
        stacked,
        beginAtZero: !categorical,
        title: { display: true, text: categorical ? dimensionLabel : unit },
        ticks: categorical
          ? { color: "rgb(107, 114, 128)" }
          : {
              color: "rgb(107, 114, 128)",
              callback(value) {
                return formatValue(Number(value));
              },
            },
        grid: categorical ? { display: false } : { color: "rgba(148, 163, 184, 0.2)" },
      },
    },
  };

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">{option.label}</h3>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={markdown} />
        </div>
      </div>
      {noData ? (
        <p className="text-sm text-text-secondary py-8 text-center">
          {rows.length === 0
            ? `No ${option.dimension} breakdown data available for this range.`
            : `No ${unit.toLowerCase()} values available (token denominator is zero).`}
        </p>
      ) : (
        <div
          className="relative"
          style={{ height: categorical ? Math.max(256, rows.length * 44 + 56) : 256 }}
        >
          <Chart type={kind} data={data} options={options} />
        </div>
      )}
    </div>
  );
}
