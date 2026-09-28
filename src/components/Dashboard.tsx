import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { ReportType } from "../types";
import type { DashboardData, NormalizedEntry } from "../utils/normalize";
import type { TimeGranularity } from "../utils/projection";
import {
  DASHBOARD_CHARTS,
  DASHBOARD_RANGES,
  availableChartIds,
  availableRangeIds,
  type DashboardChartId,
  type DashboardRangeId,
} from "../utils/dashboardCatalog";
import {
  aggregateToDaily,
  aggregateToMonthly,
  aggregateToWeekly,
  computeTotalsFromEntries,
} from "../utils/normalize";
import {
  ChartMarkdownContext,
  type RegisterMarkdownSection,
  type RegisteredMarkdownSection,
} from "./ChartMarkdownContext";
import { SummaryCards } from "./SummaryCards";
import { CostChart } from "./CostChart";
import { TokenChart } from "./TokenChart";
import { CacheEfficiencyChart } from "./CacheEfficiencyChart";
import { ModelBreakdown } from "./ModelBreakdown";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { DataTable } from "./DataTable";
import { StatisticsSummary } from "./StatisticsSummary";
import { DayOfWeekChart } from "./DayOfWeekChart";
import { HourOfDayChart } from "./HourOfDayChart";
import { CopyImageButton } from "./CopyImageButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { breakdownHintCommand, HintedTab } from "./BreakdownHint";
import { RangeSlider } from "./RangeSlider";
import { ChartPickerModal } from "./ChartPickerModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface Props {
  data: DashboardData;
}

const TYPE_LABELS: Record<ReportType, string> = {
  daily: "Daily Report",
  weekly: "Weekly Report",
  monthly: "Monthly Report",
  hourly: "Hourly Report",
  session: "Session Report",
  blocks: "Blocks Report",
};

const GRANULARITY_LABELS: Record<TimeGranularity, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const GRANULARITY_REPORT_LABELS: Record<TimeGranularity, string> = {
  hourly: "Hourly Report",
  daily: "Daily Report",
  weekly: "Weekly Report",
  monthly: "Monthly Report",
};

const COST_TOKEN_CHART_SYNC_ID = "cost-token-time-series";

interface SyncedChartHoverState {
  index: number | null;
  source: string | null;
}

interface ChartPanel {
  key: string;
  id: DashboardChartId;
  range: DashboardRangeId;
}

type PanelActionName = "up" | "down" | "add" | "replace" | "remove";

const PANEL_ACTION_ICONS: Record<PanelActionName, ReactNode> = {
  up: (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="m6 14 6-6 6 6" />
    </svg>
  ),
  down: (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="m6 10 6 6 6-6" />
    </svg>
  ),
  add: (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  replace: (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M4 7h16m0 0-4-4m4 4-4 4M20 17H4m0 0 4-4m-4 4 4 4" />
    </svg>
  ),
  remove: (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M4 7h16m-10 0V4h4v3m-8 0 1 13h10l1-13M10 11v6m4-6v6" />
    </svg>
  ),
};

function PanelAction({
  action,
  label,
  onClick,
  disabled,
}: {
  action: PanelActionName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="flex size-9 items-center justify-center rounded-md border border-transparent text-text-secondary hover:border-border hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
        >
          {PANEL_ACTION_ICONS[action]}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function initialPanels(available: DashboardChartId[]): ChartPanel[] {
  return available.map((id) => ({ key: id, id, range: "dashboard" }));
}

function PanelMarkdownProvider({
  panelKey,
  register,
  children,
}: {
  panelKey: string;
  register: RegisterMarkdownSection;
  children: ReactNode;
}) {
  const registerPanel = useCallback(
    (section: RegisteredMarkdownSection) =>
      register({ ...section, id: `${panelKey}/${section.id}` }),
    [panelKey, register],
  );
  return (
    <ChartMarkdownContext.Provider value={registerPanel}>{children}</ChartMarkdownContext.Provider>
  );
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function filterCalendarRange(
  entries: NormalizedEntry[],
  range: DashboardRangeId,
  today: Date,
): NormalizedEntry[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  switch (range) {
    case "last_7_days":
      start.setDate(start.getDate() - 6);
      break;
    case "last_30_days":
      start.setDate(start.getDate() - 29);
      break;
    case "last_90_days":
      start.setDate(start.getDate() - 89);
      break;
    case "this_month":
      start.setDate(1);
      break;
    case "last_month":
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(0);
      break;
    case "this_year":
      start.setMonth(0, 1);
      break;
    default:
      return entries;
  }
  const first = dateKey(start);
  const last = dateKey(end);
  return entries.filter((entry) => {
    const day = entry.label.slice(0, 10);
    return day >= first && day <= last;
  });
}

export function Dashboard({ data }: Props) {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [markdownSectionsById, setMarkdownSectionsById] = useState<
    Record<string, RegisteredMarkdownSection>
  >({});
  const { entries: baseEntries, totals, reportType, sourceLabels } = data;
  const isHourly = reportType === "hourly";

  // Daily and hourly reports can be viewed at coarser granularities too
  const canToggleGranularity = reportType === "daily" || reportType === "hourly";
  const [granularity, setGranularity] = useState<TimeGranularity>(isHourly ? "hourly" : "daily");

  const dailyEntries = useMemo(
    () => (isHourly ? aggregateToDaily(baseEntries) : baseEntries),
    [isHourly, baseEntries],
  );

  const weeklyEntries = useMemo(
    () => (canToggleGranularity ? aggregateToWeekly(dailyEntries) : []),
    [canToggleGranularity, dailyEntries],
  );

  const monthlyEntries = useMemo(
    () => (canToggleGranularity ? aggregateToMonthly(dailyEntries) : []),
    [canToggleGranularity, dailyEntries],
  );

  // Pick entries based on the active granularity
  const entries = canToggleGranularity
    ? granularity === "hourly"
      ? baseEntries
      : granularity === "weekly"
        ? weeklyEntries
        : granularity === "monthly"
          ? monthlyEntries
          : dailyEntries
    : baseEntries;

  // Range slider state — reset when entries change (render-time reset pattern)
  const [range, setRange] = useState<[number, number]>([0, Math.max(0, entries.length - 1)]);
  const [syncedChartHoverState, setSyncedChartHoverState] = useState<SyncedChartHoverState>({
    index: null,
    source: null,
  });
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevEntries, setPrevEntries] = useState(entries);
  if (entries !== prevEntries) {
    setPrevEntries(entries);
    setRange([0, Math.max(0, entries.length - 1)]);
    setSyncedChartHoverState({ index: null, source: null });
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

  const availableCharts = availableChartIds(reportType, granularity, entries.length);
  const availableRanges = availableRangeIds(reportType);
  const panelKey = `${reportType}:${granularity}:${entries.length === 0}:${entries.length === 1}`;
  const [previousPanelKey, setPreviousPanelKey] = useState(panelKey);
  const [panels, setPanels] = useState<ChartPanel[]>(() => initialPanels(availableCharts));
  const [picker, setPicker] = useState<{ mode: "add" | "replace"; target?: string } | null>(null);
  if (previousPanelKey !== panelKey) {
    setPreviousPanelKey(panelKey);
    setPanels(initialPanels(availableCharts));
    setPicker(null);
  }
  const pickerCharts = availableCharts;
  const today = new Date();
  function chartEntries(panel: ChartPanel): NormalizedEntry[] {
    if (panel.range === "dashboard") {
      if (panel.id === "activity") return dailyEntries;
      if (panel.id === "day-of-week" && isHourly) return dailyEntries;
      return filteredEntries;
    }
    if (panel.range === "all") {
      if (panel.id === "activity" || panel.id === "day-of-week") return dailyEntries;
      return entries;
    }
    const selected = filterCalendarRange(baseEntries, panel.range, today);
    if (panel.id === "hour-of-day" || (panel.id !== "activity" && granularity === "hourly")) {
      return selected;
    }
    const selectedDaily = isHourly ? aggregateToDaily(selected) : selected;
    if (panel.id === "activity" || panel.id === "day-of-week" || !canToggleGranularity) {
      return selectedDaily;
    }
    if (granularity === "weekly") return aggregateToWeekly(selectedDaily);
    if (granularity === "monthly") return aggregateToMonthly(selectedDaily);
    return selectedDaily;
  }
  function applyPanel(id: DashboardChartId, selectedRange: DashboardRangeId) {
    if (!picker || !pickerCharts.includes(id) || !availableRanges.includes(selectedRange)) return;
    setPanels((current) => {
      if (picker.mode === "replace") {
        return current.map((panel) =>
          panel.key === picker.target ? { ...panel, id, range: selectedRange } : panel,
        );
      }
      const next = [...current];
      const targetIndex = picker.target
        ? current.findIndex((panel) => panel.key === picker.target)
        : -1;
      next.splice(targetIndex < 0 ? next.length : targetIndex + 1, 0, {
        key: crypto.randomUUID(),
        id,
        range: selectedRange,
      });
      return next;
    });
    setPicker(null);
  }
  function movePanel(index: number, offset: number) {
    setPanels((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  const handleSyncedChartHoverIndexChange = useCallback(
    (nextIndex: number | null, source: string | null = null) => {
      setSyncedChartHoverState((current) =>
        current.index === nextIndex && current.source === source
          ? current
          : { index: nextIndex, source },
      );
    },
    [],
  );
  const handleSyncedChartGroupMouseLeave = useCallback(() => {
    handleSyncedChartHoverIndexChange(null);
  }, [handleSyncedChartHoverIndexChange]);

  const displayLabel = canToggleGranularity
    ? GRANULARITY_REPORT_LABELS[granularity]
    : TYPE_LABELS[reportType];

  const timeGranularity: TimeGranularity | undefined =
    reportType === "daily" || reportType === "hourly"
      ? granularity
      : reportType === "weekly" || reportType === "monthly"
        ? reportType
        : undefined;

  function renderChart(panel: ChartPanel) {
    const chartData = chartEntries(panel);
    if (chartData.length === 0 || (panel.id === "statistics" && chartData.length < 2)) {
      return (
        <div className="rounded-lg border border-border bg-bg-card p-4 text-sm text-text-secondary">
          {chartData.length === 0
            ? "No data in this range"
            : "Not enough data in this range for statistics"}
        </div>
      );
    }
    switch (panel.id) {
      case "statistics":
        return <StatisticsSummary entries={chartData} reportType={reportType} />;
      case "activity":
        return <ActivityHeatmap entries={chartData} />;
      case "day-of-week":
        return <DayOfWeekChart entries={chartData} reportType={reportType} />;
      case "hour-of-day":
        return <HourOfDayChart entries={chartData} reportType={reportType} />;
      case "cost":
        return (
          <div onMouseLeave={handleSyncedChartGroupMouseLeave}>
            <CostChart
              entries={chartData}
              reportType={reportType}
              syncId={`${COST_TOKEN_CHART_SYNC_ID}-${panel.range}`}
              timeGranularity={timeGranularity}
              hoveredDataIndex={syncedChartHoverState.index}
              hoveredSyncSource={syncedChartHoverState.source}
              onHoverDataIndexChange={handleSyncedChartHoverIndexChange}
            />
          </div>
        );
      case "tokens":
        return (
          <div onMouseLeave={handleSyncedChartGroupMouseLeave}>
            <TokenChart
              entries={chartData}
              reportType={reportType}
              syncId={`${COST_TOKEN_CHART_SYNC_ID}-${panel.range}`}
              timeGranularity={timeGranularity}
              hoveredDataIndex={syncedChartHoverState.index}
              hoveredSyncSource={syncedChartHoverState.source}
              onHoverDataIndexChange={handleSyncedChartHoverIndexChange}
            />
          </div>
        );
      case "cache":
        return (
          <div onMouseLeave={handleSyncedChartGroupMouseLeave}>
            <CacheEfficiencyChart
              entries={chartData}
              reportType={reportType}
              syncId={`${COST_TOKEN_CHART_SYNC_ID}-${panel.range}`}
              hoveredDataIndex={syncedChartHoverState.index}
              hoveredSyncSource={syncedChartHoverState.source}
              onHoverDataIndexChange={handleSyncedChartHoverIndexChange}
            />
          </div>
        );
      case "breakdown":
        return <ModelBreakdown entries={chartData} reportType={reportType} />;
    }
  }

  const registerMarkdownSection = useCallback((section: RegisteredMarkdownSection) => {
    setMarkdownSectionsById((previous) => ({ ...previous, [section.id]: section }));
    return () => {
      setMarkdownSectionsById((previous) => {
        if (previous[section.id] !== section) return previous;
        const next = { ...previous };
        delete next[section.id];
        return next;
      });
    };
  }, []);

  const getDashboardMarkdown = useCallback(() => {
    const chartOrder = new Map(panels.map((panel, index) => [panel.key, index]));
    const chartSections = Object.values(markdownSectionsById)
      .filter((section) => chartOrder.has(section.id.split("/")[0]))
      .toSorted(
        (a, b) =>
          (chartOrder.get(a.id.split("/")[0]) ?? 0) - (chartOrder.get(b.id.split("/")[0]) ?? 0),
      );
    const rangeLabel =
      filteredEntries.length > 0
        ? `${filteredEntries[0]?.label ?? ""} - ${
            filteredEntries[filteredEntries.length - 1]?.label ?? ""
          }`
        : "None";
    const header = [
      "# ccusageview Dashboard",
      "",
      `- Report: ${displayLabel}`,
      `- Entries: ${filteredEntries.length}`,
      `- Range: ${rangeLabel}`,
      `- Sources: ${sourceLabels.length > 0 ? sourceLabels.join(", ") : "None"}`,
    ].join("\n");

    if (chartSections.length === 0) return header;
    return `${header}\n\n${chartSections
      .map((section) =>
        typeof section.markdown === "function" ? section.markdown() : section.markdown,
      )
      .join("\n\n")}`;
  }, [displayLabel, filteredEntries, markdownSectionsById, panels, sourceLabels]);

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
        <CopyMarkdownButton
          markdown={getDashboardMarkdown}
          title="Copy all chart data as Markdown"
        />

        {/* Granularity toggle for daily and hourly reports */}
        {canToggleGranularity && (
          <div className="flex gap-0.5 bg-bg-secondary rounded-md p-0.5 ml-auto">
            {(["hourly", "daily", "weekly", "monthly"] as const).map((g) => (
              <HintedTab
                key={g}
                hint={g === "hourly" && !isHourly ? breakdownHintCommand("hourly", "model") : null}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
                  granularity === g
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {GRANULARITY_LABELS[g]}
              </HintedTab>
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

      <button
        type="button"
        disabled={!availableCharts.length}
        onClick={() => setPicker({ mode: "add" })}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-bg-card px-3 py-1.5 text-sm hover:bg-bg-secondary disabled:opacity-50"
      >
        {PANEL_ACTION_ICONS.add}
        Add chart
      </button>
      <div ref={dashboardRef} className="space-y-4">
        <SummaryCards totals={filteredTotals} entryCount={filteredEntries.length} />
        {panels.map((panel, index) => {
          const label = DASHBOARD_CHARTS.find((item) => item.id === panel.id)?.label;
          const rangeLabel = DASHBOARD_RANGES.find((item) => item.id === panel.range)?.label;
          return (
            <section key={panel.key} aria-label={`${label} chart`} className="space-y-1">
              <div className="flex items-center justify-end gap-1">
                {panel.range !== "dashboard" && (
                  <span className="mr-auto text-xs text-text-secondary">{rangeLabel}</span>
                )}
                <PanelAction
                  action="up"
                  label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => movePanel(index, -1)}
                />
                <PanelAction
                  action="down"
                  label={`Move ${label} down`}
                  disabled={index === panels.length - 1}
                  onClick={() => movePanel(index, 1)}
                />
                <PanelAction
                  action="add"
                  label={`Add chart after ${label}`}
                  onClick={() => setPicker({ mode: "add", target: panel.key })}
                />
                <PanelAction
                  action="replace"
                  label={`Replace ${label}`}
                  onClick={() => setPicker({ mode: "replace", target: panel.key })}
                />
                <PanelAction
                  action="remove"
                  label={`Remove ${label}`}
                  onClick={() =>
                    setPanels((current) => current.filter((item) => item.key !== panel.key))
                  }
                />
              </div>
              <PanelMarkdownProvider panelKey={panel.key} register={registerMarkdownSection}>
                {renderChart(panel)}
              </PanelMarkdownProvider>
            </section>
          );
        })}
      </div>
      {picker && pickerCharts.length > 0 && (
        <ChartPickerModal
          key={`${picker.mode}-${picker.target ?? ""}`}
          mode={picker.mode}
          charts={pickerCharts}
          ranges={availableRanges}
          initialChart={
            picker.mode === "replace"
              ? panels.find((panel) => panel.key === picker.target)?.id
              : undefined
          }
          initialRange={
            picker.mode === "replace"
              ? panels.find((panel) => panel.key === picker.target)?.range
              : undefined
          }
          onApply={applyPanel}
          onClose={() => setPicker(null)}
          preview={(id, selectedRange) => renderChart({ key: "preview", id, range: selectedRange })}
        />
      )}

      {filteredEntries.length > 0 && <DataTable entries={filteredEntries} />}
    </div>
  );
}
