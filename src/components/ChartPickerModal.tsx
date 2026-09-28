import { useEffect, useRef, useState, type ReactNode } from "react";
import { hc } from "hono/client";
import type { AppType } from "../worker";
import {
  DASHBOARD_CHARTS,
  DASHBOARD_RANGES,
  type DashboardChartId,
  type DashboardRangeId,
} from "../utils/dashboardCatalog";

interface Props {
  mode: "add" | "replace";
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
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      controller.current?.abort();
      element?.close();
    };
  }, []);

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
        { json: { prompt: prompt.trim(), charts, ranges } },
        { init: { signal: request.signal } },
      );
      const result = await response.json();
      if (!response.ok) {
        setError("error" in result ? result.error : "Jev could not suggest a chart.");
      } else if (
        "chart" in result &&
        "range" in result &&
        charts.includes(result.chart) &&
        ranges.includes(result.range)
      ) {
        setSuggestion({ chart: result.chart, range: result.range });
      } else {
        setError("Jev returned a chart or range that is not available.");
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
    <dialog
      ref={dialog}
      aria-label={mode === "add" ? "Add chart" : "Replace chart"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-bg-card p-5 text-text-primary shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">{mode === "add" ? "Add chart" : "Replace chart"}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chart picker"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          Close
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(chart, range);
        }}
        className="space-y-4"
      >
        <label className="block text-sm font-medium">
          Chart
          <select
            value={chart}
            onChange={(event) => setChart(event.target.value as DashboardChartId)}
            className="mt-1 w-full rounded-md border border-border bg-bg-secondary p-2"
          >
            {DASHBOARD_CHARTS.filter((item) => charts.includes(item.id)).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {item.description}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Date range
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as DashboardRangeId)}
            className="mt-1 w-full rounded-md border border-border bg-bg-secondary p-2"
          >
            {DASHBOARD_RANGES.filter((item) => ranges.includes(item.id)).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {item.description}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={!charts.length}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mode === "add" ? "Add chart" : "Apply chart"}
        </button>
      </form>
      <div className="mt-5 border-t border-border pt-4 space-y-2">
        <label htmlFor="chart-suggestion" className="block text-sm font-medium">
          Ask Jev for a chart suggestion (optional)
        </label>
        <textarea
          id="chart-suggestion"
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
          placeholder="e.g. Show recent cost trends"
          className="w-full rounded-md border border-border bg-bg-secondary p-2 text-sm"
        />
        <button
          type="button"
          onClick={suggest}
          disabled={!prompt.trim() || loading || !charts.length}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? "Asking Jev…" : "Suggest"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {suggestion && (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3 text-sm" role="status">
              <p>
                Jev suggests:{" "}
                <strong>
                  {DASHBOARD_CHARTS.find((item) => item.id === suggestion.chart)?.label}
                </strong>{" "}
                ·{" "}
                <strong>
                  {DASHBOARD_RANGES.find((item) => item.id === suggestion.range)?.label}
                </strong>
              </p>
              <button
                type="button"
                onClick={() => onApply(suggestion.chart, suggestion.range)}
                className="mt-2 rounded-md bg-accent px-3 py-1.5 text-white"
              >
                Apply suggestion
              </button>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Suggested chart preview</h3>
              <div className="rounded-lg border border-border">
                {preview(suggestion.chart, suggestion.range)}
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
