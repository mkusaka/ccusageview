import * as v from "valibot";
import { AI_CHART_SCHEMA } from "./aiChartDatabase";

export interface PromptSession {
  prompt(
    input: string,
    options: { responseConstraint: object; signal?: AbortSignal },
  ): Promise<string>;
  readonly contextUsage?: number;
  readonly contextWindow?: number;
  destroy(): void;
}

type ModelOptions = {
  expectedInputs: { type: "text"; languages: string[] }[];
  expectedOutputs: { type: "text"; languages: string[] }[];
};

export interface BrowserLanguageModel {
  availability(
    options: ModelOptions,
  ): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(
    options: ModelOptions & { monitor: (monitor: EventTarget) => void; signal?: AbortSignal },
  ): Promise<PromptSession>;
}

export const MODEL_OPTIONS: ModelOptions = {
  expectedInputs: [{ type: "text", languages: ["en", "ja"] }],
  expectedOutputs: [{ type: "text", languages: ["en", "ja"] }],
};

export function browserLanguageModel(): BrowserLanguageModel | undefined {
  return (window as Window & { LanguageModel?: BrowserLanguageModel }).LanguageModel;
}

const CHART_CONSTRAINT = {
  type: "object",
  properties: {
    sql: { type: "string" },
    chart: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["line", "bar"] },
        title: { type: "string" },
        x: { type: "string" },
        y: { type: "string" },
        series: { type: "string" },
        stacked: { type: "boolean" },
      },
      required: ["type", "title", "x", "y", "series", "stacked"],
      additionalProperties: false,
    },
  },
  required: ["sql", "chart"],
  additionalProperties: false,
};
const CHART_SCHEMA = v.strictObject({
  sql: v.pipe(v.string(), v.trim(), v.nonEmpty("SQL query is required.")),
  chart: v.strictObject({
    type: v.picklist(["line", "bar"]),
    title: v.pipe(v.string(), v.trim(), v.nonEmpty("Chart title is required.")),
    x: v.pipe(v.string(), v.trim(), v.nonEmpty("Chart x column is required.")),
    y: v.pipe(v.string(), v.trim(), v.nonEmpty("Chart y column is required.")),
    series: v.string(),
    stacked: v.boolean(),
  }),
});

const SUGGESTION_CONSTRAINT = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

const JAPANESE_CHARACTERS = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu;

function matchesSuggestionLanguage(text: string, language: "ja" | "en"): boolean {
  const japanese = text.match(JAPANESE_CHARACTERS)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return language === "ja" ? japanese > latin : latin > japanese;
}

function parseSuggestions(response: string, request: string): string[] {
  const result: unknown = JSON.parse(response);
  if (
    !result ||
    typeof result !== "object" ||
    !("suggestions" in result) ||
    !Array.isArray(result.suggestions)
  ) {
    throw new Error("The model did not return chart suggestions.");
  }
  const suggestions = result.suggestions
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item && item !== request.trim());
  return [...new Set(suggestions)].slice(0, 3);
}

export async function suggestAiChartPrompts(
  session: PromptSession,
  request: string,
  availableTables: string[],
  reportType: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const language = request.search(JAPANESE_CHARACTERS) === -1 ? "en" : "ja";
  const languageRule =
    language === "ja"
      ? "候補文はすべて自然な日本語で書いてください。英語の文にしないでください。"
      : "Write every suggestion in natural English, not Japanese.";
  const response = await session.prompt(
    `${languageRule}\nSuggest up to 3 specific, useful chart requests refining this user's intent: ${request}\n\n${AI_CHART_SCHEMA}\n\nCurrent report type: ${reportType}. Only these tables contain data: ${availableTables.join(", ")}. Do not suggest analyses using empty breakdown tables. Suggestions must be natural-language requests, not SQL or explanations. Make each suggestion distinct and directly chartable with the available tables.`,
    { responseConstraint: SUGGESTION_CONSTRAINT, signal },
  );
  const suggestions = parseSuggestions(response, request);
  if (suggestions.every((item) => matchesSuggestionLanguage(item, language))) return suggestions;

  signal?.throwIfAborted();
  const rewritten = await session.prompt(
    `${languageRule}\nRewrite these chart requests in the language of the original request without changing their meaning. Original request: ${request}\nChart requests: ${JSON.stringify(suggestions)}\nReturn only JSON with the rewritten suggestions.`,
    { responseConstraint: SUGGESTION_CONSTRAINT, signal },
  );
  const matching = parseSuggestions(rewritten, request).filter((item) =>
    matchesSuggestionLanguage(item, language),
  );
  if (!matching.length) {
    throw new Error("The model could not provide chart suggestions in the input language.");
  }
  return matching;
}

export interface GeneratedChart {
  sql: string;
  type: "line" | "bar";
  title: string;
  stacked: boolean;
  labels: string[];
  datasets: { label: string; values: (number | null)[] }[];
}

function chartFromRows(
  spec: v.InferOutput<typeof CHART_SCHEMA>,
  rows: Record<string, unknown>[],
): GeneratedChart {
  const { sql, chart } = spec;
  const { type, title, x, y, series, stacked } = chart;
  if (!rows.length) throw new Error("The query returned no rows.");
  const firstRow = rows[0];
  const resultColumn = (requested: string, alias: string) => {
    if (Object.hasOwn(firstRow, requested)) return requested;
    const unqualified = /^[A-Za-z_]\w*\.([A-Za-z_]\w*)$/.exec(requested)?.[1];
    if (unqualified && Object.hasOwn(firstRow, unqualified)) return unqualified;
    return Object.hasOwn(firstRow, alias) ? alias : requested;
  };
  const xColumn = resultColumn(x, "x");
  const yColumn = resultColumn(y, "y");
  const seriesColumn = series ? resultColumn(series, "series") : "";

  const xValues = new Map<string, Map<string, number>>();
  const seriesNames = new Set<string>();
  for (const row of rows) {
    const xValue = row[xColumn];
    const yValue = row[yColumn];
    const seriesValue = series ? row[seriesColumn] : title;
    if (
      (typeof xValue !== "string" && typeof xValue !== "number") ||
      (typeof yValue !== "number" && typeof yValue !== "bigint") ||
      !Number.isFinite(Number(yValue)) ||
      (typeof seriesValue !== "string" && typeof seriesValue !== "number")
    ) {
      throw new Error(
        `Expected x (${x}) and series (${series || "none"}) to be labels and y (${y}) to be numeric. Available result columns: ${Object.keys(row).join(", ")}. Chart fields must name SQL result columns, not SQL expressions.`,
      );
    }
    const label = String(xValue);
    const seriesLabel = String(seriesValue);
    const values = xValues.get(label) ?? new Map<string, number>();
    if (values.has(seriesLabel)) {
      throw new Error("Duplicate x/series pair. Aggregate rows in SQL before charting.");
    }
    values.set(seriesLabel, Number(yValue));
    xValues.set(label, values);
    seriesNames.add(seriesLabel);
  }
  const labels = [...xValues.keys()];
  return {
    sql,
    type,
    title,
    stacked,
    labels,
    datasets: [...seriesNames].map((label) => ({
      label,
      values: labels.map((xLabel) => xValues.get(xLabel)?.get(label) ?? null),
    })),
  };
}

export async function generateAiChart(
  session: PromptSession,
  request: string,
  query: (sql: string) => Promise<Record<string, unknown>[]>,
  options: {
    signal?: AbortSignal;
    onRetry?: (attempt: number, error: string) => void;
    restartSession?: () => Promise<PromptSession>;
  } = {},
): Promise<GeneratedChart> {
  let feedback = "";
  let attempt = 1;
  let consecutiveEmptyResponses = 0;
  const failedResponses = new Set<string>();
  while (true) {
    options.signal?.throwIfAborted();
    // Prompt API failures cannot be repaired by changing SQL; surface them to the caller.
    let response: string;
    try {
      response = await session.prompt(
        `Create a chart answering this request: ${request}\n\n${AI_CHART_SCHEMA}\n\nReturn only one JSON object with sql (a single SELECT query) and chart (type: line or bar, title: text, x and y: names of result columns, series: result column name or "" for one series, stacked: boolean). Alias result columns as x, y, and optionally series. Use no external files or network.\n${feedback}`,
        { responseConstraint: CHART_CONSTRAINT, signal: options.signal },
      );
    } catch (error) {
      if (!options.signal?.aborted)
        console.error("[AI chart] model prompt failed", { attempt, error });
      throw error;
    }
    console.log("[AI chart] model response", {
      attempt,
      responseLength: response.length,
      response,
      contextUsage: session.contextUsage ?? null,
      contextWindow: session.contextWindow ?? null,
    });
    options.signal?.throwIfAborted();
    if (!response.trim()) {
      if (!options.restartSession || consecutiveEmptyResponses) {
        const error = new Error(
          consecutiveEmptyResponses
            ? "The on-device model returned an empty response in two sessions. Try a simpler chart request."
            : "The on-device model returned an empty response. Try generating again.",
        );
        console.error("[AI chart] model output stayed empty", { attempt, error });
        throw error;
      }
      consecutiveEmptyResponses++;
      console.warn("[AI chart] restarting model session after empty output", { attempt });
      options.onRetry?.(++attempt, "Empty model response; restarting the model session.");
      options.signal?.throwIfAborted();
      session = await options.restartSession();
      continue;
    }
    consecutiveEmptyResponses = 0;
    try {
      const spec = v.parse(CHART_SCHEMA, JSON.parse(response));
      const rows = await query(spec.sql);
      options.signal?.throwIfAborted();
      return chartFromRows(spec, rows);
    } catch (error) {
      options.signal?.throwIfAborted();
      const message =
        error instanceof v.ValiError
          ? v.summarize(error.issues)
          : error instanceof Error
            ? error.message
            : String(error);
      console.warn("[AI chart] repair needed", { attempt, error: message });
      if (failedResponses.has(response)) {
        throw new Error(`The on-device model repeated an invalid chart response: ${message}`);
      }
      failedResponses.add(response);
      const previousOutput = response.length > 4000 ? `${response.slice(0, 4000)}…` : response;
      feedback = `Previous output: ${previousOutput || "(empty)"}\nError: ${message}\nFix the JSON, SQL, or chart definition without changing the user's request.`;
      options.onRetry?.(++attempt, message);
      // Keep the Stop button responsive even if the model immediately repeats an invalid output.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}
