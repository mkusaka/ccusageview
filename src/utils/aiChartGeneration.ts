import { AI_CHART_SCHEMA } from "./aiChartDatabase";

export interface PromptSession {
  prompt(
    input: string,
    options: { responseConstraint: object; signal?: AbortSignal },
  ): Promise<string>;
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

export async function suggestAiChartPrompts(
  session: PromptSession,
  request: string,
  availableTables: string[],
  reportType: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await session.prompt(
    `Suggest up to 3 specific, useful chart requests refining this user's intent: ${request}\n\n${AI_CHART_SCHEMA}\n\nCurrent report type: ${reportType}. Only these tables contain data: ${availableTables.join(", ")}. Do not suggest analyses using empty breakdown tables. Suggestions must be natural-language requests, not SQL or explanations, and use the same language as the user's request. Make each suggestion distinct and directly chartable with the available tables.`,
    { responseConstraint: SUGGESTION_CONSTRAINT, signal },
  );
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

export interface GeneratedChart {
  sql: string;
  type: "line" | "bar";
  title: string;
  stacked: boolean;
  labels: string[];
  datasets: { label: string; values: (number | null)[] }[];
}

function chartFromRows(spec: unknown, rows: Record<string, unknown>[]): GeneratedChart {
  if (!spec || typeof spec !== "object" || !("chart" in spec) || !("sql" in spec)) {
    throw new Error("The model did not return a chart and SQL query.");
  }
  const { sql, chart } = spec as Record<string, unknown>;
  if (typeof sql !== "string" || !chart || typeof chart !== "object") {
    throw new Error("Invalid chart definition.");
  }
  const { type, title, x, y, series, stacked } = chart as Record<string, unknown>;
  if (
    (type !== "line" && type !== "bar") ||
    typeof title !== "string" ||
    typeof x !== "string" ||
    typeof y !== "string" ||
    typeof series !== "string" ||
    typeof stacked !== "boolean" ||
    !title.trim() ||
    !x ||
    !y
  ) {
    throw new Error("Invalid chart type or field names.");
  }
  if (!rows.length) throw new Error("The query returned no rows.");

  const xValues = new Map<string, Map<string, number>>();
  const seriesNames = new Set<string>();
  for (const row of rows) {
    const xValue = row[x];
    const yValue = row[y];
    const seriesValue = series ? row[series] : title;
    if (
      (typeof xValue !== "string" && typeof xValue !== "number") ||
      (typeof yValue !== "number" && typeof yValue !== "bigint") ||
      !Number.isFinite(Number(yValue)) ||
      (typeof seriesValue !== "string" && typeof seriesValue !== "number")
    ) {
      throw new Error(
        `Expected x (${x}) and series (${series || "none"}) to be labels and y (${y}) to be numeric.`,
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
): Promise<GeneratedChart> {
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await session.prompt(
      `Create a chart answering this request: ${request}\n\n${AI_CHART_SCHEMA}\n\nChart specification: type is line or bar; x and y are the result column names; series is the result column name or an empty string for a single series; stacked is a boolean. Return only JSON. Use only SELECT queries, no external files or network.\n${feedback}`,
      { responseConstraint: CHART_CONSTRAINT },
    );
    let sql = "";
    try {
      const spec: unknown = JSON.parse(response);
      if (!spec || typeof spec !== "object" || !("sql" in spec) || typeof spec.sql !== "string") {
        throw new Error("Missing SQL query.");
      }
      sql = spec.sql;
      return chartFromRows(spec, await query(sql));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2)
        throw new Error(`Could not generate a chart: ${message}`, { cause: error });
      feedback = `Previous SQL: ${sql}\nPrevious output: ${response}\nError: ${message}\nFix the query or chart definition without changing the user's request.`;
    }
  }
  throw new Error("Could not generate a chart.");
}
