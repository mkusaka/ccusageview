import type { ButtonHTMLAttributes, ReactNode } from "react";
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

// A tab button that looks disabled and shows a tooltip with the command to
// generate the missing data. Uses aria-disabled instead of disabled —
// disabled buttons don't fire hover events, so their title never shows.
export function HintedTab({
  hint,
  children,
  onClick,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  hint: string | null;
  children: ReactNode;
}) {
  return (
    <button
      {...buttonProps}
      aria-disabled={hint != null || undefined}
      title={hint ? `No data — generate it with ${hint}` : undefined}
      onClick={hint == null ? onClick : undefined}
    >
      {children}
    </button>
  );
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
