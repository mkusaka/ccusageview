import type {
  ReportData,
  DailyReport,
  WeeklyReport,
  MonthlyReport,
  SessionReport,
  BlocksReport,
} from "../types";

// Auto-detect report type from top-level JSON keys and attach synthetic `type` field
export function detectReportType(data: unknown): ReportData {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if ("daily" in obj && Array.isArray(obj.daily)) {
    return { ...obj, type: "daily" } as DailyReport;
  }
  if ("weekly" in obj && Array.isArray(obj.weekly)) {
    return { ...obj, type: "weekly" } as WeeklyReport;
  }
  if ("monthly" in obj && Array.isArray(obj.monthly)) {
    return { ...obj, type: "monthly" } as MonthlyReport;
  }
  if ("sessions" in obj && Array.isArray(obj.sessions)) {
    return { ...obj, type: "session" } as SessionReport;
  }
  if ("blocks" in obj && Array.isArray(obj.blocks)) {
    return { ...obj, type: "blocks" } as BlocksReport;
  }

  throw new Error(
    "Unrecognized report format. Expected one of: daily, weekly, monthly, sessions, blocks"
  );
}
