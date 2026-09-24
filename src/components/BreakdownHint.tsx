import type { ReportType } from "../types";

const AGENT_REPORTS = new Set<ReportType>(["daily", "weekly", "monthly", "session"]);

// Command that produces the data a breakdown view needs, for the loaded report type.
// Hourly reports only come from ccost (ccusage has no hourly command).
export function breakdownHintCommand(
  reportType: ReportType | undefined,
  kind: "model" | "agent",
): string {
  if (kind === "agent") {
    const report = reportType && AGENT_REPORTS.has(reportType) ? reportType : "daily";
    return `ccusage ${report} --json --by-agent`;
  }
  if (reportType === "hourly") return "ccost hourly --json";
  const report = reportType && reportType !== "blocks" ? reportType : "daily";
  return `ccusage ${report} --json`;
}

// Disabled-state props for a breakdown tab whose data is missing.
// The tooltip explains how to generate it.
export function disabledHintProps(command: string | null): {
  disabled?: boolean;
  title?: string;
} {
  return command ? { disabled: true, title: `No data — generate it with ${command}` } : {};
}

export function BreakdownHint({ command }: { command: string }) {
  return (
    <p className="mb-3 text-xs text-text-secondary">
      No data for this view — generate it with{" "}
      <code className="rounded bg-bg-secondary px-1.5 py-0.5 font-mono text-text-primary">
        {command}
      </code>
    </p>
  );
}
