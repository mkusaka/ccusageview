import type { ReportType } from "../types";
import type { TimeGranularity } from "./projection";

export const DASHBOARD_CHARTS = [
  {
    id: "statistics",
    label: "Statistics",
    description: "Usage distribution and summary statistics",
  },
  { id: "activity", label: "Activity", description: "Daily activity heatmap" },
  { id: "day-of-week", label: "Day of week", description: "Usage grouped by weekday" },
  { id: "hour-of-day", label: "Hour of day", description: "Usage grouped by hour" },
  {
    id: "cost",
    label: "Cost over time",
    description: "Cost trends over time, including model, provider, and agent breakdowns",
  },
  {
    id: "tokens",
    label: "Token breakdown",
    description: "Input, output, cache, and total token usage",
  },
  { id: "cache", label: "Cache efficiency", description: "Cache read rate and cache usage" },
  {
    id: "breakdown",
    label: "Breakdown",
    description: "Shares of total usage by model, provider, or agent, not a time trend",
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "Compare token mix, cost per million tokens, or cache read rate by dimension",
  },
] as const;

export type DashboardChartId = (typeof DASHBOARD_CHARTS)[number]["id"];
export const ANALYSIS_AXIS_OPTIONS = [
  {
    id: "modelTokenMix",
    label: "Token mix by model",
    description: "Input, output, and cache tokens by model",
    dimension: "model",
    measure: "tokenMix",
    visualization: "stackedBar",
  },
  {
    id: "agentTokenMix",
    label: "Token mix by agent",
    description: "Input, output, and cache tokens by agent or harness",
    dimension: "agent",
    measure: "tokenMix",
    visualization: "stackedBar",
  },
  {
    id: "sourceTokenMix",
    label: "Token mix by source",
    description: "Input, output, and cache tokens by imported source",
    dimension: "source",
    measure: "tokenMix",
    visualization: "stackedBar",
  },
  {
    id: "modelCostPerMillion",
    label: "Cost per million tokens by model",
    description: "Effective cost per million tokens by model",
    dimension: "model",
    measure: "costPerMillion",
    visualization: "bar",
  },
  {
    id: "agentCostPerMillion",
    label: "Cost per million tokens by agent",
    description: "Effective cost per million tokens by agent or harness",
    dimension: "agent",
    measure: "costPerMillion",
    visualization: "bar",
  },
  {
    id: "sourceCostPerMillion",
    label: "Cost per million tokens by source",
    description: "Effective cost per million tokens by imported source",
    dimension: "source",
    measure: "costPerMillion",
    visualization: "bar",
  },
  {
    id: "periodCostPerMillion",
    label: "Cost per million tokens over time",
    description: "Effective cost per million tokens by period",
    dimension: "period",
    measure: "costPerMillion",
    visualization: "line",
  },
  {
    id: "modelCacheReadRate",
    label: "Cache read rate by model",
    description: "Share of input tokens read from cache by model",
    dimension: "model",
    measure: "cacheReadRate",
    visualization: "bar",
  },
  {
    id: "agentCacheReadRate",
    label: "Cache read rate by agent",
    description: "Share of input tokens read from cache by agent or harness",
    dimension: "agent",
    measure: "cacheReadRate",
    visualization: "bar",
  },
] as const;

export type AnalysisAxisId = (typeof ANALYSIS_AXIS_OPTIONS)[number]["id"];

export type AnalysisAvailability = {
  reportType: ReportType;
  hasModelData: boolean;
  hasAgentData: boolean;
  hasMultipleSources: boolean;
};

export function isAnalysisAxisAvailable(
  axisId: AnalysisAxisId,
  metadata: AnalysisAvailability,
): boolean {
  const dimension = ANALYSIS_AXIS_OPTIONS.find(({ id }) => id === axisId)?.dimension;
  if (!dimension) return false;
  if (dimension === "model") return metadata.hasModelData;
  if (dimension === "agent") return metadata.hasAgentData;
  if (dimension === "source") return metadata.hasMultipleSources;
  return metadata.reportType !== "session" && metadata.reportType !== "blocks";
}

export const DASHBOARD_CHART_TABS = {
  statistics: [
    { id: "total", label: "Total", description: "Overall usage distribution and summary" },
    { id: "model", label: "By Model", description: "Usage statistics grouped by model" },
    { id: "provider", label: "By Provider", description: "Usage statistics grouped by provider" },
    { id: "agent", label: "By Agent", description: "Usage statistics grouped by agent or harness" },
  ],
  activity: [
    { id: "cost", label: "Cost", description: "Daily cost activity calendar heatmap in USD" },
    {
      id: "totalTokens",
      label: "Total Tokens",
      description: "Daily token activity calendar heatmap of total tokens, not cost",
    },
    {
      id: "inputTokens",
      label: "Input",
      description: "Daily input token activity calendar heatmap, not cost",
    },
    {
      id: "outputTokens",
      label: "Output",
      description: "Daily output token activity calendar heatmap, not cost",
    },
    {
      id: "cacheCreationTokens",
      label: "Cache Write",
      description: "Daily cache write token activity calendar heatmap, not cost",
    },
    {
      id: "cacheReadTokens",
      label: "Cache Read",
      description: "Daily cache read token activity calendar heatmap, not cost",
    },
  ],
  "day-of-week": [
    { id: "total", label: "Total", description: "Overall usage by weekday" },
    { id: "model", label: "By Model", description: "Weekday usage grouped by model" },
    { id: "provider", label: "By Provider", description: "Weekday usage grouped by provider" },
    { id: "agent", label: "By Agent", description: "Weekday usage grouped by agent or harness" },
  ],
  "hour-of-day": [
    { id: "total", label: "Total", description: "Overall usage by hour" },
    { id: "model", label: "By Model", description: "Hourly usage grouped by model" },
    { id: "provider", label: "By Provider", description: "Hourly usage grouped by provider" },
    { id: "agent", label: "By Agent", description: "Hourly usage grouped by agent or harness" },
  ],
  cost: [
    { id: "total", label: "Total", description: "Total cost over time" },
    { id: "model", label: "By Model", description: "Cost over time by model across all agents" },
    { id: "provider", label: "By Provider", description: "Cost over time by provider" },
    {
      id: "providerModel",
      label: "By Model (Provider)",
      description: "Cost over time by model within each provider",
    },
    { id: "agent", label: "By Agent", description: "Cost over time by agent or harness" },
    {
      id: "agentModel",
      label: "By Model (Agent)",
      description: "Cost over time by model within each agent or harness",
    },
    {
      id: "tokenType",
      label: "By Token Type",
      description: "Cost over time by input, output, and cache token type",
    },
  ],
  tokens: [
    {
      id: "type",
      label: "By Type",
      description: "Token usage by input, output, and cache type over time",
    },
    {
      id: "model",
      label: "By Model",
      description: "Token usage over time by model across all agents",
    },
    { id: "provider", label: "By Provider", description: "Token usage over time by provider" },
    {
      id: "providerModel",
      label: "By Model (Provider)",
      description: "Token usage over time by model within each provider",
    },
    { id: "agent", label: "By Agent", description: "Token usage over time by agent or harness" },
    {
      id: "agentModel",
      label: "By Model (Agent)",
      description: "Token usage over time by model within each agent or harness",
    },
  ],
  cache: [
    { id: "total", label: "Total", description: "Overall cache efficiency over time" },
    { id: "model", label: "By Model", description: "Cache efficiency by model" },
    { id: "provider", label: "By Provider", description: "Cache efficiency by provider" },
    { id: "agent", label: "By Agent", description: "Cache efficiency by agent or harness" },
  ],
  breakdown: [
    {
      id: "model",
      label: "By Model",
      description: "Share of total usage by model across all agents; not a time trend",
    },
    {
      id: "provider",
      label: "By Provider",
      description: "Share of total usage by provider; not a time trend",
    },
    {
      id: "providerModel",
      label: "By Model (Provider)",
      description: "Share of total usage by model within each provider; not a time trend",
    },
    {
      id: "agent",
      label: "By Agent",
      description: "Share of total usage by agent or harness; not a time trend",
    },
    {
      id: "agentModel",
      label: "By Model (Agent)",
      description: "Share of total usage by model within each agent or harness; not a time trend",
    },
  ],
  analysis: ANALYSIS_AXIS_OPTIONS.map(({ id, label, description }) => ({ id, label, description })),
} as const satisfies Record<
  DashboardChartId,
  readonly { id: string; label: string; description: string }[]
>;

export type DashboardChartTabId = {
  [Chart in DashboardChartId]: (typeof DASHBOARD_CHART_TABS)[Chart][number]["id"];
}[DashboardChartId];

type ChartOption = {
  id: string;
  chart: DashboardChartId;
  tab?: DashboardChartTabId;
  label: string;
  description: string;
};

export const DASHBOARD_CHART_OPTIONS: ChartOption[] = DASHBOARD_CHARTS.flatMap<ChartOption>(
  ({ id: chart, label, description }) => {
    const tabs: readonly { id: DashboardChartTabId; label: string; description: string }[] =
      DASHBOARD_CHART_TABS[chart];
    return tabs.length
      ? tabs.map(({ id: tab, label: tabLabel, description: tabDescription }) => ({
          id: `${chart}.${tab}`,
          chart,
          tab,
          label: `${label} — ${tabLabel}`,
          description: `${description}. ${tabDescription}`,
        }))
      : [{ id: chart, chart, label, description }];
  },
);

export const DASHBOARD_RANGES = [
  {
    id: "dashboard",
    label: "Dashboard range",
    description: "Follow the current dashboard range slider",
  },
  { id: "all", label: "All dates", description: "Use all dates in the report" },
  { id: "last_7_days", label: "Last 7 days", description: "Seven calendar days ending today" },
  { id: "last_30_days", label: "Last 30 days", description: "Thirty calendar days ending today" },
  { id: "last_90_days", label: "Last 90 days", description: "Ninety calendar days ending today" },
  {
    id: "this_month",
    label: "This month",
    description: "From the first day of this month through today",
  },
  { id: "last_month", label: "Last month", description: "The previous complete calendar month" },
  { id: "this_year", label: "This year", description: "From January 1 through today" },
] as const;

export type DashboardRangeId = (typeof DASHBOARD_RANGES)[number]["id"];
export const ANALYSIS_GRANULARITY_OPTIONS = [
  {
    id: "dashboard",
    label: "Dashboard grouping",
    description: "Follow the dashboard's time grouping",
  },
  { id: "hourly", label: "Hourly", description: "Group by hour" },
  { id: "daily", label: "Daily", description: "Group by day" },
  { id: "weekly", label: "Weekly", description: "Group by week" },
  { id: "monthly", label: "Monthly", description: "Group by month" },
] as const;

export type AnalysisGranularityId = (typeof ANALYSIS_GRANULARITY_OPTIONS)[number]["id"];

export function availableAnalysisGranularities(
  reportType: ReportType,
): readonly AnalysisGranularityId[] {
  if (reportType === "hourly") return ["dashboard", "hourly", "daily", "weekly", "monthly"];
  if (reportType === "daily") return ["dashboard", "daily", "weekly", "monthly"];
  return ["dashboard"];
}

export function availableChartIds(
  reportType: ReportType,
  granularity: TimeGranularity,
  entryCount: number,
  metadata: Omit<AnalysisAvailability, "reportType"> = {
    hasModelData: false,
    hasAgentData: false,
    hasMultipleSources: false,
  },
): DashboardChartId[] {
  if (!entryCount) return [];
  const analysisAvailability = { reportType, ...metadata };
  return DASHBOARD_CHARTS.flatMap(({ id }) => {
    if (
      id === "analysis" &&
      !ANALYSIS_AXIS_OPTIONS.some(({ id: axis }) =>
        isAnalysisAxisAvailable(axis, analysisAvailability),
      )
    )
      return [];
    if (id === "statistics" && entryCount < 2) return [];
    if (id === "activity" && !["daily", "weekly", "hourly"].includes(reportType)) return [];
    if (
      id === "day-of-week" &&
      !(
        (reportType === "daily" && granularity === "daily") ||
        (reportType === "hourly" && granularity !== "hourly")
      )
    )
      return [];
    if (id === "hour-of-day" && !(reportType === "hourly" && granularity === "hourly")) return [];
    return [id];
  });
}

export function availableRangeIds(reportType: ReportType): DashboardRangeId[] {
  return reportType === "daily" || reportType === "hourly"
    ? DASHBOARD_RANGES.map(({ id }) => id)
    : ["dashboard", "all"];
}
