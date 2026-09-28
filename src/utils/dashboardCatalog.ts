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
] as const;

export type DashboardChartId = (typeof DASHBOARD_CHARTS)[number]["id"];

export const DASHBOARD_CHART_TABS = {
  statistics: [
    { id: "total", label: "Total", description: "Overall usage distribution and summary" },
    { id: "model", label: "By Model", description: "Usage statistics grouped by model" },
    { id: "provider", label: "By Provider", description: "Usage statistics grouped by provider" },
    { id: "agent", label: "By Agent", description: "Usage statistics grouped by agent or harness" },
  ],
  activity: [],
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

export function availableChartIds(
  reportType: ReportType,
  granularity: TimeGranularity,
  entryCount: number,
): DashboardChartId[] {
  if (!entryCount) return [];
  return DASHBOARD_CHARTS.flatMap(({ id }) => {
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
