import { useMemo, useState, useRef, useEffect } from "react";
import type { NormalizedEntry } from "../utils/normalize";
import { formatCost, formatTokens } from "../utils/format";

interface Props {
  entries: NormalizedEntry[];
}

// All metrics stored per day so we can switch without recomputing the grid
interface DayData {
  date: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

type Metric = keyof typeof METRICS;

const METRICS = {
  cost: { label: "Cost", format: (v: number) => formatCost(v) },
  inputTokens: { label: "Input", format: (v: number) => formatTokens(v) },
  outputTokens: { label: "Output", format: (v: number) => formatTokens(v) },
  cacheCreationTokens: {
    label: "Cache Create",
    format: (v: number) => formatTokens(v),
  },
  cacheReadTokens: {
    label: "Cache Read",
    format: (v: number) => formatTokens(v),
  },
  totalTokens: { label: "Total Tokens", format: (v: number) => formatTokens(v) },
} as const;

// Build a map of date -> aggregated values from normalized entries
function buildDayMap(entries: NormalizedEntry[]): Map<string, DayData> {
  const map = new Map<string, DayData>();

  function getOrCreate(dateStr: string): DayData {
    let d = map.get(dateStr);
    if (!d) {
      d = {
        date: dateStr,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
      };
      map.set(dateStr, d);
    }
    return d;
  }

  for (const entry of entries) {
    const label = entry.label;
    let dateStr: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      dateStr = label;
    } else if (/^\d{4}-\d{2}$/.test(label)) {
      dateStr = label + "-01";
    }
    if (!dateStr) continue;

    const d = getOrCreate(dateStr);
    d.cost += entry.cost;
    d.inputTokens += entry.inputTokens;
    d.outputTokens += entry.outputTokens;
    d.cacheCreationTokens += entry.cacheCreationTokens;
    d.cacheReadTokens += entry.cacheReadTokens;
    d.totalTokens += entry.totalTokens;
  }
  return map;
}

function emptyDay(dateStr: string): DayData {
  return {
    date: dateStr,
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };
}

// Generate grid of weeks (columns) x days (rows)
function buildGrid(dayMap: Map<string, DayData>): {
  weeks: DayData[][];
  months: { label: string; colStart: number }[];
} {
  if (dayMap.size === 0) return { weeks: [], months: [] };

  const dates = Array.from(dayMap.keys()).toSorted();
  const startDate = new Date(dates[0] + "T00:00:00");
  const endDate = new Date(dates[dates.length - 1] + "T00:00:00");

  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const gridEnd = new Date(endDate);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const weeks: DayData[][] = [];
  const months: { label: string; colStart: number }[] = [];
  let currentMonth = -1;
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const week: DayData[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cursor.toISOString().slice(0, 10);
      week.push(dayMap.get(dateStr) ?? emptyDay(dateStr));

      const m = cursor.getMonth();
      if (m !== currentMonth && d === 0) {
        currentMonth = m;
        months.push({
          label: cursor.toLocaleDateString("en-US", { month: "short" }),
          colStart: weeks.length,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return { weeks, months };
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function ActivityHeatmap({ entries }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [metric, setMetric] = useState<Metric>("cost");

  const dayMap = useMemo(() => buildDayMap(entries), [entries]);
  const { weeks, months } = useMemo(() => buildGrid(dayMap), [dayMap]);

  // Max value for the selected metric
  const maxValue = useMemo(() => {
    let max = 0;
    for (const d of dayMap.values()) {
      const v = d[metric];
      if (v > max) max = v;
    }
    return max;
  }, [dayMap, metric]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (weeks.length === 0) return null;

  function getColor(value: number): string {
    if (value === 0) return "var(--color-bg-secondary)";
    if (maxValue === 0) return "var(--color-bg-secondary)";
    const ratio = value / maxValue;
    if (ratio < 0.25) return "oklch(0.55 0.15 155 / 0.5)";
    if (ratio < 0.5) return "oklch(0.55 0.15 155 / 0.7)";
    if (ratio < 0.75) return "oklch(0.50 0.17 155 / 0.85)";
    return "oklch(0.45 0.19 155)";
  }

  const labelWidth = 28;
  const availableWidth = Math.max(containerWidth - labelWidth, 100);
  const numWeeks = weeks.length;
  const maxCellStep = 16;
  const cellStep = Math.min(availableWidth / numWeeks, maxCellStep);
  const cellGap = Math.max(cellStep * 0.15, 1.5);
  const cellSize = cellStep - cellGap;
  const monthLabelHeight = 14;
  const gridTop = monthLabelHeight + 4;
  const svgHeight = gridTop + 7 * cellStep;

  const metricConfig = METRICS[metric];

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      {/* Header with metric tabs */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-secondary">Activity</h3>
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

      <div ref={containerRef} className="relative">
        {containerWidth > 0 && (
          <svg width="100%" height={svgHeight} className="block">
            {/* Month labels */}
            {months.map((m, i) => (
              <text
                key={i}
                x={labelWidth + m.colStart * cellStep}
                y={monthLabelHeight - 2}
                fontSize={Math.min(cellStep * 0.8, 11)}
                fill="var(--color-text-secondary)"
              >
                {m.label}
              </text>
            ))}

            {/* Day-of-week labels */}
            {DAY_LABELS.map(
              (label, i) =>
                label && (
                  <text
                    key={i}
                    x={0}
                    y={gridTop + i * cellStep + cellSize * 0.8}
                    fontSize={Math.min(cellSize * 0.7, 10)}
                    fill="var(--color-text-secondary)"
                  >
                    {label}
                  </text>
                ),
            )}

            {/* Cells */}
            {weeks.map((week, wi) =>
              week.map((day, di) => (
                <rect
                  key={`${wi}-${di}`}
                  x={labelWidth + wi * cellStep}
                  y={gridTop + di * cellStep}
                  width={cellSize}
                  height={cellSize}
                  rx={Math.max(cellSize * 0.15, 1.5)}
                  fill={getColor(day[metric])}
                  onMouseEnter={(e) => {
                    setHoveredDay(day);
                    const rect = (e.target as SVGRectElement).getBoundingClientRect();
                    setTooltipPos({
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setHoveredDay(null)}
                />
              )),
            )}
          </svg>
        )}

        {/* Tooltip */}
        {hoveredDay && (
          <div
            className="fixed z-50 px-2.5 py-1.5 rounded-md text-xs shadow-lg pointer-events-none"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              left: tooltipPos.x,
              top: tooltipPos.y - 36,
              transform: "translateX(-50%)",
            }}
          >
            <span className="text-text-secondary">{hoveredDay.date}</span>
            {hoveredDay[metric] > 0 && (
              <span className="text-text-primary font-medium ml-1.5">
                {metricConfig.format(hoveredDay[metric])}
              </span>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-2 text-xs text-text-secondary justify-end">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <span
              key={ratio}
              className="inline-block w-3 h-3 rounded-sm"
              style={{
                backgroundColor:
                  ratio === 0 ? "var(--color-bg-secondary)" : getColor(ratio * maxValue),
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
