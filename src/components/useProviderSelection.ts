import { useEffect, useMemo, useState } from "react";
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
 * Keeps the selection valid as entries change, falling back to the first provider.
 */
export function useProviderSelection(
  entries: NormalizedEntry[],
  isActive: boolean,
): ProviderSelection {
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const providerKeys = useMemo(() => collectModels(entries, "provider"), [entries]);
  const selectedProvider =
    providerFilter && providerKeys.includes(providerFilter)
      ? providerFilter
      : (providerKeys[0] ?? null);

  useEffect(() => {
    setProviderFilter((current) => {
      if (current && providerKeys.includes(current)) return current;
      return providerKeys[0] ?? null;
    });
  }, [providerKeys]);

  return {
    providerKeys,
    selectedProvider,
    activeProviderFilter: isActive && selectedProvider !== null ? selectedProvider : undefined,
    selectProvider: setProviderFilter,
  };
}
