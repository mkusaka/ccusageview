import { useMemo, useRef, useState } from "react";
import { collectAgentModels } from "../utils/breakdown";
import type { NormalizedEntry } from "../utils/normalize";

export function useAgentModelSelection(entries: NormalizedEntry[], isActive: boolean) {
  const models = useMemo(() => collectAgentModels(entries), [entries]);
  const [requested, setRequested] = useState<string | null>(null);
  const selectedModel =
    isActive && requested !== null && models.includes(requested) ? requested : null;
  return { models, selectedModel, selectModel: setRequested };
}

export function AgentModelFilter({
  models,
  selectedModel,
  onSelect,
}: {
  models: string[];
  selectedModel: string | null;
  onSelect: (model: string | null) => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  if (models.length === 0) return null;

  return (
    <details ref={menuRef} className="relative text-xs">
      <summary className="flex max-w-56 cursor-pointer items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-text-primary list-none [&::-webkit-details-marker]:hidden">
        <span className="truncate" title={selectedModel ?? "All models"}>
          Model: {selectedModel ?? "All models"}
        </span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 max-h-64 min-w-full max-w-80 overflow-y-auto rounded-md border border-border bg-bg-card p-1 shadow-lg">
        {[null, ...models].map((model) => (
          <button
            key={model === null ? "all-models" : `model:${model}`}
            type="button"
            onClick={() => {
              onSelect(model);
              if (menuRef.current) menuRef.current.open = false;
            }}
            className={`block w-full rounded px-2 py-1 text-left hover:bg-bg-secondary ${
              selectedModel === model ? "text-text-primary font-medium" : "text-text-secondary"
            }`}
          >
            {model ?? "All models"}
          </button>
        ))}
      </div>
    </details>
  );
}
