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
  totalCost?: number;
  costUSD?: number;
}

interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

interface CodexModelBreakdown extends UsageMetrics {
  costUSD?: number;
  isFallback?: boolean;
  reasoningOutputTokens?: number;
}

// Shared fields for daily/weekly/monthly entries in ccusage's Claude output
interface ClaudeTimeEntry extends UsageMetrics {
  period: string;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

// Shared fields for daily/weekly/monthly entries in ccusage's Codex output
interface CodexTimeEntry extends UsageMetrics {
  date: string;
  costUSD: number;
  models: Record<string, CodexModelBreakdown>;
  reasoningOutputTokens?: number;
}

export type TimeEntry = ClaudeTimeEntry | CodexTimeEntry;

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

interface SessionEntry {
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
interface BlockTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

interface BlockEntry {
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
}

export type ReportData = DailyReport | WeeklyReport | MonthlyReport | SessionReport | BlocksReport;

export type ReportType = ReportData["type"];
