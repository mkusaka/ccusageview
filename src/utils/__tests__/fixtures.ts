// Shared test fixtures for ccusage report types
import type {
  DailyReport,
  WeeklyReport,
  MonthlyReport,
  SessionReport,
  BlocksReport,
  Totals,
  TimeEntry,
  ModelBreakdown,
} from "../../types";

const MB_SONNET: ModelBreakdown = {
  modelName: "claude-sonnet-4-20250514",
  inputTokens: 500_000,
  outputTokens: 20_000,
  cacheCreationTokens: 100_000,
  cacheReadTokens: 800_000,
  cost: 2.5,
};

const MB_HAIKU: ModelBreakdown = {
  modelName: "claude-haiku-3-20240307",
  inputTokens: 100_000,
  outputTokens: 5_000,
  cacheCreationTokens: 10_000,
  cacheReadTokens: 200_000,
  cost: 0.3,
};

function makeTotals(entries: TimeEntry[]): Totals {
  return {
    inputTokens: entries.reduce((s, e) => s + e.inputTokens, 0),
    outputTokens: entries.reduce((s, e) => s + e.outputTokens, 0),
    cacheCreationTokens: entries.reduce((s, e) => s + e.cacheCreationTokens, 0),
    cacheReadTokens: entries.reduce((s, e) => s + e.cacheReadTokens, 0),
    totalTokens: entries.reduce((s, e) => s + e.totalTokens, 0),
    totalCost: entries.reduce((s, e) => s + e.totalCost, 0),
  };
}

const DAILY_ENTRIES: TimeEntry[] = [
  {
    date: "2025-07-01",
    inputTokens: 600_000,
    outputTokens: 25_000,
    cacheCreationTokens: 110_000,
    cacheReadTokens: 1_000_000,
    totalTokens: 1_735_000,
    totalCost: 2.8,
    modelsUsed: ["claude-sonnet-4-20250514", "claude-haiku-3-20240307"],
    modelBreakdowns: [MB_SONNET, MB_HAIKU],
  },
  {
    date: "2025-07-02",
    inputTokens: 400_000,
    outputTokens: 15_000,
    cacheCreationTokens: 50_000,
    cacheReadTokens: 500_000,
    totalTokens: 965_000,
    totalCost: 1.5,
    modelsUsed: ["claude-sonnet-4-20250514"],
    modelBreakdowns: [MB_SONNET],
  },
  {
    date: "2025-08-01",
    inputTokens: 200_000,
    outputTokens: 10_000,
    cacheCreationTokens: 30_000,
    cacheReadTokens: 300_000,
    totalTokens: 540_000,
    totalCost: 0.9,
    modelsUsed: ["claude-haiku-3-20240307"],
    modelBreakdowns: [MB_HAIKU],
  },
];

export const DAILY_REPORT: DailyReport = {
  type: "daily",
  daily: DAILY_ENTRIES,
  totals: makeTotals(DAILY_ENTRIES),
};

const WEEKLY_ENTRIES: TimeEntry[] = [
  {
    week: "2025-06-30",
    inputTokens: 1_000_000,
    outputTokens: 40_000,
    cacheCreationTokens: 160_000,
    cacheReadTokens: 1_500_000,
    totalTokens: 2_700_000,
    totalCost: 4.3,
    modelsUsed: ["claude-sonnet-4-20250514", "claude-haiku-3-20240307"],
    modelBreakdowns: [MB_SONNET, MB_HAIKU],
  },
];

export const WEEKLY_REPORT: WeeklyReport = {
  type: "weekly",
  weekly: WEEKLY_ENTRIES,
  totals: makeTotals(WEEKLY_ENTRIES),
};

const MONTHLY_ENTRIES: TimeEntry[] = [
  {
    month: "2025-07",
    inputTokens: 1_000_000,
    outputTokens: 40_000,
    cacheCreationTokens: 160_000,
    cacheReadTokens: 1_500_000,
    totalTokens: 2_700_000,
    totalCost: 4.3,
    modelsUsed: ["claude-sonnet-4-20250514"],
    modelBreakdowns: [MB_SONNET],
  },
];

export const MONTHLY_REPORT: MonthlyReport = {
  type: "monthly",
  monthly: MONTHLY_ENTRIES,
  totals: makeTotals(MONTHLY_ENTRIES),
};

export const SESSION_REPORT: SessionReport = {
  type: "session",
  sessions: [
    {
      sessionId: "abc123def456ghi789jkl012mno345",
      inputTokens: 600_000,
      outputTokens: 25_000,
      cacheCreationTokens: 110_000,
      cacheReadTokens: 1_000_000,
      totalTokens: 1_735_000,
      totalCost: 2.8,
      lastActivity: "2025-07-02T10:00:00Z",
      modelsUsed: ["claude-sonnet-4-20250514"],
      modelBreakdowns: [MB_SONNET],
      projectPath: "/home/user/my-project",
    },
    {
      sessionId: "zzz999yyy888xxx777www666vvv555",
      inputTokens: 100_000,
      outputTokens: 5_000,
      cacheCreationTokens: 10_000,
      cacheReadTokens: 200_000,
      totalTokens: 315_000,
      totalCost: 0.3,
      lastActivity: "2025-07-01T08:00:00Z",
      modelsUsed: ["claude-haiku-3-20240307"],
      modelBreakdowns: [MB_HAIKU],
      projectPath: "Unknown Project",
    },
  ],
  totals: {
    inputTokens: 700_000,
    outputTokens: 30_000,
    cacheCreationTokens: 120_000,
    cacheReadTokens: 1_200_000,
    totalTokens: 2_050_000,
    totalCost: 3.1,
  },
};

export const BLOCKS_REPORT: BlocksReport = {
  type: "blocks",
  blocks: [
    {
      id: "block-1",
      startTime: "2025-07-01T09:00:00Z",
      endTime: "2025-07-01T10:00:00Z",
      actualEndTime: "2025-07-01T09:55:00Z",
      isActive: false,
      isGap: false,
      entries: 5,
      tokenCounts: {
        inputTokens: 500_000,
        outputTokens: 20_000,
        cacheCreationInputTokens: 100_000,
        cacheReadInputTokens: 800_000,
      },
      totalTokens: 1_420_000,
      costUSD: 2.5,
      models: ["claude-sonnet-4-20250514"],
      burnRate: 2.5,
      projection: null,
    },
    {
      id: "gap-1",
      startTime: "2025-07-01T10:00:00Z",
      endTime: "2025-07-01T11:00:00Z",
      actualEndTime: null,
      isActive: false,
      isGap: true,
      entries: 0,
      tokenCounts: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      totalTokens: 0,
      costUSD: 0,
      models: [],
      burnRate: null,
      projection: null,
    },
    {
      id: "block-2",
      startTime: "2025-07-01T11:00:00Z",
      endTime: "2025-07-01T12:00:00Z",
      actualEndTime: "2025-07-01T11:45:00Z",
      isActive: false,
      isGap: false,
      entries: 3,
      tokenCounts: {
        inputTokens: 100_000,
        outputTokens: 5_000,
        cacheCreationInputTokens: 10_000,
        cacheReadInputTokens: 200_000,
      },
      totalTokens: 315_000,
      costUSD: 0.3,
      models: ["claude-haiku-3-20240307"],
      burnRate: 0.4,
      projection: null,
    },
  ],
  totals: {},
};

// Strip the synthetic `type` field to simulate raw JSON input
export function rawDaily() {
  const { type: _, ...rest } = DAILY_REPORT;
  return rest;
}

export function rawWeekly() {
  const { type: _, ...rest } = WEEKLY_REPORT;
  return rest;
}

export function rawMonthly() {
  const { type: _, ...rest } = MONTHLY_REPORT;
  return rest;
}

export function rawSession() {
  const { type: _, ...rest } = SESSION_REPORT;
  return rest;
}

export function rawBlocks() {
  const { type: _, ...rest } = BLOCKS_REPORT;
  return rest;
}
