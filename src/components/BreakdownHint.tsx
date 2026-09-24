import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ReportType } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

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
// generate the missing data. Uses aria-disabled instead of disabled so it
// stays interactive enough for the tooltip trigger.
export function HintedTab({
  hint,
  children,
  onClick,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  hint: string | null;
  children: ReactNode;
}) {
  const button = (
    <button
      {...buttonProps}
      aria-disabled={hint != null || undefined}
      onClick={hint == null ? onClick : undefined}
    >
      {children}
    </button>
  );
  if (hint == null) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>No data — generate it with {hint}</TooltipContent>
    </Tooltip>
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
