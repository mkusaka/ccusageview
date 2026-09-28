import { useEffect, useRef, useState, type ReactNode } from "react";
import { hc } from "hono/client";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import type { AppType } from "../worker";
import type { ReportType } from "../types";
import type { TimeGranularity } from "../utils/projection";
import {
  DASHBOARD_CHART_OPTIONS,
  DASHBOARD_RANGES,
  ANALYSIS_GRANULARITY_OPTIONS,
  ANALYSIS_AXIS_OPTIONS,
  isAnalysisAxisAvailable,
  type AnalysisAxisId,
  type DashboardChartId,
  type DashboardChartTabId,
  type DashboardRangeId,
} from "../utils/dashboardCatalog";
import { ChartPickerAlternatives, ChartPickerChoices } from "./ChartPickerSections";
import {
  defaultPickerTab,
  isPickerSelectionAvailable,
  type PickerSelection,
  type PickerSuggestion,
} from "../utils/pickerSelection";

interface Props {
  mode: "add" | "replace";
  reportType: ReportType;
  granularity: TimeGranularity;
  hasMultipleEntries: boolean;
  hasAgentData: boolean;
  hasModelData: boolean;
  hasMultipleSources: boolean;
  charts: DashboardChartId[];
  addedCharts: ReadonlySet<DashboardChartId>;
  addedAnalysisAxes: ReadonlySet<AnalysisAxisId>;
  ranges: DashboardRangeId[];
  initialChart?: DashboardChartId;
  initialTab?: DashboardChartTabId;
  initialRange?: DashboardRangeId;
  initialChartGranularity?: TimeGranularity;
  onApply: (
    chart: DashboardChartId,
    range: DashboardRangeId,
    tab?: DashboardChartTabId,
    chartGranularity?: TimeGranularity,
  ) => void;
  onApplySuggestions: (selections: PickerSelection[]) => void;
  preview: (
    chart: DashboardChartId,
    range: DashboardRangeId,
    tab?: DashboardChartTabId,
    chartGranularity?: TimeGranularity,
  ) => ReactNode;
  onClose: () => void;
}

export function ChartPickerModal({
  mode,
  reportType,
  granularity,
  hasMultipleEntries,
  hasAgentData,
  hasModelData,
  hasMultipleSources,
  charts,
  addedCharts,
  addedAnalysisAxes,
  ranges,
  initialChart,
  initialTab,
  initialRange,
  initialChartGranularity,
  onApply,
  onApplySuggestions,
  onClose,
  preview,
}: Props) {
  const metadata = { reportType, hasModelData, hasAgentData, hasMultipleSources };
  const nextAnalysisAxis = ANALYSIS_AXIS_OPTIONS.find(
    ({ id }) => !addedAnalysisAxes.has(id) && isAnalysisAxisAvailable(id, metadata),
  )?.id;
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<PickerSelection>(() => {
    if (mode === "replace" && initialChart) {
      return {
        chart: initialChart,
        range: initialRange ?? ranges[0],
        tab: initialTab ?? defaultPickerTab(initialChart, metadata),
        chartGranularity: initialChart === "analysis" ? initialChartGranularity : undefined,
      };
    }
    const chart =
      nextAnalysisAxis && charts.includes("analysis")
        ? "analysis"
        : (charts.find((id) => id !== "analysis" && !addedCharts.has(id)) ?? charts[0]);
    return {
      chart,
      range: initialRange ?? ranges[0],
      tab: chart === "analysis" ? nextAnalysisAxis : defaultPickerTab(chart, metadata),
    };
  });
  const [suggestions, setSuggestions] = useState<PickerSuggestion[]>([]);
  const quickPicks: PickerSelection[] = charts
    .toSorted(
      (a, b) =>
        Number(a === "analysis" ? !nextAnalysisAxis : addedCharts.has(a)) -
        Number(b === "analysis" ? !nextAnalysisAxis : addedCharts.has(b)),
    )
    .slice(0, 4)
    .map((chart) => ({
      chart,
      tab:
        chart === "analysis"
          ? (nextAnalysisAxis ?? defaultPickerTab(chart, metadata))
          : defaultPickerTab(chart, metadata),
      range: "dashboard",
    }));
  const topSuggestion = suggestions[0];
  const selectionAvailable = isPickerSelectionAvailable(selection, charts, ranges, metadata);
  const rankedAvailable = suggestions.filter(
    (item, index) =>
      isPickerSelectionAvailable(item, charts, ranges, metadata) &&
      suggestions.findIndex(
        (candidate) => candidate.chart === item.chart && candidate.tab === item.tab,
      ) === index,
  );
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function suggest() {
    if (!prompt.trim() || loading || !charts.length) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSuggestions([]);
    setError("");
    setLoading(true);
    try {
      const response = await hc<AppType>(window.location.origin).api.charts.suggest.$post(
        {
          json: {
            prompt: prompt.trim(),
            reportType,
            granularity,
            hasMultipleEntries,
            hasAgentData,
            hasModelData,
            hasMultipleSources,
          },
        },
        { init: { signal: request.signal } },
      );
      const result = await response.json();
      if (!response.ok) {
        setError("error" in result ? result.error : "Jev could not suggest a chart.");
      } else if (
        "suggestions" in result &&
        Array.isArray(result.suggestions) &&
        result.suggestions.length > 0 &&
        result.suggestions.every(
          (item) =>
            DASHBOARD_CHART_OPTIONS.some(
              (option) => option.chart === item.chart && option.tab === item.tab,
            ) &&
            DASHBOARD_RANGES.some((itemRange) => itemRange.id === item.range) &&
            (item.chartGranularity === undefined ||
              (item.chart === "analysis" &&
                ANALYSIS_GRANULARITY_OPTIONS.some(({ id }) => id === item.chartGranularity))) &&
            typeof item.confidence === "number" &&
            Number.isFinite(item.confidence) &&
            item.confidence >= 0 &&
            item.confidence <= 1,
        )
      ) {
        setSuggestions(result.suggestions);
        const firstAvailable = result.suggestions.find((item) =>
          isPickerSelectionAvailable(item, charts, ranges, metadata),
        );
        if (firstAvailable) setSelection(firstAvailable);
      } else {
        setError("Jev returned an unknown chart, tab, or date range.");
      }
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Jev could not suggest a chart.");
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <header className="mb-5 pr-10">
          <DialogTitle ref={titleRef} tabIndex={-1} className="text-xl font-semibold">
            {mode === "add" ? "Add chart" : "Replace chart"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Describe the chart you want or choose from the charts and date ranges below.
          </DialogDescription>
        </header>

        <div className="min-h-0 space-y-6 overflow-y-auto pr-1">
          <div className="space-y-3">
            <textarea
              aria-label="Chart request"
              value={prompt}
              onChange={(event) => {
                controller.current?.abort();
                controller.current = null;
                setLoading(false);
                setPrompt(event.target.value);
                setSuggestions([]);
                setError("");
              }}
              rows={2}
              placeholder="Describe the chart you want…"
              className="w-full rounded-md border border-border bg-bg-secondary p-3 text-base text-text-primary placeholder:text-text-secondary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30"
            />
            <button
              type="button"
              onClick={suggest}
              disabled={!prompt.trim() || loading || !charts.length}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {loading ? "Suggesting…" : "Suggest"}
            </button>
            {error && (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            )}
            {topSuggestion && (
              <button
                type="button"
                disabled={!isPickerSelectionAvailable(topSuggestion, charts, ranges, metadata)}
                onClick={() =>
                  setSelection({
                    chart: topSuggestion.chart,
                    tab: topSuggestion.tab,
                    range: topSuggestion.range,
                    chartGranularity: topSuggestion.chartGranularity,
                  })
                }
                className="block text-left text-sm text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Top AI match:{" "}
                {
                  DASHBOARD_CHART_OPTIONS.find(
                    (item) => item.chart === topSuggestion.chart && item.tab === topSuggestion.tab,
                  )?.label
                }{" "}
                · {Math.round(topSuggestion.confidence * 100)}% confidence
                {!isPickerSelectionAvailable(topSuggestion, charts, ranges, metadata) &&
                  " · Unavailable in this view"}
              </button>
            )}
          </div>

          <ChartPickerChoices
            addedCharts={addedCharts}
            addedAnalysisAxes={addedAnalysisAxes}
            charts={charts}
            ranges={ranges}
            metadata={metadata}
            selection={selection}
            onSelect={setSelection}
            onApply={onApply}
            preview={preview}
          />
          <ChartPickerAlternatives
            title={
              suggestions.length
                ? "Other suggestions"
                : "Quick picks (fixed presets, not AI-ranked)"
            }
            picks={suggestions.length ? suggestions.slice(1) : quickPicks}
            addedCharts={addedCharts}
            addedAnalysisAxes={addedAnalysisAxes}
            selection={selection}
            charts={charts}
            ranges={ranges}
            metadata={metadata}
            onSelect={setSelection}
          />
        </div>

        <footer className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
          </DialogClose>
          {mode === "add" && rankedAvailable.length >= 2 && (
            <button
              type="button"
              onClick={() => onApplySuggestions(rankedAvailable)}
              className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Add suggested charts in order
            </button>
          )}
          <button
            type="submit"
            form="chart-picker-form"
            disabled={!selectionAvailable}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {mode === "add" ? "Add chart" : "Apply chart"}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
