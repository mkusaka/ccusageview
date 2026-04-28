import { useMemo, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import { aggregateBreakdowns, type AggregatedBreakdown } from "../utils/aggregate";
import type { BreakdownMode } from "../utils/breakdown";
import { buildMarkdownSection, pickDataKeys } from "../utils/chartData";
import { formatCost, formatTokens } from "../utils/format";
import {
  createInitialModelBreakdownSortState,
  getNextModelBreakdownSortState,
  type ModelBreakdownMetric,
  type ModelBreakdownSortKey,
} from "../utils/modelBreakdownTable";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";

interface Props {
  entries: NormalizedEntry[];
}

const COLORS = [
  "var(--color-chart-blue)",
  "var(--color-chart-green)",
  "var(--color-chart-orange)",
  "var(--color-chart-purple)",
  "var(--color-chart-teal)",
  "var(--color-chart-red)",
];

const METRICS = {
  cost: { label: "Cost", format: (v: number) => formatCost(v) },
  inputTokens: { label: "Input", format: (v: number) => formatTokens(v) },
  outputTokens: { label: "Output", format: (v: number) => formatTokens(v) },
  cacheCreationTokens: { label: "Cache Create", format: (v: number) => formatTokens(v) },
  cacheReadTokens: { label: "Cache Read", format: (v: number) => formatTokens(v) },
} as const satisfies Record<ModelBreakdownMetric, { label: string; format: (v: number) => string }>;

interface TableColumn {
  key: ModelBreakdownSortKey;
  label: string;
  align: "left" | "right";
  render: (row: AggregatedBreakdown) => string;
  sortValue: (row: AggregatedBreakdown) => number | string;
}

function getTableColumns(mode: BreakdownMode): TableColumn[] {
  return [
    {
      key: "label",
      label: mode === "model" ? "Model" : "Provider",
      align: "left",
      render: (row) => row.label,
      sortValue: (row) => row.label,
    },
    {
      key: "inputTokens",
      label: "Input",
      align: "right",
      render: (row) => formatTokens(row.inputTokens),
      sortValue: (row) => row.inputTokens,
    },
    {
      key: "outputTokens",
      label: "Output",
      align: "right",
      render: (row) => formatTokens(row.outputTokens),
      sortValue: (row) => row.outputTokens,
    },
    {
      key: "cacheCreationTokens",
      label: "Cache Create",
      align: "right",
      render: (row) => formatTokens(row.cacheCreationTokens),
      sortValue: (row) => row.cacheCreationTokens,
    },
    {
      key: "cacheReadTokens",
      label: "Cache Read",
      align: "right",
      render: (row) => formatTokens(row.cacheReadTokens),
      sortValue: (row) => row.cacheReadTokens,
    },
    {
      key: "cost",
      label: "Cost",
      align: "right",
      render: (row) => formatCost(row.cost),
      sortValue: (row) => row.cost,
    },
  ];
}

interface PieDataItem {
  name: string;
  fullName: string;
  value: number;
}

function CustomPieTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ payload: PieDataItem }>;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-lg"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p className="font-mono text-xs text-text-secondary mb-1">{data.fullName}</p>
      <p className="font-medium text-text-primary">{formatValue(data.value)}</p>
    </div>
  );
}

export function ModelBreakdown({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<BreakdownMode>("model");
  const [sortState, setSortState] = useState(() => createInitialModelBreakdownSortState());

  const rows = useMemo(() => aggregateBreakdowns(entries, mode), [entries, mode]);
  const columns = useMemo(() => getTableColumns(mode), [mode]);
  const { metric, sortCol, sortDir } = sortState;

  const sortedRows = useMemo(() => {
    const column =
      columns.find((candidate) => candidate.key === sortCol) ?? columns[columns.length - 1];
    return rows.toSorted((a, b) => {
      const left = column.sortValue(a);
      const right = column.sortValue(b);
      const comparison = left < right ? -1 : left > right ? 1 : 0;
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [rows, columns, sortCol, sortDir]);

  function handleSort(key: ModelBreakdownSortKey) {
    setSortState((current) => getNextModelBreakdownSortState(current, key));
  }

  const metricConfig = METRICS[metric];
  const pieData: PieDataItem[] = sortedRows.map((row) => ({
    name: row.label,
    fullName: mode === "model" ? row.key : row.label,
    value: row[metric],
  }));
  const chartMarkdown = useMemo(
    () =>
      buildMarkdownSection({
        title: "Breakdown",
        metadata: [
          ["View", mode === "model" ? "By Model" : "By Provider"],
          ["Pie metric", metricConfig.label],
          ["Sort", `${sortCol} ${sortDir}`],
        ],
        tables: [
          {
            title: "Pie Data",
            columns: [
              { key: "fullName", label: mode === "model" ? "Model" : "Provider" },
              { key: "value", label: metricConfig.label, align: "right" },
            ],
            rows: pickDataKeys(pieData, ["fullName", "value"]),
          },
          {
            title: "Breakdown Table",
            columns: [
              { key: "label", label: mode === "model" ? "Model" : "Provider" },
              { key: "inputTokens", label: "Input", align: "right" },
              { key: "outputTokens", label: "Output", align: "right" },
              { key: "cacheCreationTokens", label: "Cache Create", align: "right" },
              { key: "cacheReadTokens", label: "Cache Read", align: "right" },
              { key: "cost", label: "Cost", align: "right" },
            ],
            rows: pickDataKeys(sortedRows, [
              "label",
              "inputTokens",
              "outputTokens",
              "cacheCreationTokens",
              "cacheReadTokens",
              "cost",
            ]),
          },
        ],
      }),
    [metricConfig.label, mode, pieData, sortCol, sortDir, sortedRows],
  );
  const markdownRegistration = useMemo(
    () =>
      sortedRows.length > 0
        ? {
            id: "breakdown",
            order: 60,
            markdown: chartMarkdown,
          }
        : null,
    [chartMarkdown, sortedRows.length],
  );
  useRegisterChartMarkdown(markdownRegistration);

  if (sortedRows.length === 0) return null;

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 shrink-0">
          <h3 className="text-sm font-medium text-text-secondary">Breakdown</h3>
          <span className="text-xs text-text-secondary whitespace-nowrap">
            Pie: {metricConfig.label}
          </span>
          <CopyImageButton targetRef={chartRef} />
          <CopyMarkdownButton markdown={chartMarkdown} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 shrink-0">
            <button
              onClick={() => setMode("model")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                mode === "model"
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              By Model
            </button>
            <button
              onClick={() => setMode("provider")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                mode === "provider"
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              By Provider
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-shrink-0 w-full lg:w-80">
          <p className="text-xs text-text-secondary px-2 mb-2">
            Click a numeric table header to change the pie metric.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
                stroke="var(--color-bg-card)"
                strokeWidth={2}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip formatValue={metricConfig.format} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-2">
            {pieData.map((item, index) => (
              <div key={item.fullName} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: COLORS[index % COLORS.length],
                    opacity: 0.85,
                  }}
                />
                <span className="text-xs text-text-secondary whitespace-nowrap">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    onClick={() => handleSort(column.key)}
                    className={`py-2 pr-4 font-medium text-text-secondary cursor-pointer hover:text-text-primary select-none whitespace-nowrap ${
                      column.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {column.label}
                    {sortCol === column.key && (
                      <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.key} className="border-b border-border/50 text-text-primary">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`py-2 pr-4 whitespace-nowrap ${
                        column.align === "right" ? "text-right" : "text-left"
                      } ${column.key === "label" ? "font-mono text-xs" : ""} ${
                        column.key === "cost" ? "font-medium" : ""
                      }`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
