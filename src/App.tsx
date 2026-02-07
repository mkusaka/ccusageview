import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ReportData, ReportType } from "./types";
import { buildHash, loadFromHash } from "./utils/compression";
import { detectReportType } from "./utils/detect";
import { adaptReport } from "./utils/adapt";
import { normalizeEntries, normalizeTotals, computeTotalsFromEntries } from "./utils/normalize";
import type { DashboardData } from "./utils/normalize";
import { mergeNormalizedEntries } from "./utils/merge";
import { InputView } from "./components/InputView";
import { Dashboard } from "./components/Dashboard";

export interface SourceInput {
  label: string;
  content: string;
}

interface ParsedSource {
  report: ReportData;
  label: string;
}

export function parseInputs(inputs: SourceInput[]): {
  data: DashboardData | null;
  error: string | null;
} {
  const sources: ParsedSource[] = [];

  for (const input of inputs) {
    const text = input.content.trim();
    if (!text) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : "Invalid JSON" };
    }

    // Handle jq -s style arrays
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        try {
          sources.push({ report: detectReportType(adaptReport(item)), label: input.label });
        } catch (e) {
          return { data: null, error: e instanceof Error ? e.message : "Invalid report" };
        }
      }
    } else {
      try {
        sources.push({ report: detectReportType(adaptReport(parsed)), label: input.label });
      } catch (e) {
        return { data: null, error: e instanceof Error ? e.message : "Invalid report" };
      }
    }
  }

  if (sources.length === 0) return { data: null, error: null };

  // Same-type constraint
  const types = new Set(sources.map((s) => s.report.type));
  if (types.size > 1) {
    const typeList = Array.from(types).join(", ");
    return { data: null, error: `Cannot merge different report types: ${typeList}` };
  }

  const reportType: ReportType = sources[0].report.type;
  const sourceLabels = sources.map((s) => s.label).filter(Boolean);

  if (sources.length === 1) {
    const report = sources[0].report;
    return {
      data: {
        entries: normalizeEntries(report),
        totals: normalizeTotals(report),
        reportType,
        sourceLabels,
      },
      error: null,
    };
  }

  // Normalize each, then merge
  const allEntryArrays = sources.map((s) => normalizeEntries(s.report));
  const entries = mergeNormalizedEntries(allEntryArrays);
  const totals = computeTotalsFromEntries(entries);

  return {
    data: { entries, totals, reportType, sourceLabels },
    error: null,
  };
}

// Build hash payload from inputs
export function buildHashPayload(inputs: SourceInput[]): string | null {
  const nonEmpty = inputs.filter((inp) => inp.content.trim());
  if (nonEmpty.length === 0) return null;

  const hasAnyLabel = nonEmpty.some((inp) => inp.label);

  if (nonEmpty.length === 1 && !hasAnyLabel) {
    // Single source, no label: legacy format (raw JSON)
    return nonEmpty[0].content;
  }

  if (hasAnyLabel) {
    // Labeled format: { sources: [{ label, data }...] }
    return JSON.stringify({
      sources: nonEmpty.map((inp) => ({
        label: inp.label,
        data: JSON.parse(inp.content),
      })),
    });
  }

  // Multiple sources, no labels: array format
  return JSON.stringify(nonEmpty.map((inp) => JSON.parse(inp.content)));
}

// Restore inputs from decoded hash JSON
export function restoreFromHash(json: string): SourceInput[] | null {
  try {
    const parsed = JSON.parse(json);

    // Labeled format: { sources: [{ label, data }...] }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "sources" in parsed) {
      const sources = parsed.sources as { label: string; data: unknown }[];
      return sources.map((s) => ({
        label: s.label ?? "",
        content: JSON.stringify(s.data, null, 2),
      }));
    }

    // Array format (multi-source, no labels)
    if (Array.isArray(parsed)) {
      // Check if it looks like an array of reports (not a report itself)
      // Reports are objects with keys like daily/weekly/monthly/sessions/blocks
      if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
        const firstKeys = Object.keys(parsed[0]);
        const reportKeys = new Set(["daily", "weekly", "monthly", "sessions", "blocks"]);
        if (firstKeys.some((k) => reportKeys.has(k))) {
          return parsed.map((item: unknown) => ({
            label: "",
            content: JSON.stringify(item, null, 2),
          }));
        }
      }
    }

    // Legacy single report
    return [{ label: "", content: JSON.stringify(parsed, null, 2) }];
  } catch {
    return null;
  }
}

function App() {
  const [inputs, setInputs] = useState<SourceInput[]>([{ label: "", content: "" }]);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("ccusageview-dark");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const skipHashUpdate = useRef(false);

  // Restore from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    try {
      const json = loadFromHash(hash);
      if (!json) return;
      const restored = restoreFromHash(json);
      if (!restored || restored.length === 0) return;
      setInputs(restored);
      skipHashUpdate.current = true;
    } catch {
      // Silently ignore invalid hash data on load
    }
  }, []);

  // Sync dark mode
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("ccusageview-dark", String(darkMode));
  }, [darkMode]);

  // Parse inputs
  const parseResult = useMemo(() => parseInputs(inputs), [inputs]);

  // Sync error
  useEffect(() => {
    setError(parseResult.error);
  }, [parseResult]);

  // Debounced hash update
  useEffect(() => {
    if (!parseResult.data) return;
    if (skipHashUpdate.current) {
      skipHashUpdate.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        const payload = buildHashPayload(inputs);
        if (payload) {
          const hash = buildHash(payload);
          window.history.replaceState(null, "", hash);
        }
      } catch {
        // Ignore compression errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [parseResult.data, inputs]);

  const handleInputsChange = useCallback((newInputs: SourceInput[]) => {
    setInputs(newInputs);
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight">
            ccusage<span className="text-text-secondary font-normal">view</span>
          </h1>
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
            title="Toggle dark mode"
          >
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M14 9.5A6.5 6.5 0 016.5 2 5.5 5.5 0 1014 9.5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <InputView
          inputs={inputs}
          onChange={handleInputsChange}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          error={error}
        />
        {parseResult.data && <Dashboard data={parseResult.data} />}
      </main>
    </div>
  );
}

export default App;
