import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceInput } from "../utils/inputs";
import { buildAiChartRows } from "../utils/aiChartDatabase";
import {
  browserLanguageModel,
  MODEL_OPTIONS,
  suggestAiChartPrompts,
} from "../utils/aiChartGeneration";

type SuggestionState =
  | { status: "idle" }
  | { status: "loading"; prompt: string }
  | { status: "ready"; prompt: string; items: string[] }
  | { status: "error"; prompt: string; message: string };

type Availability = "checking" | "available" | "downloadable" | "downloading" | "unavailable";

export function useAiChartSuggestions(inputs: SourceInput[], busy: boolean) {
  const [prompt, setPrompt] = useState("");
  const [availability, setAvailability] = useState<Availability>("checking");
  const [suggestions, setSuggestions] = useState<SuggestionState>({ status: "idle" });
  const [download, setDownload] = useState("");
  const suggestionAbort = useRef<AbortController | null>(null);
  const modelDownload = useRef<AbortController | null>(null);
  const lastSuggested = useRef("");
  const lastInputs = useRef(inputs);
  const schema = useMemo(() => {
    const tables = buildAiChartRows(inputs);
    return {
      availableTables: Object.entries(tables)
        .filter(([, rows]) => rows.length > 0)
        .map(([name]) => name),
      reportType: String(tables.entries[0]?.report_type ?? "unknown"),
    };
  }, [inputs]);

  const cancelSuggestions = useCallback(() => {
    suggestionAbort.current?.abort();
    suggestionAbort.current = null;
    setSuggestions({ status: "idle" });
  }, []);

  const cancelModelDownload = useCallback(() => {
    modelDownload.current?.abort();
    modelDownload.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    const model = browserLanguageModel();
    if (!model) return;
    void model.availability(MODEL_OPTIONS).then(
      (status) => {
        if (active) setAvailability(status);
      },
      () => {
        if (active) setAvailability("unavailable");
      },
    );
    return () => {
      active = false;
      cancelModelDownload();
    };
  }, [cancelModelDownload]);

  const requestSuggestions = useCallback(
    async (text: string) => {
      const model = browserLanguageModel();
      if (!model) return;
      cancelSuggestions();
      const controller = new AbortController();
      suggestionAbort.current = controller;
      setSuggestions({ status: "loading", prompt: text });
      try {
        const session = await model.create({
          ...MODEL_OPTIONS,
          signal: controller.signal,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (event) => {
              if (!controller.signal.aborted) {
                setDownload(
                  `Downloading local model: ${Math.round((event as ProgressEvent).loaded * 100)}%`,
                );
              }
            });
          },
        });
        try {
          const items = await suggestAiChartPrompts(
            session,
            text,
            schema.availableTables,
            schema.reportType,
            controller.signal,
          );
          if (!controller.signal.aborted) setSuggestions({ status: "ready", prompt: text, items });
        } finally {
          session.destroy();
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setSuggestions({
            status: "error",
            prompt: text,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      } finally {
        if (suggestionAbort.current === controller) {
          suggestionAbort.current = null;
          setDownload("");
        }
      }
    },
    [schema, cancelSuggestions],
  );

  useEffect(() => {
    const text = prompt.trim();
    if (lastInputs.current !== inputs) {
      lastInputs.current = inputs;
      lastSuggested.current = "";
    }
    if (!text || availability !== "available" || busy || lastSuggested.current === text) return;
    setSuggestions({ status: "loading", prompt: text });
    const timer = setTimeout(() => {
      lastSuggested.current = text;
      void requestSuggestions(text);
    }, 120);
    return () => {
      clearTimeout(timer);
      cancelSuggestions();
    };
  }, [prompt, availability, busy, inputs, requestSuggestions, cancelSuggestions]);

  function onPromptChange(value: string) {
    cancelSuggestions();
    lastSuggested.current = "";
    setPrompt(value);
    if (
      !value.trim() ||
      (availability !== "downloadable" && availability !== "downloading") ||
      modelDownload.current
    )
      return;
    const model = browserLanguageModel();
    if (!model) return;
    const controller = new AbortController();
    modelDownload.current = controller;
    setDownload("Preparing local model…");
    // Start a first-time model download from the input gesture, not a later effect.
    void model
      .create({
        ...MODEL_OPTIONS,
        signal: controller.signal,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (!controller.signal.aborted) {
              setDownload(
                `Downloading local model: ${Math.round((event as ProgressEvent).loaded * 100)}%`,
              );
            }
          });
        },
      })
      .then(
        (session) => {
          session.destroy();
          if (!controller.signal.aborted) setAvailability("available");
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) {
            setSuggestions({
              status: "error",
              prompt: value.trim(),
              message: cause instanceof Error ? cause.message : String(cause),
            });
          }
        },
      )
      .finally(() => {
        if (modelDownload.current === controller) {
          modelDownload.current = null;
          setDownload("");
        }
      });
  }

  function selectSuggestion(value: string) {
    cancelSuggestions();
    lastSuggested.current = value;
    setPrompt(value);
  }

  return {
    prompt,
    onPromptChange,
    selectSuggestion,
    availability,
    suggestions,
    download,
    setDownload,
    cancelSuggestions,
  };
}
