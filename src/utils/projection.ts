export type TimeGranularity = "daily" | "weekly" | "monthly";

export interface ProjectionInfo {
  sourceLabel: string;
  projectedLabel: string;
  elapsedRatio: number;
  multiplier: number;
}

export interface ProjectionResult<T> {
  rows: T[];
  projection: ProjectionInfo | null;
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
    projectedLabel: `${sourceLabel} (projected)`,
    elapsedRatio,
    multiplier: 1 / elapsedRatio,
  };
}

export function appendProjectedRow<T extends object>(
  rows: readonly T[],
  metricKeys: readonly string[],
  granularity: TimeGranularity | undefined,
  now = new Date(),
): ProjectionResult<T> {
  const last = rows.at(-1);
  if (!last || metricKeys.length === 0) return { rows: Array.from(rows), projection: null };

  const lastRecord = last as Record<string, unknown>;
  const label = typeof lastRecord.label === "string" ? lastRecord.label : null;
  if (!label) return { rows: Array.from(rows), projection: null };

  const projection = getProjectionInfo(label, granularity, now);
  if (!projection) return { rows: Array.from(rows), projection: null };

  const projected: Record<string, unknown> = { ...lastRecord, label: projection.projectedLabel };

  for (const key of metricKeys) {
    const value = asFiniteNumber(lastRecord[key]);
    if (value == null) continue;
    projected[key] = value * projection.multiplier;
  }

  return {
    rows: [...rows, projected as T],
    projection,
  };
}

export function formatProjectionMetadata(projection: ProjectionInfo | null): string | null {
  if (!projection) return null;
  return `${projection.sourceLabel} -> ${projection.projectedLabel} (${projection.multiplier.toFixed(
    2,
  )}x)`;
}
