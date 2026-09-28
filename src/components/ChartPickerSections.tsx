import type { ReactNode } from "react";
import {
  DASHBOARD_CHARTS,
  DASHBOARD_CHART_TABS,
  DASHBOARD_RANGES,
  type DashboardChartId,
  type DashboardChartTabId,
  type DashboardRangeId,
} from "../utils/dashboardCatalog";

export interface PickerSuggestion {
  chart: DashboardChartId;
  tab?: DashboardChartTabId;
  range: DashboardRangeId;
  confidence: number;
}
export type PickerSelection = Pick<PickerSuggestion, "chart" | "tab" | "range">;

export function defaultPickerTab(chart: DashboardChartId): DashboardChartTabId | undefined {
  return DASHBOARD_CHART_TABS[chart][0]?.id;
}

export function isPickerSelectionAvailable(
  selection: PickerSelection,
  charts: DashboardChartId[],
  ranges: DashboardRangeId[],
  hasAgentData: boolean,
): boolean {
  return (
    charts.includes(selection.chart) &&
    ranges.includes(selection.range) &&
    (hasAgentData || (selection.tab !== "agent" && selection.tab !== "agentModel"))
  );
}

type ApplyChart = (
  chart: DashboardChartId,
  range: DashboardRangeId,
  tab?: DashboardChartTabId,
) => void;
type PreviewChart = (
  chart: DashboardChartId,
  range: DashboardRangeId,
  tab?: DashboardChartTabId,
) => ReactNode;

function AddedBadge() {
  return (
    <span className="shrink-0 rounded-full border border-chart-green/70 bg-chart-green/10 px-2 py-0.5 text-[11px] font-semibold text-text-primary">
      Added
    </span>
  );
}

export function ChartPickerAlternatives({
  picks,
  addedCharts,
  title,
  selection,
  charts,
  ranges,
  hasAgentData,
  onSelect,
}: {
  picks: (PickerSelection & { confidence?: number })[];
  addedCharts: ReadonlySet<DashboardChartId>;
  title: string;
  selection: PickerSelection;
  charts: DashboardChartId[];
  ranges: DashboardRangeId[];
  hasAgentData: boolean;
  onSelect: (selection: PickerSelection) => void;
}) {
  if (!picks.length) return null;
  return (
    <div className="space-y-2 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="grid gap-2 md:grid-cols-2">
        {picks.map((item) => {
          const available = isPickerSelectionAvailable(item, charts, ranges, hasAgentData);
          const added = addedCharts.has(item.chart);
          const selected =
            selection.chart === item.chart &&
            selection.tab === item.tab &&
            selection.range === item.range;
          return (
            <li key={`${item.chart}-${item.tab ?? ""}-${item.range}`}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={!available}
                onClick={() => onSelect(item)}
                className={`h-full w-full rounded-md border p-2 text-left text-xs hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-accent bg-accent/10" : added ? "border-chart-green/70 bg-chart-green/10" : "border-border"}`}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  <span>
                    {DASHBOARD_CHARTS.find((entry) => entry.id === item.chart)?.label}
                    {item.tab &&
                      ` · ${DASHBOARD_CHART_TABS[item.chart].find((entry) => entry.id === item.tab)?.label}`}
                  </span>
                  {added && <AddedBadge />}
                </span>
                <span className="text-text-secondary">
                  {DASHBOARD_RANGES.find((entry) => entry.id === item.range)?.label}
                  {item.confidence !== undefined &&
                    ` · ${Math.round(item.confidence * 100)}% confidence`}
                  {!available && " · Unavailable in this view"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChartPickerChoices({
  charts,
  addedCharts,
  ranges,
  hasAgentData,
  selection,
  onSelect,
  onApply,
  preview,
}: {
  charts: DashboardChartId[];
  addedCharts: ReadonlySet<DashboardChartId>;
  ranges: DashboardRangeId[];
  hasAgentData: boolean;
  selection: PickerSelection;
  onSelect: (selection: PickerSelection) => void;
  onApply: ApplyChart;
  preview: PreviewChart;
}) {
  const { chart, range } = selection;
  const tab = selection.tab ?? defaultPickerTab(chart);
  const chartTabs = DASHBOARD_CHART_TABS[chart];
  const available = isPickerSelectionAvailable({ chart, range, tab }, charts, ranges, hasAgentData);
  const added = addedCharts.has(chart);

  return (
    <div className="space-y-5 border-t border-border pt-5">
      <form
        id="chart-picker-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (available) onApply(chart, range, tab);
        }}
        className="space-y-4"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold">Chart</legend>
            <div className="mt-2 space-y-2">
              {DASHBOARD_CHARTS.map((item) => {
                const selectable = charts.includes(item.id);
                const isAdded = addedCharts.has(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex gap-3 rounded-md border p-3 ${chart === item.id ? "border-accent bg-accent/10" : isAdded ? "border-chart-green/70 bg-chart-green/10" : "border-border"} ${selectable ? "cursor-pointer hover:bg-bg-secondary" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="radio"
                      name="chart"
                      value={item.id}
                      checked={chart === item.id}
                      disabled={!selectable}
                      onChange={() =>
                        onSelect({ chart: item.id, range, tab: defaultPickerTab(item.id) })
                      }
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{item.label}</span>
                        {isAdded && <AddedBadge />}
                      </span>
                      <span className="block text-xs text-text-secondary">{item.description}</span>
                      {!selectable && (
                        <span className="block text-xs text-text-secondary">
                          Unavailable for this report or granularity
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold">Date range</legend>
            <div className="mt-2 space-y-2">
              {DASHBOARD_RANGES.map((item) => {
                const selectable = ranges.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex gap-3 rounded-md border p-3 ${range === item.id ? "border-accent bg-accent/10" : "border-border"} ${selectable ? "cursor-pointer hover:bg-bg-secondary" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="radio"
                      name="range"
                      value={item.id}
                      checked={range === item.id}
                      disabled={!selectable}
                      onChange={() => onSelect({ chart, tab, range: item.id })}
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-text-secondary">{item.description}</span>
                      {!selectable && (
                        <span className="block text-xs text-text-secondary">
                          Unavailable for this report type
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        {chartTabs.length > 0 && (
          <fieldset>
            <legend className="text-sm font-semibold">Tab</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {chartTabs.map((item) => {
                const selectable =
                  hasAgentData || (item.id !== "agent" && item.id !== "agentModel");
                return (
                  <label
                    key={item.id}
                    className={`rounded-md border px-2 py-1.5 text-xs ${tab === item.id ? "border-accent bg-accent/10" : "border-border"} ${selectable ? "cursor-pointer hover:bg-bg-secondary" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="radio"
                      name="tab"
                      value={item.id}
                      checked={tab === item.id}
                      disabled={!selectable}
                      onChange={() => onSelect({ chart, range, tab: item.id })}
                      className="mr-1 accent-accent"
                    />
                    {item.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </form>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Preview</h3>
          {added && <AddedBadge />}
        </div>
        <div
          className={`rounded-lg border ${added ? "border-chart-green ring-2 ring-chart-green/20" : "border-border"}`}
        >
          {available ? (
            preview(chart, range, tab)
          ) : (
            <p className="p-4 text-sm text-text-secondary">
              This choice is unavailable for the current report or granularity.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
