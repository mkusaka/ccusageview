import * as v from "valibot";
import { AI_CHART_SCHEMA } from "./aiChartDatabase";
import {
  CHART_PLAN_CONSTRAINT,
  CHART_PLAN_SCHEMA,
  CHART_TIME_SCOPES,
  compileAiChartPlan,
  type CompiledAiChart,
  type ChartContext,
} from "./aiChartPlan";

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
    `${languageRule}\nSuggest up to 3 distinct, useful chart requests refining this user's intent: ${request}\n\n${AI_CHART_SCHEMA}\n\nCurrent report type: ${reportType}. Available tables with data: ${availableTables.join(", ")}. The optional series breakdown can be model, agent, or source, never the same as the axis. Combining model and agent requires agent_model_usage. Source means a distinct input source, not an arbitrary label. The only time scopes are ${CHART_TIME_SCOPES.join(", ")}. This week starts Monday; this week/month/quarter/year end today, last week/month/quarter/year mean the previous complete calendar period, and last N days include today. Do not suggest date filtering for weekly or monthly reports. Do not suggest comparisons, extrema, weekday breakdowns, averages, percentages, derived metrics, other filters, or analyses the available tables cannot represent. Suggestions must be natural-language requests, not SQL or explanations.`,
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

function chartFromRows(spec: CompiledAiChart, rows: Record<string, unknown>[]): GeneratedChart {
  const { sql, chart } = spec;
  const { type, title, series, stacked } = chart;
  if (!rows.length) throw new Error("The query returned no rows.");

  const xValues = new Map<string, Map<string, number>>();
  const seriesNames = new Set<string>();
  for (const row of rows) {
    const xValue = row.x;
    const yValue = row.y;
    const seriesValue = series ? row.series : title;
    if (
      (typeof xValue !== "string" && typeof xValue !== "number") ||
      (typeof yValue !== "number" && typeof yValue !== "bigint") ||
      !Number.isFinite(Number(yValue)) ||
      (typeof seriesValue !== "string" && typeof seriesValue !== "number")
    ) {
      throw new Error(
        `Expected x and ${series || "no series"} to be labels and y to be numeric. Available result columns: ${Object.keys(row).join(", ")}.`,
      );
    }
    const label = String(xValue);
    const seriesLabel = String(seriesValue);
    const values = xValues.get(label) ?? new Map<string, number>();
    if (values.has(seriesLabel)) {
      throw new Error("Chart data contains a duplicate x/series pair.");
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
  context: ChartContext,
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
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  while (true) {
    options.signal?.throwIfAborted();
    let response: string;
    try {
      response = await session.prompt(
        `Select a chart plan for this request: ${request}\nToday's local calendar date: ${today}.\nAvailable tables with data: ${context.availableTables.join(", ")}.\nReport types: ${context.reportTypes.join(", ")}.\nReturn only a JSON chart plan with metric (input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost, or unsupported), x (period, model, agent, or source), series (none, model, agent, or source), time (${CHART_TIME_SCOPES.join(", ")}), chart (type: line or bar, title: text, stacked: boolean), and reason (explain only when unsupported; otherwise empty string). For 今月 / this month choose this_month (first day of the current month through today), not today or through_today. This week starts Monday; this week/month/quarter/year end today, last week/month/quarter/year mean the previous complete calendar period, and last N days include today. Metrics are sums, not averages or percentages. Model and agent dimensions need populated breakdown tables; combining both needs agent_model_usage. Do not select the same x and series. Weekly and monthly reports cannot use date filtering. If the request cannot be faithfully expressed by these fields and available data, choose metric "unsupported" and explain why in reason. Do not invent a different analysis. Do not generate SQL or add any fields.${feedback ? `\n\n${feedback}` : ""}`,
        { responseConstraint: CHART_PLAN_CONSTRAINT, signal: options.signal },
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
        throw new Error(
          consecutiveEmptyResponses
            ? "The on-device model returned an empty response in two sessions. Try a simpler chart request."
            : "The on-device model returned an empty response. Try generating again.",
        );
      }
      consecutiveEmptyResponses++;
      console.warn("[AI chart] restarting model session after empty output", { attempt });
      options.onRetry?.(++attempt, "Empty model response; restarting the model session.");
      options.signal?.throwIfAborted();
      session = await options.restartSession();
      continue;
    }
    consecutiveEmptyResponses = 0;
    let plan;
    try {
      plan = v.parse(CHART_PLAN_SCHEMA, JSON.parse(response));
    } catch (error) {
      options.signal?.throwIfAborted();
      const message =
        error instanceof v.ValiError
          ? v.summarize(error.issues)
          : error instanceof Error
            ? error.message
            : String(error);
      if (failedResponses.has(response)) {
        throw new Error(`The on-device model repeated an invalid chart plan: ${message}`);
      }
      failedResponses.add(response);
      console.warn("[AI chart] invalid chart plan", { attempt, error: message });
      feedback = `The previous JSON chart plan was invalid: ${message}. Return a valid chart plan without changing the user's request. Never generate SQL.`;
      options.onRetry?.(++attempt, message);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      continue;
    }
    console.log("[AI chart] selected plan", plan);
    const spec = compileAiChartPlan(plan, context, now);
    console.log(`[AI chart] compiled SQL (attempt ${attempt}):\n${spec.sql}`);
    const rows = await query(spec.sql);
    options.signal?.throwIfAborted();
    if (!rows.length) {
      const coverage = await query(
        `SELECT MIN(substr(e.period, 1, 10)) AS first, MAX(substr(e.period, 1, 10)) AS last\nFROM ${spec.from}`,
      );
      options.signal?.throwIfAborted();
      const model = plan.x === "model" || plan.series === "model";
      const agent = plan.x === "agent" || plan.series === "agent";
      const breakdown = model
        ? agent
          ? "model/agent breakdown"
          : "model breakdown"
        : agent
          ? "agent breakdown"
          : "usage";
      const scope = {
        all: "all dates",
        today: `today (${today})`,
        through_today: `through today (${today})`,
        last_7_days: `the last 7 days (through ${today})`,
        last_30_days: `the last 30 days (through ${today})`,
        yesterday: "yesterday",
        this_week: "this week (through today)",
        last_week: "last week",
        this_month: "this month (through today)",
        last_month: "last month",
        this_quarter: "this quarter (through today)",
        last_quarter: "last quarter",
        this_year: "this year (through today)",
        last_year: "last year",
        last_90_days: "the last 90 days (through today)",
        last_365_days: "the last 365 days (through today)",
      }[plan.time];
      const first = coverage[0]?.first;
      const last = coverage[0]?.last;
      throw new Error(
        `No ${breakdown} rows match ${scope}. ${
          typeof first === "string" && typeof last === "string"
            ? `Available ${breakdown} dates: ${first} to ${last}.`
            : `No ${breakdown} dates are available in this report.`
        }`,
      );
    }
    return chartFromRows(spec, rows);
  }
}
