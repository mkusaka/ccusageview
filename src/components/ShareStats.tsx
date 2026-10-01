import { useMemo, useRef, useState } from "react";
import type { ReportType } from "../types";
import type { NormalizedEntry } from "../utils/normalize";
import { computeShareStats } from "../utils/shareStats";
import { formatCost, formatTokens } from "../utils/format";
import { MODEL_COLORS } from "../utils/chart";
import { buildMarkdownSection } from "../utils/chartData";
import { useRegisterChartMarkdown } from "./ChartMarkdownContext";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";

interface Props {
  entries: NormalizedEntry[];
  reportType: ReportType;
  initialLayout?: "tiles" | "compact";
}

export function ShareStats({ entries, reportType, initialLayout = "tiles" }: Props) {
  const [layout, setLayout] = useState(initialLayout);
  const imageRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(() => computeShareStats(entries, reportType), [entries, reportType]);
  const period = stats.first === stats.last ? stats.first : `${stats.first} – ${stats.last}`;
  const metrics = [
    { label: "Total cost", value: formatCost(stats.totals.totalCost) },
    { label: "Tokens", value: formatTokens(stats.totals.totalTokens) },
    {
      label: stats.activeDays === null ? "Entries" : "Active days",
      value:
        stats.activeDays === null
          ? stats.entryCount.toLocaleString("en-US")
          : `${stats.activeDays} / ${stats.calendarDays}`,
    },
    {
      label: stats.calendarDays === null ? "Cost / entry" : "Cost / day",
      value: formatCost(stats.averageCost),
    },
  ];
  const costRows = stats.costs.filter(({ cost }) => cost > 0);
  const positiveCost = costRows.reduce((sum, row) => sum + row.cost, 0);
  const reconciled = Math.abs(stats.breakdownTotal - stats.totals.totalCost) < 0.005;
  const markdown = useMemo(
    () =>
      buildMarkdownSection({
        title: "Share stats",
        metadata: [
          ["Report", reportType],
          ["Period", period],
          ["Currency", "USD"],
        ],
        tables: [
          {
            columns: [
              { key: "label", label: "Metric" },
              { key: "value", label: "Value", align: "right" },
            ],
            rows: [
              { label: "Total cost", value: stats.totals.totalCost },
              { label: "Tokens", value: stats.totals.totalTokens },
              {
                label: stats.activeDays === null ? "Entries" : "Active days",
                value: stats.activeDays ?? stats.entryCount,
              },
              ...(stats.calendarDays === null
                ? []
                : [{ label: "Calendar days", value: stats.calendarDays }]),
              {
                label: stats.calendarDays === null ? "Cost / entry" : "Cost / day",
                value: stats.averageCost,
              },
            ],
          },
          {
            title: `Reported cost by ${stats.mode}`,
            columns: [
              { key: "label", label: stats.mode },
              { key: "cost", label: "Cost (USD)", align: "right" },
            ],
            rows: stats.costs,
          },
        ],
      }),
    [stats, period, reportType],
  );
  const registration = useMemo(() => ({ id: "share", order: 90, markdown }), [markdown]);
  useRegisterChartMarkdown(registration);

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Share stats</h3>
        <div className="flex items-center gap-1">
          {(["tiles", "compact"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
              className={`rounded-md px-2 py-1 text-xs ${layout === value ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-secondary"}`}
            >
              {value === "tiles" ? "Tiles" : "Compact"}
            </button>
          ))}
          <CopyMarkdownButton markdown={markdown} />
          <CopyImageButton targetRef={imageRef} />
        </div>
      </div>
      <div
        ref={imageRef}
        data-share-card={layout}
        className="mx-auto w-full max-w-lg rounded-xl border border-border bg-bg-primary text-text-primary"
        style={{ containerType: "inline-size" }}
      >
        <div
          className="flex flex-col justify-between gap-6 p-[6%]"
          style={{ minHeight: layout === "tiles" ? "125cqw" : "100cqw" }}
        >
          <header>
            <p className="text-base font-semibold tracking-tight">
              ccusage<span className="font-normal text-text-secondary">view</span>
            </p>
            <p className="mt-2 break-words text-xs text-text-secondary">{period}</p>
          </header>
          <dl className={layout === "tiles" ? "grid grid-cols-2 gap-3" : "space-y-3"}>
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className={
                  layout === "tiles"
                    ? "min-w-0 rounded-lg border border-border bg-bg-card p-[7%]"
                    : index === 0
                      ? "pb-3"
                      : "flex items-baseline justify-between gap-2 border-t border-border pt-3"
                }
              >
                <dt className="text-xs text-text-secondary">{metric.label}</dt>
                <dd
                  className={`break-words font-semibold leading-tight tracking-tight tabular-nums ${layout === "tiles" || index === 0 ? "mt-2" : "text-right"}`}
                  style={{
                    fontSize:
                      layout === "compact" && index === 0
                        ? "clamp(2rem, 13cqw, 4.5rem)"
                        : "clamp(1rem, 6cqw, 2rem)",
                  }}
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
          {costRows.length > 0 && (
            <section aria-label={`Cost by ${stats.mode}`}>
              <h4 className="mb-3 text-sm font-semibold">Cost by {stats.mode}</h4>
              {layout === "compact" && (
                <div
                  className="mb-3 flex h-3 overflow-hidden rounded bg-bg-secondary"
                  aria-hidden="true"
                >
                  {costRows.map((row, index) => (
                    <div
                      key={row.key}
                      style={{
                        width: `${(row.cost / positiveCost) * 100}%`,
                        backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                      }}
                    />
                  ))}
                </div>
              )}
              <ul className="space-y-3">
                {costRows.map((row, index) => (
                  <li key={row.key}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 break-words text-text-secondary">{row.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCost(row.cost)}
                        {layout === "compact" && reconciled
                          ? ` · ${((row.cost / positiveCost) * 100).toFixed(0)}%`
                          : ""}
                      </span>
                    </div>
                    {layout === "tiles" && (
                      <div
                        className="mt-2 h-2 overflow-hidden rounded bg-bg-secondary"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(row.cost / positiveCost) * 100}%`,
                            backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                          }}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {!reconciled && (
                <p className="mt-3 text-xs text-text-secondary">
                  Reported breakdown total: {formatCost(stats.breakdownTotal)} (differs from usage
                  total)
                </p>
              )}
            </section>
          )}
          <footer className="border-t border-border pt-3 text-xs text-text-secondary">
            USD · {reportType} report
          </footer>
        </div>
      </div>
    </div>
  );
}
