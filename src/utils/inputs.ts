import type { ReportData, ReportType } from "../types";
import { detectReportType } from "./detect";
import { normalizeEntries, normalizeTotals, computeTotalsFromEntries } from "./normalize";
import type { DashboardData } from "./normalize";
import { mergeNormalizedEntries } from "./merge";

export interface SourceInput {
  id: string;
  label: string;
  content: string;
  enabled: boolean;
}

let nextId = 0;

export function createSourceInput(patch?: Partial<Omit<SourceInput, "id">>): SourceInput {
  return { id: String(nextId++), label: "", content: "", enabled: true, ...patch };
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
    if (!input.enabled) continue;
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
          sources.push({ report: detectReportType(item), label: input.label });
        } catch (e) {
          return { data: null, error: e instanceof Error ? e.message : "Invalid report" };
        }
      }
    } else {
      try {
        sources.push({ report: detectReportType(parsed), label: input.label });
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
  const sourceLabels = sources.flatMap((s) => (s.label ? [s.label] : []));

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

export function restoreFromHash(json: string): SourceInput[] | null {
  try {
    const parsed = JSON.parse(json);

    // Labeled format: { sources: [{ label, data }...] }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "sources" in parsed) {
      const sources = parsed.sources as { label: string; data: unknown }[];
      return sources.map((s) =>
        createSourceInput({
          label: s.label ?? "",
          content: JSON.stringify(s.data, null, 2),
        }),
      );
    }

    // Array format (multi-source, no labels)
    if (Array.isArray(parsed)) {
      // Check if it looks like an array of reports (not a report itself)
      // Reports are objects with keys like daily/weekly/monthly/sessions/blocks
      if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
        const firstKeys = Object.keys(parsed[0]);
        const reportKeys = new Set(["daily", "weekly", "monthly", "sessions", "blocks"]);
        if (firstKeys.some((k) => reportKeys.has(k))) {
          return parsed.map((item: unknown) =>
            createSourceInput({
              content: JSON.stringify(item, null, 2),
            }),
          );
        }
      }
    }

    // Legacy single report
    return [createSourceInput({ content: JSON.stringify(parsed, null, 2) })];
  } catch {
    return null;
  }
}
