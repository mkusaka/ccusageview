import { useCallback } from "react";
import { createSourceInput } from "../App";
import type { SourceInput } from "../App";

interface Props {
  inputs: SourceInput[];
  onChange: (inputs: SourceInput[]) => void;
  activeTab: number;
  onTabChange: (index: number) => void;
  error: string | null;
}

export function InputView({ inputs, onChange, activeTab, onTabChange, error }: Props) {
  const current = inputs[activeTab] ?? inputs[0];

  const updateCurrent = useCallback(
    (patch: Partial<SourceInput>) => {
      const next = inputs.map((inp, i) => (i === activeTab ? { ...inp, ...patch } : inp));
      onChange(next);
    },
    [inputs, activeTab, onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          updateCurrent({ content: reader.result });
        }
      });
      reader.readAsText(file);
    },
    [updateCurrent],
  );

  const addTab = useCallback(() => {
    onChange([...inputs, createSourceInput()]);
    onTabChange(inputs.length);
  }, [inputs, onChange, onTabChange]);

  const removeTab = useCallback(
    (index: number) => {
      if (inputs.length <= 1) return;
      const next = inputs.filter((_, i) => i !== index);
      onChange(next);
      if (activeTab >= next.length) {
        onTabChange(next.length - 1);
      } else if (activeTab > index) {
        onTabChange(activeTab - 1);
      }
    },
    [inputs, activeTab, onChange, onTabChange],
  );

  const showTabs = inputs.length > 1;

  return (
    <div>
      {/* Tab bar */}
      {showTabs && (
        <div className="flex items-center gap-0.5 mb-2">
          {inputs.map((inp, i) => (
            <div key={inp.id} className="flex items-center">
              <button
                onClick={() => onTabChange(i)}
                className={`px-3 py-1 text-xs rounded-t transition-colors ${
                  i === activeTab
                    ? "bg-bg-card text-text-primary border border-b-0 border-border"
                    : "text-text-secondary hover:text-text-primary bg-bg-secondary"
                }`}
              >
                {inp.label || `Source ${i + 1}`}
              </button>
              <button
                onClick={() => removeTab(i)}
                className="px-1 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                title="Remove tab"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            onClick={addTab}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-secondary rounded transition-colors"
            title="Add source"
          >
            +
          </button>
        </div>
      )}

      {/* Label input */}
      <input
        type="text"
        className="w-full text-xs px-3 py-1.5 mb-1.5 border border-border rounded-md bg-bg-card text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent"
        placeholder="Source name (optional)"
        value={current.label}
        onChange={(e) => updateCurrent({ label: e.target.value })}
      />

      {/* Textarea */}
      <textarea
        className="w-full h-48 font-mono text-sm p-4 border border-border rounded-lg bg-bg-card text-text-primary placeholder:text-text-secondary/50 resize-y focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        placeholder={'Paste ccusage --json output here\n\n{"daily": [...], "totals": {...}}'}
        value={current.content}
        onChange={(e) => updateCurrent({ content: e.target.value })}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        spellCheck={false}
      />

      {/* Add source button when single tab */}
      {!showTabs && (
        <button
          onClick={addTab}
          className="mt-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          + Add another source
        </button>
      )}

      {error && <p className="text-sm text-chart-red mt-1.5 opacity-80">{error}</p>}
    </div>
  );
}
