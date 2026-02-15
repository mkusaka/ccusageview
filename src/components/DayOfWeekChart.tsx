import { useMemo, useState, useRef } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
import { formatCost, formatTokens } from "../utils/format";
import { CopyImageButton } from "./CopyImageButton";

interface Props {
  entries: NormalizedEntry[];
}

type Metric =
  | "cost"
  | "totalTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens";

const METRICS: Record<Metric, { label: string; format: (v: number) => string }> = {
  cost: { label: "Cost", format: formatCost },
  totalTokens: { label: "Total Tokens", format: formatTokens },
  inputTokens: { label: "Input", format: formatTokens },
  outputTokens: { label: "Output", format: formatTokens },
  cacheCreationTokens: { label: "Cache Create", format: formatTokens },
  cacheReadTokens: { label: "Cache Read", format: formatTokens },
};

const METRIC_KEYS = Object.keys(METRICS) as Metric[];

// Mon=0 .. Sun=6 display order
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayBucket {
  day: string;
  avg: number;
  total: number;
  count: number;
}

function buildDayOfWeekData(entries: NormalizedEntry[], metric: Metric): DayBucket[] {
  const buckets: { total: number; count: number }[] = Array.from({ length: 7 }, () => ({
    total: 0,
    count: 0,
  }));

  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.label)) continue;
    const d = new Date(e.label + "T00:00:00");
    if (isNaN(d.getTime())) continue;
    // JS getDay: 0=Sun..6=Sat -> Mon=0..Sun=6
    const jsDay = d.getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
    buckets[dayIndex].total += e[metric];
    buckets[dayIndex].count += 1;
  }

  return buckets.map((b, i) => ({
    day: DAY_LABELS[i],
    avg: b.count > 0 ? b.total / b.count : 0,
    total: b.total,
    count: b.count,
  }));
}

export function DayOfWeekChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<Metric>("cost");

  const data = useMemo(() => buildDayOfWeekData(entries, metric), [entries, metric]);

  // Only render if we have date-parseable entries
  const hasData = data.some((d) => d.count > 0);
  if (!hasData) return null;

  const metricConfig = METRICS[metric];

  return (
    <div ref={chartRef} className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 shrink-0">
          <h3 className="text-sm font-medium text-text-secondary">Day of Week (avg)</h3>
          <CopyImageButton targetRef={chartRef} />
        </div>
        <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 overflow-x-auto">
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

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => metricConfig.format(v)}
            width={80}
          />
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const p = payload[0].payload as DayBucket;
              if (p.count === 0) return null;
              return (
                <div
                  className="px-2.5 py-1.5 rounded-md text-xs shadow-lg"
                  style={{
                    backgroundColor: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <p className="text-text-primary font-medium">{p.day}</p>
                  <p className="text-text-secondary">Avg: {metricConfig.format(p.avg)}</p>
                  <p className="text-text-secondary">Total: {metricConfig.format(p.total)}</p>
                  <p className="text-text-secondary">{p.count} days</p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="avg"
            fill="var(--color-chart-blue)"
            fillOpacity={0.7}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
