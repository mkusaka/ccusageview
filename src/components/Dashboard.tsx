import { useMemo, useRef, useState } from "react";
import type { ReportType } from "../types";
import type { DashboardData } from "../utils/normalize";
import { aggregateToMonthly } from "../utils/normalize";
import { SummaryCards } from "./SummaryCards";
import { CostChart } from "./CostChart";
import { TokenChart } from "./TokenChart";
import { ModelBreakdown } from "./ModelBreakdown";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { DataTable } from "./DataTable";
import { StatisticsSummary } from "./StatisticsSummary";
import { CopyImageButton } from "./CopyImageButton";

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

  const hasModelBreakdowns = entries.some((e) => e.modelBreakdowns && e.modelBreakdowns.length > 0);

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
        <span className="text-sm text-text-secondary">{entries.length} entries</span>
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

      <div ref={dashboardRef} className="space-y-4">
        <SummaryCards totals={totals} entryCount={entries.length} />

        {entries.length >= 2 && <StatisticsSummary entries={entries} />}

        {entries.length > 0 && (
          <>
            {showHeatmap && <ActivityHeatmap entries={dailyEntries} />}
            <CostChart entries={entries} />
            <TokenChart entries={entries} />
            {hasModelBreakdowns && <ModelBreakdown entries={entries} />}
          </>
        )}
      </div>

      {entries.length > 0 && <DataTable entries={entries} />}
    </div>
  );
}
