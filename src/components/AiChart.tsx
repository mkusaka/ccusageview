import { useCallback, useEffect, useRef, useState } from "react";
import "chart.js/auto";
import { Bar, Line } from "react-chartjs-2";
import type { SourceInput } from "../utils/inputs";
import { createAiChartDatabase, type AiChartDatabase } from "../utils/aiChartDatabase";
import {
  browserLanguageModel,
  generateAiChart,
  MODEL_OPTIONS,
  type GeneratedChart,
} from "../utils/aiChartGeneration";
import { useAiChartSuggestions } from "./useAiChartSuggestions";
import { getChartJsColor } from "./chartjs-utils";

interface Props {
  inputs: SourceInput[];
}

type GenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; chart: GeneratedChart }
  | { status: "error"; message: string };

export function AiChart({ inputs }: Props) {
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const busy = generation.status === "loading";
  const chart = generation.status === "ready" ? generation.chart : null;
  const error = generation.status === "error" ? generation.message : "";
  const {
    prompt,
    onPromptChange,
    selectSuggestion,
    availability,
    suggestions,
    download,
    setDownload,
    cancelSuggestions,
  } = useAiChartSuggestions(inputs, busy);
  const database = useRef<Promise<AiChartDatabase> | null>(null);
  const runId = useRef(0);

  const closeDatabase = useCallback(() => {
    const pending = database.current;
    database.current = null;
    if (pending)
      void pending.then(
        (db) => db.close(),
        () => {},
      );
  }, []);

  const invalidate = useCallback(() => {
    runId.current++;
    closeDatabase();
    cancelSuggestions();
  }, [closeDatabase, cancelSuggestions]);

  useEffect(() => {
    setGeneration({ status: "idle" });
    return invalidate;
  }, [inputs, invalidate]);

  async function onGenerate() {
    if (!prompt.trim() || busy) return;
    const model = browserLanguageModel();
    if (!model) return;
    cancelSuggestions();
    const currentRun = ++runId.current;
    setGeneration({ status: "loading" });
    setDownload("");
    // Start create() directly from the user gesture; a first-time model download requires it.
    try {
      const session = await model.create({
        ...MODEL_OPTIONS,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (currentRun === runId.current) {
              setDownload(
                `Downloading local model: ${Math.round((event as ProgressEvent).loaded * 100)}%`,
              );
            }
          });
        },
      });
      try {
        if (!database.current) database.current = createAiChartDatabase(inputs);
        const db = await database.current;
        const nextChart = await generateAiChart(session, prompt.trim(), db.query);
        if (currentRun === runId.current) setGeneration({ status: "ready", chart: nextChart });
      } finally {
        session.destroy();
      }
    } catch (cause) {
      if (currentRun === runId.current) {
        setGeneration({
          status: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
        // An import error must not leave a rejected promise cached for the next attempt.
        closeDatabase();
      }
    } finally {
      if (currentRun === runId.current) setDownload("");
    }
  }

  const model = browserLanguageModel();
  const canGenerate = !!model && availability !== "unavailable";
  const chartData = chart && {
    labels: chart.labels,
    datasets: chart.datasets.map((series, index) => ({
      label: series.label,
      data: series.values,
      borderColor: getChartJsColor(index),
      backgroundColor: getChartJsColor(index),
      tension: 0.2,
    })),
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: chart?.stacked ?? false },
      y: { stacked: chart?.stacked ?? false, beginAtZero: true },
    },
  };

  return (
    <section
      className="bg-bg-card border border-border rounded-lg p-4 space-y-3"
      aria-label="Ask AI for a chart"
    >
      <div>
        <h3 className="text-sm font-medium">Ask AI for a chart</h3>
        <p className="text-xs text-text-secondary">
          Generate a chart from your local usage data with Chrome's on-device AI.
        </p>
      </div>
      {!model ? (
        <p className="text-sm text-text-secondary">
          This browser does not support window.LanguageModel.
        </p>
      ) : availability === "unavailable" ? (
        <p className="text-sm text-text-secondary">On-device AI is unavailable on this device.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onGenerate();
          }}
          className="flex flex-wrap gap-2"
        >
          <label htmlFor="ai-chart-prompt" className="sr-only">
            Describe a chart
          </label>
          <input
            id="ai-chart-prompt"
            value={prompt}
            disabled={busy || availability === "checking"}
            onChange={(event) => {
              onPromptChange(event.target.value);
              setGeneration({ status: "idle" });
            }}
            placeholder="e.g. Show weekly cost by model"
            className="flex-1 min-w-52 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="submit"
            disabled={
              !canGenerate || busy || !!download || !prompt.trim() || availability === "checking"
            }
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate chart"}
          </button>
        </form>
      )}
      {suggestions.status === "loading" && suggestions.prompt === prompt.trim() && (
        <p role="status" className="text-xs text-text-secondary">
          Finding chart suggestions…
        </p>
      )}
      {suggestions.status === "error" && suggestions.prompt === prompt.trim() && (
        <p role="alert" className="text-sm text-red-500">
          {suggestions.message}
        </p>
      )}
      {suggestions.status === "ready" && suggestions.prompt === prompt.trim() && (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">Suggested chart requests</p>
          {suggestions.items.length ? (
            <div className="flex flex-wrap gap-2" aria-label="Suggested chart requests">
              {suggestions.items.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    selectSuggestion(item);
                    setGeneration({ status: "idle" });
                  }}
                  className="rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:border-accent"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No suggestions for this request.</p>
          )}
        </div>
      )}
      {availability === "downloadable" && (
        <p className="text-xs text-text-secondary">The model will download on first use.</p>
      )}
      {download && (
        <p role="status" className="text-xs text-text-secondary">
          {download}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {chart && chartData && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{chart.title}</h4>
          <div className="h-72" role="img" aria-label={chart.title}>
            {chart.type === "line" ? (
              <Line data={chartData} options={options} />
            ) : (
              <Bar data={chartData} options={options} />
            )}
          </div>
          <details className="text-xs text-text-secondary">
            <summary className="cursor-pointer">Generated SQL</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{chart.sql}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
