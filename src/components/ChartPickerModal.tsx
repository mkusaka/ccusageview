import { useEffect, useRef, useState, type ReactNode } from "react";
import { hc } from "hono/client";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import type { AppType } from "../worker";
import type { ReportType } from "../types";
import type { TimeGranularity } from "../utils/projection";
import {
  DASHBOARD_CHARTS,
  DASHBOARD_RANGES,
  type DashboardChartId,
  type DashboardRangeId,
} from "../utils/dashboardCatalog";

interface Props {
  mode: "add" | "replace";
  reportType: ReportType;
  granularity: TimeGranularity;
  hasMultipleEntries: boolean;
  charts: DashboardChartId[];
  ranges: DashboardRangeId[];
  initialChart?: DashboardChartId;
  initialRange?: DashboardRangeId;
  onApply: (chart: DashboardChartId, range: DashboardRangeId) => void;
  preview: (chart: DashboardChartId, range: DashboardRangeId) => ReactNode;
  onClose: () => void;
}

export function ChartPickerModal({
  mode,
  reportType,
  granularity,
  hasMultipleEntries,
  charts,
  ranges,
  initialChart,
  initialRange,
  onApply,
  onClose,
  preview,
}: Props) {
  const [chart, setChart] = useState<DashboardChartId>(initialChart ?? charts[0]);
  const [range, setRange] = useState<DashboardRangeId>(initialRange ?? ranges[0]);
  const [prompt, setPrompt] = useState("");
  const [suggestion, setSuggestion] = useState<{
    chart: DashboardChartId;
    range: DashboardRangeId;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function suggest() {
    if (!prompt.trim() || loading || !charts.length) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSuggestion(null);
    setError("");
    setLoading(true);
    try {
      const response = await hc<AppType>(window.location.origin).api.charts.suggest.$post(
        { json: { prompt: prompt.trim(), reportType, granularity, hasMultipleEntries } },
        { init: { signal: request.signal } },
      );
      const result = await response.json();
      if (!response.ok) {
        setError("error" in result ? result.error : "Jev could not suggest a chart.");
      } else if (
        "chart" in result &&
        "range" in result &&
        DASHBOARD_CHARTS.some((item) => item.id === result.chart) &&
        DASHBOARD_RANGES.some((item) => item.id === result.range)
      ) {
        setSuggestion({ chart: result.chart, range: result.range });
      } else {
        setError("Jev returned an unknown chart or date range.");
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
      <DialogContent>
        <header className="mb-5 pr-10">
          <DialogTitle className="text-xl font-semibold">
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
                setSuggestion(null);
                setError("");
              }}
              rows={2}
              placeholder="Describe the chart you want…"
              className="w-full rounded-md border border-border bg-bg-secondary p-3 text-base text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-accent"
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
            {suggestion && (
              <div className="space-y-4">
                <div
                  className="rounded-md border border-border bg-bg-secondary p-4 text-sm"
                  role="status"
                >
                  <p>
                    <span className="sr-only">Suggested chart and range: </span>
                    <strong>
                      {DASHBOARD_CHARTS.find((item) => item.id === suggestion.chart)?.label}
                    </strong>
                    {" · "}
                    <strong>
                      {DASHBOARD_RANGES.find((item) => item.id === suggestion.range)?.label}
                    </strong>
                  </p>
                  {charts.includes(suggestion.chart) && ranges.includes(suggestion.range) ? (
                    <button
                      type="button"
                      onClick={() => onApply(suggestion.chart, suggestion.range)}
                      className="mt-3 rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Apply suggestion
                    </button>
                  ) : (
                    <p className="mt-2 text-text-secondary">
                      This suggestion is unavailable for the current report or granularity.
                    </p>
                  )}
                </div>
                {charts.includes(suggestion.chart) && ranges.includes(suggestion.range) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Preview</h3>
                    <div className="rounded-lg border border-border">
                      {preview(suggestion.chart, suggestion.range)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            id="chart-picker-form"
            onSubmit={(event) => {
              event.preventDefault();
              onApply(chart, range);
            }}
            className="grid gap-5 border-t border-border pt-5 md:grid-cols-2"
          >
            <fieldset className="min-w-0">
              <legend className="text-sm font-semibold">Chart</legend>
              <div className="mt-2 space-y-2">
                {DASHBOARD_CHARTS.map((item) => {
                  const available = charts.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex gap-3 rounded-md border p-3 ${chart === item.id ? "border-accent bg-accent/10" : "border-border"} ${available ? "cursor-pointer hover:bg-bg-secondary" : "cursor-not-allowed opacity-50"}`}
                    >
                      <input
                        type="radio"
                        name="chart"
                        value={item.id}
                        checked={chart === item.id}
                        disabled={!available}
                        onChange={() => setChart(item.id)}
                        className="mt-0.5 size-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block text-xs text-text-secondary">
                          {item.description}
                        </span>
                        {!available && (
                          <span className="block text-xs text-text-secondary">
                            Unavailable for this report or granularity
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="text-sm font-semibold">Date range</legend>
              <div className="mt-2 space-y-2">
                {DASHBOARD_RANGES.map((item) => {
                  const available = ranges.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex gap-3 rounded-md border p-3 ${range === item.id ? "border-accent bg-accent/10" : "border-border"} ${available ? "cursor-pointer hover:bg-bg-secondary" : "cursor-not-allowed opacity-50"}`}
                    >
                      <input
                        type="radio"
                        name="range"
                        value={item.id}
                        checked={range === item.id}
                        disabled={!available}
                        onChange={() => setRange(item.id)}
                        className="mt-0.5 size-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block text-xs text-text-secondary">
                          {item.description}
                        </span>
                        {!available && (
                          <span className="block text-xs text-text-secondary">
                            Unavailable for this report type
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </form>
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
          <button
            type="submit"
            form="chart-picker-form"
            disabled={!charts.length}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {mode === "add" ? "Add chart" : "Apply chart"}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
