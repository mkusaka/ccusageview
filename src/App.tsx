import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { buildHash, loadFromHash } from "./utils/compression";
import { buildHashPayload, createSourceInput, parseInputs, restoreFromHash } from "./utils/inputs";
import type { SourceInput } from "./utils/inputs";
import { InputView } from "./components/InputView";
import { Dashboard } from "./components/Dashboard";
import { ShareButton } from "./components/ShareButton";

function App() {
  const [inputs, setInputs] = useState<SourceInput[]>([createSourceInput()]);
  const [activeTab, setActiveTab] = useState(0);
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

  const toggleSource = useCallback((index: number) => {
    setInputs((prev) =>
      prev.map((inp, i) => (i === index ? { ...inp, enabled: !inp.enabled } : inp)),
    );
  }, []);

  const nonEmptyInputs = inputs.flatMap((inp) => (inp.content.trim() ? [inp] : []));

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight">
            ccusage<span className="text-text-secondary font-normal">view</span>
          </h1>
          <div className="flex items-center gap-1">
            {parseResult.data && <ShareButton />}
            <button
              onClick={() => setDarkMode((d) => !d)}
              className="size-8 flex items-center justify-center rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
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
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <InputView
          inputs={inputs}
          onChange={handleInputsChange}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          error={parseResult.error}
        />
        {nonEmptyInputs.length >= 2 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Sources:</span>
            {inputs.map((inp, i) => {
              if (!inp.content.trim()) return null;
              return (
                <button
                  key={inp.id}
                  onClick={() => toggleSource(i)}
                  className={`px-2.5 py-1 rounded-full border transition-colors select-none ${
                    inp.enabled
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "bg-bg-secondary border-border text-text-secondary"
                  }`}
                >
                  {inp.label || `Source ${i + 1}`}
                </button>
              );
            })}
          </div>
        )}
        {parseResult.data && <Dashboard data={parseResult.data} />}
      </main>
    </div>
  );
}

export default App;
