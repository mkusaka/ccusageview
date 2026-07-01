export type TimeGranularity = "daily" | "weekly" | "monthly";

export interface ProjectionInfo {
  sourceLabel: string;
  elapsedRatio: number;
  multiplier: number;
}

export interface ProjectionMetrics {
  projection: ProjectionInfo | null;
  projected: Record<string, number>;
  remaining: Record<string, number>;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const day = start.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getElapsedRatio(start: Date, end: Date, now: Date): number | null {
  const duration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (duration <= 0 || elapsed <= 0 || elapsed >= duration) return null;
  return elapsed / duration;
}

function getCurrentPeriod(
  granularity: TimeGranularity,
  now: Date,
): { label: string; start: Date; end: Date } {
  if (granularity === "monthly") {
    const start = startOfMonth(now);
    return {
      label: formatMonthLabel(now),
      start,
      end: addMonths(start, 1),
    };
  }

  if (granularity === "weekly") {
    const start = startOfWeek(now);
    return {
      label: formatDateLabel(start),
      start,
      end: addDays(start, 7),
    };
  }

  const start = startOfDay(now);
  return {
    label: formatDateLabel(now),
    start,
    end: addDays(start, 1),
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getProjectionInfo(
  sourceLabel: string,
  granularity: TimeGranularity | undefined,
  now = new Date(),
): ProjectionInfo | null {
  if (!granularity) return null;

  const period = getCurrentPeriod(granularity, now);
  if (sourceLabel !== period.label) return null;

  const elapsedRatio = getElapsedRatio(period.start, period.end, now);
  if (elapsedRatio == null) return null;

  return {
    sourceLabel,
    elapsedRatio,
    multiplier: 1 / elapsedRatio,
  };
}

export function getProjectionMetrics(
  row: object | null | undefined,
  metricKeys: readonly string[],
  granularity: TimeGranularity | undefined,
  now = new Date(),
): ProjectionMetrics {
  const empty = { projection: null, projected: {}, remaining: {} };
  if (!row || metricKeys.length === 0) return empty;

  const record = row as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label : null;
  if (!label) return empty;

  const projection = getProjectionInfo(label, granularity, now);
  if (!projection) return empty;

  const projected: Record<string, number> = {};
  const remaining: Record<string, number> = {};

  for (const key of metricKeys) {
    const value = asFiniteNumber(record[key]);
    if (value == null) continue;
    const projectedValue = value * projection.multiplier;
    projected[key] = projectedValue;
    remaining[key] = Math.max(0, projectedValue - value);
  }

  return { projection, projected, remaining };
}

export function formatProjectionMetadata(projection: ProjectionInfo | null): string | null {
  if (!projection) return null;
  return `${projection.sourceLabel} (${projection.multiplier.toFixed(2)}x)`;
}
