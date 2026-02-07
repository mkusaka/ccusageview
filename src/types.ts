// Type definitions for all ccusage JSON report formats

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface Totals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
}

// Shared fields for daily/weekly/monthly entries
export interface TimeEntry {
  date?: string;
  week?: string;
  month?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface DailyReport {
  type: "daily";
  daily: TimeEntry[];
  totals: Totals;
}

export interface WeeklyReport {
  type: "weekly";
  weekly: TimeEntry[];
  totals: Totals;
}

export interface MonthlyReport {
  type: "monthly";
  monthly: TimeEntry[];
  totals: Totals;
}

export interface SessionEntry {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  lastActivity: string;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  projectPath: string;
}

export interface SessionReport {
  type: "session";
  sessions: SessionEntry[];
  totals: Totals;
}

// Blocks report uses different field names
export interface BlockTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface BlockEntry {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime: string | null;
  isActive: boolean;
  isGap: boolean;
  entries: number;
  tokenCounts: BlockTokenCounts;
  totalTokens: number;
  costUSD: number;
  models: string[];
  burnRate: number | null;
  projection: number | null;
}

export interface BlocksReport {
  type: "blocks";
  blocks: BlockEntry[];
  totals: Record<string, unknown>;
}

export type ReportData =
  | DailyReport
  | WeeklyReport
  | MonthlyReport
  | SessionReport
  | BlocksReport;

export type ReportType = ReportData["type"];
