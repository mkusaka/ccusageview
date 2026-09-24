// Commands to generate the data a breakdown view needs.
export const BREAKDOWN_HINT_MODEL = "ccusage daily --json";
export const BREAKDOWN_HINT_AGENT = "ccusage daily --json --by-agent";
// Hourly reports only come from ccost (ccusage has no hourly command).
export const BREAKDOWN_HINT_HOURLY = "ccost hourly --json";

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
