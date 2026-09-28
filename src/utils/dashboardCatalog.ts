import type { ReportType } from "../types";
import type { TimeGranularity } from "./projection";

export const DASHBOARD_CHARTS = [
  {
    id: "statistics",
    label: "Statistics",
    description: "Usage distribution and summary statistics / 統計・分布",
  },
  {
    id: "activity",
    label: "Activity",
    description: "Daily activity heatmap / 日別の活動ヒートマップ",
  },
  {
    id: "day-of-week",
    label: "Day of week",
    description: "Usage grouped by weekday / 曜日別の利用",
  },
  {
    id: "hour-of-day",
    label: "Hour of day",
    description: "Usage grouped by hour / 時間帯別の利用",
  },
  {
    id: "cost",
    label: "Cost over time",
    description:
      "Cost trend and model, provider, or agent breakdown / コスト推移、モデル別・プロバイダ別・エージェント別コスト",
  },
  {
    id: "tokens",
    label: "Token breakdown",
    description: "Input, output, cache, and total token usage / 入力・出力・キャッシュ・総トークン",
  },
  {
    id: "cache",
    label: "Cache efficiency",
    description: "Cache read rate and cache usage / キャッシュ効率と読み取り率",
  },
  {
    id: "breakdown",
    label: "Breakdown",
    description: "Model, provider, and agent shares / モデル・プロバイダ・エージェントの内訳・割合",
  },
] as const;

export type DashboardChartId = (typeof DASHBOARD_CHARTS)[number]["id"];

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
