import {
  ANALYSIS_AXIS_OPTIONS,
  DASHBOARD_CHART_TABS,
  availableAnalysisGranularities,
  isAnalysisAxisAvailable,
  type AnalysisAvailability,
  type DashboardChartId,
  type DashboardChartTabId,
  type DashboardRangeId,
} from "./dashboardCatalog";
import type { TimeGranularity } from "./projection";

export interface PickerSuggestion {
  chart: DashboardChartId;
  tab?: DashboardChartTabId;
  range: DashboardRangeId;
  chartGranularity?: TimeGranularity;
  confidence: number;
}

export type PickerSelection = Pick<
  PickerSuggestion,
  "chart" | "tab" | "range" | "chartGranularity"
>;

export function defaultPickerTab(
  chart: DashboardChartId,
  metadata?: AnalysisAvailability,
): DashboardChartTabId | undefined {
  if (chart === "analysis" && metadata)
    return ANALYSIS_AXIS_OPTIONS.find(({ id }) => isAnalysisAxisAvailable(id, metadata))?.id;
  return DASHBOARD_CHART_TABS[chart][0]?.id;
}

export function isPickerSelectionAvailable(
  selection: PickerSelection,
  charts: DashboardChartId[],
  ranges: DashboardRangeId[],
  metadata: AnalysisAvailability,
): boolean {
  return (
    charts.includes(selection.chart) &&
    ranges.includes(selection.range) &&
    (selection.chart === "analysis"
      ? ANALYSIS_AXIS_OPTIONS.some(
          ({ id }) => id === selection.tab && isAnalysisAxisAvailable(id, metadata),
        ) &&
        availableAnalysisGranularities(metadata.reportType).includes(
          selection.chartGranularity ?? "dashboard",
        )
      : selection.chartGranularity === undefined &&
        (metadata.hasAgentData || (selection.tab !== "agent" && selection.tab !== "agentModel")))
  );
}
