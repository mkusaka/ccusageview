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

/**
 * Shared state for the "By Provider → Model" drill-down views.
 *
 * The selection is derived during render rather than synced with an effect: when the
 * requested provider is absent from the current entries we fall back to the first one,
 * and it becomes selected again if it reappears (e.g. after widening a date range).
 */
export function useProviderSelection(
  entries: NormalizedEntry[],
  isActive: boolean,
): ProviderSelection {
  const [requestedProvider, setRequestedProvider] = useState<string | null>(null);
  const providerKeys = useMemo(() => collectModels(entries, "provider"), [entries]);
  const selectedProvider =
    requestedProvider && providerKeys.includes(requestedProvider)
      ? requestedProvider
      : (providerKeys[0] ?? null);

  return {
    providerKeys,
    selectedProvider,
    activeProviderFilter: isActive && selectedProvider !== null ? selectedProvider : undefined,
    selectProvider: setRequestedProvider,
  };
}
