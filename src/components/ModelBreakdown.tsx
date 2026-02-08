import { useMemo, useState, useRef } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import { aggregateModelBreakdowns } from "../utils/aggregate";
import { formatCost, formatTokens } from "../utils/format";
import { CopyImageButton } from "./CopyImageButton";

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

type Metric = keyof typeof METRICS;

const METRICS = {
  cost: { label: "Cost", format: (v: number) => formatCost(v), key: "cost" as const },
  inputTokens: {
    label: "Input",
    format: (v: number) => formatTokens(v),
    key: "inputTokens" as const,
  },
  outputTokens: {
    label: "Output",
    format: (v: number) => formatTokens(v),
    key: "outputTokens" as const,
  },
  cacheCreationTokens: {
    label: "Cache Create",
    format: (v: number) => formatTokens(v),
    key: "cacheCreationTokens" as const,
  },
  cacheReadTokens: {
    label: "Cache Read",
    format: (v: number) => formatTokens(v),
    key: "cacheReadTokens" as const,
  },
} as const;

interface PieDataItem {
  name: string;
  fullName: string;
  value: number;
}

// Custom tooltip showing model name and the selected metric value
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
  const [metric, setMetric] = useState<Metric>("cost");

  const models = useMemo(() => aggregateModelBreakdowns(entries), [entries]);

  // Sort by the selected metric (descending)
  const sortedModels = useMemo(
    () => models.toSorted((a, b) => b[metric] - a[metric]),
    [models, metric],
  );

  if (sortedModels.length === 0) return null;

  const metricConfig = METRICS[metric];

  const pieData: PieDataItem[] = sortedModels.map((m) => ({
    name: m.modelName.replace(/^claude-/, ""),
    fullName: m.modelName,
    value: m[metric],
  }));

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      {/* Header with metric tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-text-secondary">Model Breakdown</h3>
          <CopyImageButton targetRef={chartRef} />
        </div>
        <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5">
          {(Object.keys(METRICS) as Metric[]).map((key) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
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

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Donut chart */}
        <div className="flex-shrink-0 w-full lg:w-80">
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
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip formatValue={metricConfig.format} />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-2">
            {pieData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: COLORS[i % COLORS.length],
                    opacity: 0.85,
                  }}
                />
                <span className="text-xs text-text-secondary whitespace-nowrap">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium text-right">Input</th>
                <th className="py-2 pr-4 font-medium text-right">Output</th>
                <th className="py-2 pr-4 font-medium text-right">Cache Create</th>
                <th className="py-2 pr-4 font-medium text-right">Cache Read</th>
                <th className="py-2 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((m) => (
                <tr key={m.modelName} className="border-b border-border/50 text-text-primary">
                  <td className="py-2 pr-4 font-mono text-xs">{m.modelName}</td>
                  <td className="py-2 pr-4 text-right">{formatTokens(m.inputTokens)}</td>
                  <td className="py-2 pr-4 text-right">{formatTokens(m.outputTokens)}</td>
                  <td className="py-2 pr-4 text-right">{formatTokens(m.cacheCreationTokens)}</td>
                  <td className="py-2 pr-4 text-right">{formatTokens(m.cacheReadTokens)}</td>
                  <td className="py-2 text-right font-medium">{formatCost(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
