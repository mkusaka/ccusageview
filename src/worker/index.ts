import type { ReportType } from "../types";
import {
  ANALYSIS_GRANULARITY_OPTIONS,
  DASHBOARD_CHART_OPTIONS,
  DASHBOARD_RANGES,
  isAnalysisAxisAvailable,
  availableAnalysisGranularities,
  availableChartIds,
  availableRangeIds,
  type AnalysisAxisId,
} from "../utils/dashboardCatalog";
import type { TimeGranularity } from "../utils/projection";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { nanoid } from "nanoid";
import * as v from "valibot";

// Minimal types — no @cloudflare/workers-types needed
interface KVStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

type JevQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

const suggestionRequest = v.strictObject({
  prompt: v.pipe(
    v.string(),
    v.maxLength(2000),
    v.check((prompt) => prompt.trim().length > 0),
  ),
  reportType: v.picklist([
    "daily",
    "weekly",
    "monthly",
    "hourly",
    "session",
    "blocks",
  ] as const satisfies readonly ReportType[]),
  granularity: v.picklist([
    "hourly",
    "daily",
    "weekly",
    "monthly",
  ] as const satisfies readonly TimeGranularity[]),
  hasMultipleEntries: v.boolean(),
  hasAgentData: v.boolean(),
  hasModelData: v.boolean(),
  hasMultipleSources: v.boolean(),
});

type Bindings = {
  CCUSAGEVIEW_SHORT_URLS: KVStore;
  ASSETS: { fetch(request: Request): Promise<Response> };
  AI_SUGGEST_LIMIT: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  AI: {
    run(
      model: "typesafe/jev",
      input: { state: string; questions: Record<string, JevQuestion> },
    ): Promise<unknown>;
  };
};

// API routes — chained for RPC type inference
const api = new Hono<{ Bindings: Bindings }>()
  .post("/s", async (c) => {
    const body = await c.req.json<{ data?: unknown }>();
    if (!body.data || typeof body.data !== "string") {
      return c.json({ error: "data is required" }, 400);
    }
    const id = nanoid(10);
    await c.env.CCUSAGEVIEW_SHORT_URLS.put(id, body.data);
    return c.json({ id }, 201);
  })
  .post(
    "/charts/suggest",
    validator("json", (body, c) => {
      const request = v.safeParse(suggestionRequest, body);
      if (!request.success) {
        return c.json({ error: "Expected a prompt and valid report metadata" }, 400);
      }
      return request.output;
    }),
    async (c) => {
      const {
        prompt,
        reportType,
        granularity,
        hasMultipleEntries,
        hasAgentData,
        hasModelData,
        hasMultipleSources,
      } = c.req.valid("json");
      const metadata = { reportType, hasModelData, hasAgentData, hasMultipleSources };
      const availableCharts = new Set(
        availableChartIds(reportType, granularity, hasMultipleEntries ? 2 : 1, metadata),
      );
      const availableRanges = new Set(availableRangeIds(reportType));
      const availableGranularities = availableAnalysisGranularities(reportType);
      let result: unknown;
      try {
        const { success } = await c.env.AI_SUGGEST_LIMIT.limit({ key: "chart-suggest" });
        if (!success) {
          return c.json({ error: "Chart suggestions are temporarily rate limited" }, 429);
        }
        result = await c.env.AI.run("typesafe/jev", {
          state: prompt,
          questions: {
            chart: {
              type: "choice",
              instructions:
                "Choose the closest chart and tab for the request. For a daily activity calendar heatmap, choose Total Tokens for token activity and Cost only for cost activity; preserve specific input, output, or cache token metrics when requested. Distinguish time trends from shares of total usage, and models across all agents from models within each agent or harness. The analysis options offer token mix, effective cost per million tokens, and cache read rate by fixed dimensions. Prefer options marked available for this dashboard.",
              criteria: Object.fromEntries(
                DASHBOARD_CHART_OPTIONS.map(({ id, chart, tab, label, description }) => {
                  const available =
                    availableCharts.has(chart) &&
                    (chart === "analysis"
                      ? tab !== undefined &&
                        isAnalysisAxisAvailable(tab as AnalysisAxisId, metadata)
                      : (tab !== "agent" && tab !== "agentModel") || hasAgentData);
                  return [
                    id,
                    `${label}: ${description}${available ? "" : " (unavailable in this dashboard)"}`,
                  ];
                }),
              ),
            },
            range: {
              type: "choice",
              instructions:
                "Choose the closest date range for the request. Use dashboard when no range is specified; prefer an available range.",
              criteria: Object.fromEntries(
                DASHBOARD_RANGES.map(({ id, label, description }) => [
                  id,
                  `${label}: ${description}${availableRanges.has(id) ? "" : " (unavailable in this dashboard)"}`,
                ]),
              ),
            },
            granularity: {
              type: "choice",
              instructions:
                "Choose time grouping for an analysis chart only. Choose dashboard for other charts or when no grouping is requested. Prefer an available grouping for this report type.",
              criteria: Object.fromEntries(
                ANALYSIS_GRANULARITY_OPTIONS.map(({ id, label, description }) => [
                  id,
                  `${label}: ${description}${availableGranularities.includes(id) ? "" : " (unavailable in this dashboard)"}`,
                ]),
              ),
            },
          },
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message.includes("Insufficient AI Gateway credits")
            ? "Workers AI requires AI Gateway credits for Jev in this Cloudflare account."
            : "Chart suggestion provider failed";
        return c.json({ error: message }, 502);
      }

      const suggestion = v.safeParse(
        v.object({
          state: v.literal("Completed"),
          result: v.object({
            answers: v.object({
              chart: v.object({
                type: v.literal("choice"),
                choice: v.custom<string>(
                  (value) =>
                    typeof value === "string" &&
                    DASHBOARD_CHART_OPTIONS.some(({ id }) => id === value),
                ),
                confidence: v.optional(
                  v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
                ),
                probabilities: v.optional(
                  v.record(
                    v.custom<string>(
                      (value) =>
                        typeof value === "string" &&
                        DASHBOARD_CHART_OPTIONS.some(({ id }) => id === value),
                    ),
                    v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
                  ),
                ),
              }),
              range: v.object({
                type: v.literal("choice"),
                choice: v.custom<(typeof DASHBOARD_RANGES)[number]["id"]>(
                  (value) =>
                    typeof value === "string" && DASHBOARD_RANGES.some(({ id }) => id === value),
                ),
              }),
              granularity: v.object({
                type: v.literal("choice"),
                choice: v.custom<(typeof ANALYSIS_GRANULARITY_OPTIONS)[number]["id"]>(
                  (value) =>
                    typeof value === "string" &&
                    ANALYSIS_GRANULARITY_OPTIONS.some(({ id }) => id === value),
                ),
              }),
            }),
          }),
        }),
        result,
      );
      if (!suggestion.success) {
        return c.json({ error: "Chart suggestion provider returned invalid choices" }, 502);
      }
      const chartAnswer = suggestion.output.result.answers.chart;
      const ranked = chartAnswer.probabilities
        ? Object.entries(chartAnswer.probabilities)
            .filter(([, probability]) => probability > 0)
            .toSorted((a, b) => b[1] - a[1])
            .slice(0, 3)
        : chartAnswer.confidence === undefined
          ? []
          : [[chartAnswer.choice, chartAnswer.confidence] as const];
      if (!ranked.length) {
        return c.json({ error: "Chart suggestion provider returned invalid choices" }, 502);
      }
      return c.json({
        suggestions: ranked.map(([id, confidence]) => {
          const { chart, tab } = DASHBOARD_CHART_OPTIONS.find((option) => option.id === id)!;
          const chosenGranularity = suggestion.output.result.answers.granularity.choice;
          const item: {
            chart: typeof chart;
            tab: typeof tab;
            range: typeof suggestion.output.result.answers.range.choice;
            confidence: number;
            chartGranularity?: TimeGranularity;
          } = { chart, tab, range: suggestion.output.result.answers.range.choice, confidence };
          if (chart === "analysis" && chosenGranularity !== "dashboard") {
            item.chartGranularity = chosenGranularity;
          }
          return item;
        }),
      });
    },
  );

// Main app — mount API, then add non-RPC routes
const app = new Hono<{ Bindings: Bindings }>().route("/api", api);

// Short URL redirect (not part of RPC type)
app.get("/s/:id", async (c) => {
  const id = c.req.param("id");
  const data = await c.env.CCUSAGEVIEW_SHORT_URLS.get(id);
  if (!data) return c.notFound();
  return c.redirect(`/#data=${data}`);
});

// SPA fallback (not part of RPC type)
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
  }
  return res;
});

export type AppType = typeof app;
export default app;
