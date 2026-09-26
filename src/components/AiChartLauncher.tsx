import { lazy, Suspense, useState } from "react";
import type { SourceInput } from "../utils/inputs";

const AiChart = lazy(() => import("./AiChart").then((module) => ({ default: module.AiChart })));

export function AiChartLauncher({ inputs }: { inputs: SourceInput[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="rounded-md border border-border bg-bg-card px-3 py-1.5 text-sm hover:bg-bg-secondary"
      >
        {open ? "Hide AI chart" : "Ask AI for a chart"}
      </button>
      {open && (
        <Suspense fallback={<p className="text-sm text-text-secondary">Loading AI chart…</p>}>
          <AiChart inputs={inputs} />
        </Suspense>
      )}
    </div>
  );
}
