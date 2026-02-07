import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ReportData } from "./types";
import { buildHash, loadFromHash } from "./utils/compression";
import { detectReportType } from "./utils/detect";
import { InputView } from "./components/InputView";
import { Dashboard } from "./components/Dashboard";

function App() {
  const [input, setInput] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("ccusageview-dark");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Track whether we should skip the next hash update (to avoid loops)
  const skipHashUpdate = useRef(false);

  // Restore from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    try {
      const json = loadFromHash(hash);
      if (!json) return;
      const parsed = JSON.parse(json);
      const detected = detectReportType(parsed);
      setInput(JSON.stringify(parsed, null, 2));
      setReport(detected);
      setError(null);
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

  // Parse input and update report on every change
  const parseResult = useMemo(() => {
    if (!input.trim()) return { report: null, error: null };
    try {
      const parsed = JSON.parse(input);
      const detected = detectReportType(parsed);
      return { report: detected, error: null };
    } catch (e) {
      return {
        report: null,
        error: e instanceof Error ? e.message : "Invalid JSON",
      };
    }
  }, [input]);

  // Sync parseResult to state
  useEffect(() => {
    setReport(parseResult.report);
    setError(parseResult.error);
  }, [parseResult]);

  // Debounced hash update (500ms after last valid input)
  useEffect(() => {
    if (!parseResult.report) return;
    if (skipHashUpdate.current) {
      skipHashUpdate.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        const hash = buildHash(input);
        window.history.replaceState(null, "", hash);
      } catch {
        // Ignore compression errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [parseResult.report, input]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
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
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 9.5A6.5 6.5 0 016.5 2 5.5 5.5 0 1014 9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <InputView value={input} onChange={handleInputChange} error={error} />
        {report && <Dashboard report={report} />}
      </main>
    </div>
  );
}

export default App;
