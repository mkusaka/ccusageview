import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import type { ReportType } from "../types";
import type { DashboardData, NormalizedEntry } from "../utils/normalize";
import type { TimeGranularity } from "../utils/projection";
import {
  DASHBOARD_CHARTS,
  DASHBOARD_CHART_TABS,
  DASHBOARD_RANGES,
  availableChartIds,
  availableRangeIds,
  type DashboardChartId,
  type DashboardChartTabId,
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
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
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
  tab?: DashboardChartTabId;
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
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
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
          className="flex size-8 items-center justify-center rounded-md border border-transparent text-text-secondary hover:border-border hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
        >
          {PANEL_ACTION_ICONS[action]}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function InsertChartButton({
  label,
  onClick,
  disabled,
  buttonRef,
  className,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={`dashboard-panel-insert group relative flex h-6 w-full items-center justify-center focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-0 h-px bg-border transition-[height,background-color] group-hover:h-0.5 group-hover:bg-accent group-focus-visible:h-0.5 group-focus-visible:bg-accent"
          />
          <span
            aria-hidden="true"
            className="relative flex size-6 items-center justify-center rounded-full border border-border bg-bg-card text-text-secondary opacity-0 transition-opacity group-hover:border-accent group-hover:bg-accent group-hover:text-white group-hover:opacity-100 group-focus-visible:border-accent group-focus-visible:bg-accent group-focus-visible:text-white group-focus-visible:opacity-100"
          >
            {PANEL_ACTION_ICONS.add}
          </span>
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
  const addedChartIds = useMemo(() => {
    const ids = new Set<DashboardChartId>();
    for (const panel of panels) ids.add(panel.id);
    return ids;
  }, [panels]);
  const [picker, setPicker] = useState<{ mode: "add" | "replace"; target?: string } | null>(null);
  const [removal, setRemoval] = useState<{ key: string; label: string } | null>(null);
  const removalTrigger = useRef<HTMLButtonElement | null>(null);
  const removalSuccessFocus = useRef<HTMLButtonElement | null>(null);
  const addChartTrigger = useRef<HTMLButtonElement | null>(null);
  const removalTitle = useRef<HTMLHeadingElement | null>(null);
  const confirmedRemoval = useRef(false);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);
  function openPicker(
    next: { mode: "add" | "replace"; target?: string },
    trigger: HTMLButtonElement,
  ) {
    pickerTrigger.current = trigger;
    setPicker(next);
  }
  function closePicker() {
    const trigger = pickerTrigger.current;
    setPicker(null);
    requestAnimationFrame(() => trigger?.focus());
  }
  if (previousPanelKey !== panelKey) {
    setPreviousPanelKey(panelKey);
    setPanels(initialPanels(availableCharts));
    setPicker(null);
    setRemoval(null);
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
  function applyPanel(
    id: DashboardChartId,
    selectedRange: DashboardRangeId,
    tab?: DashboardChartTabId,
  ) {
    if (
      !picker ||
      !pickerCharts.includes(id) ||
      !availableRanges.includes(selectedRange) ||
      (tab !== undefined && !DASHBOARD_CHART_TABS[id].some((item) => item.id === tab))
    )
      return;
    setPanels((current) => {
      if (picker.mode === "replace") {
        return current.map((panel) =>
          panel.key === picker.target ? { ...panel, id, range: selectedRange, tab } : panel,
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
        tab,
      });
      return next;
    });
    closePicker();
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
        return (
          <StatisticsSummary
            key={panel.tab}
            entries={chartData}
            reportType={reportType}
            initialTab={panel.tab}
          />
        );
      case "activity":
        return <ActivityHeatmap entries={chartData} />;
      case "day-of-week":
        return (
          <DayOfWeekChart
            key={panel.tab}
            entries={chartData}
            reportType={reportType}
            initialTab={panel.tab}
          />
        );
      case "hour-of-day":
        return (
          <HourOfDayChart
            key={panel.tab}
            entries={chartData}
            reportType={reportType}
            initialTab={panel.tab}
          />
        );
      case "cost":
        return (
          <div onMouseLeave={handleSyncedChartGroupMouseLeave}>
            <CostChart
              entries={chartData}
              key={panel.tab}
              initialTab={panel.tab}
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
              key={panel.tab}
              initialTab={panel.tab}
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
              key={panel.tab}
              initialTab={panel.tab}
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
        return (
          <ModelBreakdown
            key={panel.tab}
            entries={chartData}
            reportType={reportType}
            initialTab={panel.tab}
          />
        );
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

      <div ref={dashboardRef} className="space-y-2">
        <SummaryCards totals={filteredTotals} entryCount={filteredEntries.length} />
        {panels.map((panel, index) => {
          const label = DASHBOARD_CHARTS.find((item) => item.id === panel.id)?.label;
          const rangeLabel = DASHBOARD_RANGES.find((item) => item.id === panel.range)?.label;
          return (
            <section key={panel.key} aria-label={`${label} chart`}>
              <div className="rounded-lg border border-border bg-bg-card">
                <div className="flex min-h-10 items-center justify-end gap-1 px-2 pt-1">
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
                    action="replace"
                    label={`Replace ${label}`}
                    onClick={(event) =>
                      openPicker({ mode: "replace", target: panel.key }, event.currentTarget)
                    }
                  />
                  <PanelAction
                    action="remove"
                    label={`Remove ${label}`}
                    onClick={(event) => {
                      removalTrigger.current = event.currentTarget;
                      setRemoval({ key: panel.key, label: label ?? panel.id });
                    }}
                  />
                </div>
                <div className="dashboard-panel-chart">
                  <PanelMarkdownProvider panelKey={panel.key} register={registerMarkdownSection}>
                    {renderChart(panel)}
                  </PanelMarkdownProvider>
                </div>
              </div>
              {index < panels.length - 1 && (
                <InsertChartButton
                  label={`Add chart after ${label}`}
                  onClick={(event) =>
                    openPicker({ mode: "add", target: panel.key }, event.currentTarget)
                  }
                  className="mt-2"
                />
              )}
            </section>
          );
        })}
      </div>
      <InsertChartButton
        buttonRef={addChartTrigger}
        label="Add chart"
        disabled={!availableCharts.length}
        onClick={(event) => openPicker({ mode: "add" }, event.currentTarget)}
      />
      {picker && pickerCharts.length > 0 && (
        <ChartPickerModal
          key={`${picker.mode}-${picker.target ?? ""}`}
          mode={picker.mode}
          reportType={reportType}
          granularity={granularity}
          hasMultipleEntries={entries.length > 1}
          addedCharts={addedChartIds}
          charts={pickerCharts}
          hasAgentData={entries.some((entry) => !!entry.agentBreakdowns?.length)}
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
          initialTab={
            picker.mode === "replace"
              ? panels.find((panel) => panel.key === picker.target)?.tab
              : undefined
          }
          onApply={applyPanel}
          onClose={closePicker}
          preview={(id, selectedRange, tab) =>
            renderChart({ key: "preview", id, range: selectedRange, tab })
          }
        />
      )}
      {removal && (
        <Dialog open onOpenChange={(open) => !open && setRemoval(null)}>
          <DialogContent
            className="sm:max-w-md"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              removalTitle.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = confirmedRemoval.current
                ? removalSuccessFocus.current
                : removalTrigger.current;
              confirmedRemoval.current = false;
              removalSuccessFocus.current = null;
              requestAnimationFrame(() => target?.focus());
            }}
          >
            <DialogTitle ref={removalTitle} tabIndex={-1} className="pr-10 text-lg font-semibold">
              Remove {removal.label} chart?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-secondary">
              This chart will be removed from the dashboard. You can add it again later.
            </DialogDescription>
            <div className="mt-6 flex justify-end gap-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Cancel
                </button>
              </DialogClose>
              <button
                type="button"
                onClick={() => {
                  const section = removalTrigger.current?.closest("section");
                  removalSuccessFocus.current =
                    section?.nextElementSibling?.querySelector<HTMLButtonElement>(
                      'button[aria-label^="Remove "]',
                    ) ??
                    section?.previousElementSibling?.querySelector<HTMLButtonElement>(
                      'button[aria-label^="Remove "]',
                    ) ??
                    addChartTrigger.current;
                  confirmedRemoval.current = true;
                  setPanels((current) => current.filter((item) => item.key !== removal.key));
                  setRemoval(null);
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                Remove chart
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {filteredEntries.length > 0 && <DataTable entries={filteredEntries} />}
    </div>
  );
}
