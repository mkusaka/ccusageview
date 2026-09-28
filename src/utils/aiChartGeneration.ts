import * as v from "valibot";
import { AI_CHART_SCHEMA, type AiChartData, type EntryRow, type UsageRow } from "./aiChartData";
import {
  CHART_PLAN_CONSTRAINT,
  CHART_PLAN_SCHEMA,
  CHART_TIME_SCOPES,
  compileAiChartPlan,
  type ChartContext,
  type CompiledAiChart,
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
  properties: { suggestions: { type: "array", maxItems: 3, items: { type: "string" } } },
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
  context: ChartContext,
  signal?: AbortSignal,
): Promise<string[]> {
  const language = request.search(JAPANESE_CHARACTERS) === -1 ? "en" : "ja";
  const languageRule =
    language === "ja"
      ? "候補文はすべて自然な日本語で書いてください。英語の文にしないでください。"
      : "Write every suggestion in natural English, not Japanese.";
  const response = await session.prompt(
    `${languageRule}\nSuggest up to 3 distinct useful chart requests refining this user's intent: ${request}\n\n${AI_CHART_SCHEMA}\nReport types: ${context.reportTypes.join(", ")}. Available tables with data: ${context.availableTables.join(", ")}. Available granularities: ${context.granularities.join(", ")}. One request may ask for several charts in a specified order, mixing line, bar and categorical doughnut charts. Date ranges can specify inclusive YYYY-MM-DD bounds for daily-resolution reports. Never suggest a model, agent, or combined breakdown that is absent. Never suggest date filtering for weekly or monthly aggregate reports. Only suggest sums of available metrics by permitted dimensions and scopes (${CHART_TIME_SCOPES.join(", ")}); do not invent derived metrics, SQL or calculations. Return only JSON suggestions.`,
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
  if (!matching.length)
    throw new Error("The model could not provide chart suggestions in the input language.");
  return matching;
}

export interface GeneratedChart {
  type: "line" | "bar" | "doughnut";
  title: string;
  stacked: boolean;
  labels: string[];
  datasets: { label: string; values: (number | null)[] }[];
  subtitle: string;
}

function periodLabel(period: string, granularity: CompiledAiChart["granularity"]): string {
  if (granularity === "monthly") return period.slice(0, 7);
  const date = period.slice(0, 10);
  if (granularity === "daily" || period.length === 7) return date;
  const utc = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(utc.getTime())) throw new Error("The report contains an invalid period date.");
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

function label(
  dimension: CompiledAiChart["x"] | CompiledAiChart["series"],
  entry: EntryRow,
  row: UsageRow,
): string {
  switch (dimension) {
    case "source":
      return `${entry.source_label} (${entry.source_id})`;
    case "model":
      return "model" in row ? String(row.model) : "";
    case "agent":
      return "agent" in row ? String(row.agent) : "";
    default:
      return "";
  }
}

function aggregateChart(
  spec: CompiledAiChart,
  data: AiChartData,
  entries: Map<number, EntryRow>,
): GeneratedChart {
  const buckets = new Map<string, Map<string, number>>();
  const seriesNames = new Set<string>();
  let firstDate: string | undefined;
  let lastDate: string | undefined;
  for (const row of data.rows[spec.table]) {
    const entry = spec.table === "entries" ? (row as EntryRow) : entries.get(row.entry_id);
    if (!entry) continue;
    const date = entry.period.slice(0, 10);
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;
    if ((spec.start && date < spec.start) || (spec.end && date > spec.end)) continue;
    const axis =
      spec.x === "period" ? periodLabel(entry.period, spec.granularity) : label(spec.x, entry, row);
    const series = spec.series === "none" ? spec.chart.title : label(spec.series, entry, row);
    const metric = row[spec.metric];
    if (!Number.isFinite(metric)) throw new Error("The report contains a non-finite chart metric.");
    const values = buckets.get(axis) ?? new Map<string, number>();
    values.set(series, (values.get(series) ?? 0) + metric);
    buckets.set(axis, values);
    seriesNames.add(series);
    if (buckets.size > 120 || seriesNames.size > 20 || buckets.size * seriesNames.size > 1200) {
      throw new Error(
        "The requested chart has too many labels or series. Narrow the date range or breakdown.",
      );
    }
  }
  if (!buckets.size) {
    const coverage =
      firstDate && lastDate
        ? `Available dates: ${firstDate} to ${lastDate}.`
        : "No breakdown dates are available in this report.";
    throw new Error(`No chart rows match ${spec.subtitle}. ${coverage}`);
  }
  const labels = [...buckets.keys()].sort();
  return {
    ...spec.chart,
    subtitle: spec.subtitle,
    labels,
    datasets: [...seriesNames].sort().map((series) => ({
      label: series,
      values: labels.map((axis) => buckets.get(axis)?.get(series) ?? null),
    })),
  };
}

export async function generateAiCharts(
  session: PromptSession,
  request: string,
  data: AiChartData,
  options: {
    signal?: AbortSignal;
    onRetry?: (attempt: number, error: string) => void;
    restartSession?: () => Promise<PromptSession>;
  } = {},
): Promise<GeneratedChart[]> {
  let feedback = "";
  let attempt = 1;
  let consecutiveEmptyResponses = 0;
  const failedResponses = new Set<string>();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  while (true) {
    options.signal?.throwIfAborted();
    const response = await session.prompt(
      `Select 1 to 4 charts in exactly the requested order for: ${request}\nToday's local calendar date: ${today}.\n${AI_CHART_SCHEMA}\nAvailable tables with data: ${data.context.availableTables.join(", ")}. Report types: ${data.context.reportTypes.join(", ")}. Available granularities: ${data.context.granularities.join(", ")}. Return only JSON {"charts":[...]} with each chart specifying metric (input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost, unsupported), x (period, model, agent, source), series (none, model, agent, source), time (${CHART_TIME_SCOPES.join(", ")}), granularity (daily, weekly, monthly), optional start_date/end_date (inclusive YYYY-MM-DD with time all), chart (type line, bar, or doughnut; title; stacked), and reason (only for unsupported, otherwise empty). If the user's request cannot be represented by these sums and breakdowns, select unsupported and explain why; never substitute a different metric or analysis. Do not invent unavailable breakdowns. Model+agent requires agent_model_usage. x and series must differ. Line needs period x; doughnut needs categorical x and no series or stacking. Only bar with series can be stacked. For 今月 / this month choose this_month; week starts Monday; current scopes end today. Weekly/monthly source reports cannot filter dates or be subdivided. Never generate code or SQL. ${feedback}`,
      { responseConstraint: CHART_PLAN_CONSTRAINT, signal: options.signal },
    );
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
      options.onRetry?.(++attempt, "Empty model response; restarting the model session.");
      options.signal?.throwIfAborted();
      session = await options.restartSession();
      continue;
    }
    consecutiveEmptyResponses = 0;
    let plans: v.InferOutput<typeof CHART_PLAN_SCHEMA>;
    try {
      plans = v.parse(CHART_PLAN_SCHEMA, JSON.parse(response));
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
      feedback = `The previous JSON chart plan was invalid: ${message}. Return a valid plan without changing the request.`;
      options.onRetry?.(++attempt, message);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      continue;
    }
    const specs = plans.charts.map((plan) => compileAiChartPlan(plan, data.context, now));
    const entries = new Map<number, EntryRow>();
    if (specs.some((spec) => spec.table !== "entries")) {
      for (const entry of data.rows.entries) entries.set(entry.entry_id, entry);
    }
    const result = specs.map((spec) => aggregateChart(spec, data, entries));
    options.signal?.throwIfAborted();
    return result;
  }
}
