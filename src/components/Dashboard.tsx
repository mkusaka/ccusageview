import { useMemo, useRef, useState } from "react";
import type { ReportType } from "../types";
import type { DashboardData } from "../utils/normalize";
import { aggregateToMonthly, computeTotalsFromEntries } from "../utils/normalize";
import { SummaryCards } from "./SummaryCards";
import { CostChart } from "./CostChart";
import { TokenChart } from "./TokenChart";
import { ModelBreakdown } from "./ModelBreakdown";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { DataTable } from "./DataTable";
import { StatisticsSummary } from "./StatisticsSummary";
import { DayOfWeekChart } from "./DayOfWeekChart";
import { CopyImageButton } from "./CopyImageButton";
import { RangeSlider } from "./RangeSlider";

interface Props {
  data: DashboardData;
}

const TYPE_LABELS: Record<ReportType, string> = {
  daily: "Daily Report",
  weekly: "Weekly Report",
  monthly: "Monthly Report",
  session: "Session Report",
  blocks: "Blocks Report",
};

type TimeGranularity = "daily" | "monthly";

export function Dashboard({ data }: Props) {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const { entries: dailyEntries, totals, reportType, sourceLabels } = data;

  // Daily reports can be viewed as monthly too
  const canToggleGranularity = reportType === "daily";
  const [granularity, setGranularity] = useState<TimeGranularity>("daily");

  const monthlyEntries = useMemo(
    () => (canToggleGranularity ? aggregateToMonthly(dailyEntries) : []),
    [canToggleGranularity, dailyEntries],
  );

  // Pick entries based on the active granularity
  const entries = canToggleGranularity && granularity === "monthly" ? monthlyEntries : dailyEntries;

  // Range slider state — reset when entries change (render-time reset pattern)
  const [range, setRange] = useState<[number, number]>([0, Math.max(0, entries.length - 1)]);
  const [prevEntries, setPrevEntries] = useState(entries);
  if (entries !== prevEntries) {
    setPrevEntries(entries);
    setRange([0, Math.max(0, entries.length - 1)]);
  }

  const isFullRange = range[0] === 0 && range[1] === entries.length - 1;

  const filteredEntries = useMemo(
    () => (isFullRange ? entries : entries.slice(range[0], range[1] + 1)),
    [entries, range, isFullRange],
  );

  const filteredTotals = useMemo(
    () => (isFullRange ? totals : computeTotalsFromEntries(filteredEntries)),
    [isFullRange, totals, filteredEntries],
  );

  const hasModelBreakdowns = filteredEntries.some(
    (e) => e.modelBreakdowns && e.modelBreakdowns.length > 0,
  );

  const showHeatmap = reportType === "daily" || reportType === "weekly";

  const displayLabel = canToggleGranularity
    ? granularity === "daily"
      ? "Daily Report"
      : "Monthly Report"
    : TYPE_LABELS[reportType];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block px-2.5 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
          {displayLabel}
        </span>
        <span className="text-sm text-text-secondary">{filteredEntries.length} entries</span>
        {sourceLabels.length > 0 && (
          <span className="text-xs text-text-secondary">Sources: {sourceLabels.join(", ")}</span>
        )}

        <CopyImageButton targetRef={dashboardRef} />

        {/* Granularity toggle for daily reports */}
        {canToggleGranularity && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 ml-auto">
            {(["daily", "monthly"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
                  granularity === g
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {g === "daily" ? "Daily" : "Monthly"}
              </button>
            ))}
          </div>
        )}
      </div>

      {entries.length > 1 && (
        <RangeSlider
          count={entries.length}
          start={range[0]}
          end={range[1]}
          startLabel={entries[range[0]]?.label ?? ""}
          endLabel={entries[range[1]]?.label ?? ""}
          onChange={(s, e) => setRange([s, e])}
        />
      )}

      <div ref={dashboardRef} className="space-y-4">
        <SummaryCards totals={filteredTotals} entryCount={filteredEntries.length} />

        {filteredEntries.length >= 2 && <StatisticsSummary entries={filteredEntries} />}

        {filteredEntries.length > 0 && (
          <>
            {showHeatmap && <ActivityHeatmap entries={dailyEntries} />}
            <DayOfWeekChart entries={filteredEntries} />
            <CostChart entries={filteredEntries} />
            <TokenChart entries={filteredEntries} />
            {hasModelBreakdowns && <ModelBreakdown entries={filteredEntries} />}
          </>
        )}
      </div>

      {filteredEntries.length > 0 && <DataTable entries={filteredEntries} />}
    </div>
  );
}
