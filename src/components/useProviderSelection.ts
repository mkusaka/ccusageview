import { useMemo, useState } from "react";
import { collectModels } from "../utils/chart";
import type { NormalizedEntry } from "../utils/normalize";

export interface ProviderSelection {
  /** Providers present in the current entries, in stable display order. */
  providerKeys: string[];
  /** Currently selected provider, or null when no provider data exists. */
  selectedProvider: string | null;
  /** Provider to pass as `providerFilter`; undefined unless the drill-down view is active. */
  activeProviderFilter: string | undefined;
  selectProvider: (provider: string) => void;
}

export interface AgentSelection {
  /** Agents present in the current entries, in stable display order. */
  agentKeys: string[];
  /** Currently selected agent, or null when no agent data exists. */
  selectedAgent: string | null;
  /** Agent to pass as `agentFilter`; undefined unless the drill-down view is active. */
  activeAgentFilter: string | undefined;
  selectAgent: (agent: string) => void;
}

/**
 * Shared state for the drill-down views.
 *
 * The selection is derived during render rather than synced with an effect: when the
 * requested key is absent from the current entries we fall back to the first one,
 * and it becomes selected again if it reappears (e.g. after widening a date range).
 */
function useKeySelection(
  keys: string[],
  isActive: boolean,
): { selected: string | null; activeFilter: string | undefined; select: (k: string) => void } {
  const [requested, setRequested] = useState<string | null>(null);
  const selected = requested && keys.includes(requested) ? requested : (keys[0] ?? null);
  return {
    selected,
    activeFilter: isActive && selected !== null ? selected : undefined,
    select: setRequested,
  };
}

export function useProviderSelection(
  entries: NormalizedEntry[],
  isActive: boolean,
): ProviderSelection {
  const providerKeys = useMemo(() => collectModels(entries, "provider"), [entries]);
  const { selected, activeFilter, select } = useKeySelection(providerKeys, isActive);
  return {
    providerKeys,
    selectedProvider: selected,
    activeProviderFilter: activeFilter,
    selectProvider: select,
  };
}

export function useAgentSelection(entries: NormalizedEntry[], isActive: boolean): AgentSelection {
  const agentKeys = useMemo(() => collectModels(entries, "agent"), [entries]);
  const { selected, activeFilter, select } = useKeySelection(agentKeys, isActive);
  return {
    agentKeys,
    selectedAgent: selected,
    activeAgentFilter: activeFilter,
    selectAgent: select,
  };
}
