import { useState, useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { NormalizedEntry } from "../utils/normalize";
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

interface Props {
  entries: NormalizedEntry[];
}

const TYPE_SERIES = [
  { key: "inputTokens", name: "Input", color: "var(--color-chart-blue)" },
  { key: "outputTokens", name: "Output", color: "var(--color-chart-green)" },
  {
    key: "cacheCreationTokens",
    name: "Cache Create",
    color: "var(--color-chart-orange)",
  },
  {
    key: "cacheReadTokens",
    name: "Cache Read",
    color: "var(--color-chart-purple)",
  },
] as const;

const TOKEN_TYPE_TABS: { key: ModelTokenType; label: string }[] = [
  { key: "inputTokens", label: "Input" },
  { key: "outputTokens", label: "Output" },
  { key: "cacheCreationTokens", label: "Cache Create" },
  { key: "cacheReadTokens", label: "Cache Read" },
];

type ViewMode = "type" | "model" | "provider";

export function TokenChart({ entries }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [tokenType, setTokenType] = useState<ModelTokenType>("inputTokens");
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
    () => (hasBreakdownData ? buildTokenTypeByModel(entries, tokenType, breakdownMode) : []),
    [entries, hasBreakdownData, tokenType, breakdownMode],
  );

  const breakdownSeries = useMemo(
    () =>
      hasBreakdownData ? buildModelSeries(breakdownKeys, entries, MODEL_COLORS, breakdownMode) : [],
    [breakdownKeys, entries, hasBreakdownData, breakdownMode],
  );

  const isBreakdownView = (viewMode === "model" || viewMode === "provider") && hasBreakdownData;
  const chartMarkdown = useMemo(() => {
    let series: ChartDataSeries[];
    let data: Record<string, unknown>[];
    let viewLabel: string;

    if (isBreakdownView) {
      viewLabel = viewMode === "provider" ? "By Provider" : "By Model";
      series = breakdownSeries
        .filter((s) => !hiddenSeries.has(s.key))
        .map((s) => ({ key: s.key, label: s.label, color: s.color }));
      data = pickDataKeys(breakdownChartData, ["label", ...series.map((s) => s.key)]);
    } else {
      viewLabel = "By Type";
      series = TYPE_SERIES.filter((s) => !hiddenSeries.has(s.key)).map((s) => ({
        key: s.key,
        label: s.name,
        color: s.color,
      }));
      data = pickDataKeys(entries, ["label", ...series.map((s) => s.key)]);
    }

    return buildMarkdownSection({
      title: "Token Breakdown",
      metadata: [
        ["View", viewLabel],
        [
          "Token type",
          isBreakdownView ? TOKEN_TYPE_TABS.find((tab) => tab.key === tokenType)?.label : "All",
        ],
        ["Show percent", showPercent],
        ["Hidden series", Array.from(hiddenSeries)],
      ],
      tables: [
        {
          columns: seriesToColumns({ key: "label", label: "Label" }, series),
          rows: data,
        },
      ],
    });
  }, [
    breakdownChartData,
    breakdownSeries,
    entries,
    hiddenSeries,
    isBreakdownView,
    showPercent,
    tokenType,
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
      {isBreakdownView && (
        <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 mb-3 w-fit">
          {TOKEN_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTokenType(tab.key)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                tokenType === tab.key
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={380}>
        <BarChart
          data={isBreakdownView ? breakdownChartData : entries}
          stackOffset={showPercent ? "expand" : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={
              showPercent
                ? (v: number) => `${(v * 100).toFixed(0)}%`
                : (v: number) => formatTokens(v)
            }
            domain={showPercent ? [0, 1] : undefined}
          />
          <Tooltip
            content={
              showPercent
                ? ({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const total = payload.reduce(
                      (s, p) => s + Number(p.payload?.[String(p.dataKey)] ?? 0),
                      0,
                    );
                    return (
                      <div
                        className="px-2.5 py-1.5 rounded-lg text-xs shadow-lg"
                        style={{
                          backgroundColor: "var(--color-bg-card)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <p className="text-text-primary font-medium mb-0.5">{label}</p>
                        {payload.map((p) => {
                          const raw = Number(p.payload?.[String(p.dataKey)] ?? 0);
                          const pct = total > 0 ? (raw / total) * 100 : 0;
                          return (
                            <p key={String(p.dataKey)} className="text-text-secondary">
                              <span style={{ color: p.color }}>■</span> {p.name}: {pct.toFixed(1)}%
                              ({formatTokens(raw)})
                            </p>
                          );
                        })}
                      </div>
                    );
                  }
                : undefined
            }
            formatter={
              showPercent
                ? undefined
                : (value, name) => [formatTokens(Number(value ?? 0)), String(name)]
            }
            contentStyle={
              showPercent
                ? undefined
                : {
                    backgroundColor: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }
            }
          />
          <Legend
            content={() => {
              const items = isBreakdownView
                ? breakdownSeries.map((s) => ({ key: s.key, name: s.label, color: s.color }))
                : TYPE_SERIES.map((s) => ({ key: s.key, name: s.name, color: s.color }));
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
            }}
          />
          {isBreakdownView
            ? breakdownSeries
                .filter((s) => !hiddenSeries.has(s.key))
                .map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="tokens"
                    fill={s.color}
                    fillOpacity={0.85}
                  />
                ))
            : TYPE_SERIES.filter((s) => !hiddenSeries.has(s.key)).map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="tokens"
                  fill={s.color}
                  fillOpacity={0.85}
                />
              ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
