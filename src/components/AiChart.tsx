import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "chart.js/auto";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import type { SourceInput } from "../utils/inputs";
import { buildAiChartData } from "../utils/aiChartData";
import {
  browserLanguageModel,
  generateAiCharts,
  MODEL_OPTIONS,
  type GeneratedChart,
  type PromptSession,
} from "../utils/aiChartGeneration";
import { useAiChartSuggestions } from "./useAiChartSuggestions";
import { getChartJsColor } from "./chartjs-utils";

interface Props {
  inputs: SourceInput[];
}

type GenerationState =
  | { status: "idle" }
  | { status: "loading"; attempt: number; lastError?: string }
  | { status: "ready"; charts: GeneratedChart[] }
  | { status: "error"; message: string };

export function AiChart({ inputs }: Props) {
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const busy = generation.status === "loading";
  const charts = generation.status === "ready" ? generation.charts : null;
  const error = generation.status === "error" ? generation.message : "";
  const data = useMemo(() => buildAiChartData(inputs), [inputs]);
  const {
    prompt,
    onPromptChange,
    selectSuggestion,
    availability,
    suggestions,
    download,
    setDownload,
    cancelSuggestions,
  } = useAiChartSuggestions(data.context, busy);
  const generationAbort = useRef<AbortController | null>(null);
  const runId = useRef(0);

  const invalidate = useCallback(() => {
    runId.current++;
    generationAbort.current?.abort();
    generationAbort.current = null;
    cancelSuggestions();
  }, [cancelSuggestions]);

  const stopGeneration = useCallback(() => {
    generationAbort.current?.abort();
    generationAbort.current = null;
    runId.current++;
    setDownload("");
    setGeneration({ status: "idle" });
  }, [setDownload]);

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
    const controller = new AbortController();
    generationAbort.current = controller;
    setGeneration({ status: "loading", attempt: 1 });
    setDownload("");
    // Start create() directly from the user gesture; a first-time model download requires it.
    try {
      const modelOptions = {
        ...MODEL_OPTIONS,
        signal: controller.signal,
        monitor(monitor: EventTarget) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (currentRun === runId.current) {
              setDownload(
                `Downloading local model: ${Math.round((event as ProgressEvent).loaded * 100)}%`,
              );
            }
          });
        },
      };
      let session: PromptSession | null = await model.create(modelOptions);
      let sessionNumber = 1;
      console.log("[AI chart] model session created", { run: currentRun, session: sessionNumber });
      try {
        controller.signal.throwIfAborted();
        const nextCharts = await generateAiCharts(session, prompt.trim(), data, {
          signal: controller.signal,
          onRetry(attempt, lastError) {
            if (currentRun === runId.current) {
              setGeneration({ status: "loading", attempt, lastError });
            }
          },
          async restartSession() {
            session?.destroy();
            console.log("[AI chart] model session destroyed", {
              run: currentRun,
              session: sessionNumber,
            });
            session = null;
            controller.signal.throwIfAborted();
            session = await model.create(modelOptions);
            sessionNumber++;
            console.log("[AI chart] model session created", {
              run: currentRun,
              session: sessionNumber,
            });
            return session;
          },
        });
        if (currentRun === runId.current) setGeneration({ status: "ready", charts: nextCharts });
      } finally {
        if (session) {
          session.destroy();
          console.log("[AI chart] model session destroyed", {
            run: currentRun,
            session: sessionNumber,
          });
        }
      }
    } catch (cause) {
      if (currentRun === runId.current) {
        console.error("[AI chart] generation failed", { run: currentRun, error: cause });
        setGeneration({
          status: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    } finally {
      if (generationAbort.current === controller) generationAbort.current = null;
      if (currentRun === runId.current) setDownload("");
    }
  }

  const model = browserLanguageModel();
  const canGenerate = !!model && availability !== "unavailable";

  return (
    <section
      className="bg-bg-card border border-border rounded-lg p-4 space-y-3"
      aria-label="Ask AI for charts"
    >
      <div>
        <h3 className="text-sm font-medium">Ask AI for charts</h3>
        <p className="text-xs text-text-secondary">
          Chrome's on-device AI selects charts from your request; your browser calculates them
          locally.
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
            Describe charts or an analysis
          </label>
          <input
            id="ai-chart-prompt"
            value={prompt}
            disabled={busy || availability === "checking"}
            onChange={(event) => {
              onPromptChange(event.target.value);
              setGeneration({ status: "idle" });
            }}
            placeholder="e.g. Show daily cost by model, then weekly tokens by agent for the last 30 days"
            className="flex-1 min-w-52 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="submit"
            disabled={
              !canGenerate ||
              busy ||
              (!!download && availability !== "available") ||
              !prompt.trim() ||
              availability === "checking"
            }
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate charts"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={stopGeneration}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-bg-secondary"
            >
              Stop generation
            </button>
          )}
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
      {generation.status === "loading" && generation.attempt > 1 && (
        <p role="status" className="text-xs text-text-secondary">
          Repairing chart (attempt {generation.attempt}): {generation.lastError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {charts && (
        <div className="space-y-4">
          {charts.map((chart, index) => (
            <ChartCard key={index} chart={chart} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChartCard({ chart }: { chart: GeneratedChart }) {
  const chartData = {
    labels: chart.labels,
    datasets: chart.datasets.map((series, index) => ({
      label: series.label,
      data: series.values,
      borderColor: getChartJsColor(index),
      backgroundColor:
        chart.type === "doughnut"
          ? chart.labels.map((_, labelIndex) => getChartJsColor(labelIndex))
          : getChartJsColor(index),
      tension: 0.2,
    })),
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: chart.stacked },
      y: { stacked: chart.stacked, beginAtZero: true },
    },
  };

  return (
    <article className="space-y-2 rounded-md border border-border p-3">
      <h4 className="text-sm font-medium">{chart.title}</h4>
      <p className="text-xs text-text-secondary">{chart.subtitle}</p>
      <div className="h-72" role="img" aria-label={chart.title}>
        {chart.type === "line" ? (
          <Line data={chartData} options={options} />
        ) : chart.type === "bar" ? (
          <Bar data={chartData} options={options} />
        ) : (
          <Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
        )}
      </div>
    </article>
  );
}
