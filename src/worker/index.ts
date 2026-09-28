import type { ReportType } from "../types";
import {
  DASHBOARD_CHARTS,
  DASHBOARD_RANGES,
  availableChartIds,
  availableRangeIds,
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
      const { prompt, reportType, granularity, hasMultipleEntries } = c.req.valid("json");
      const availableCharts = new Set(
        availableChartIds(reportType, granularity, hasMultipleEntries ? 2 : 1),
      );
      const availableRanges = new Set(availableRangeIds(reportType));
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
                "Choose the closest chart for the request. All charts are shown; prefer one marked available for this dashboard.",
              criteria: Object.fromEntries(
                DASHBOARD_CHARTS.map(({ id, label, description }) => [
                  id,
                  `${label}: ${description}${availableCharts.has(id) ? "" : " (unavailable in this dashboard)"}`,
                ]),
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
                choice: v.custom<(typeof DASHBOARD_CHARTS)[number]["id"]>(
                  (value) =>
                    typeof value === "string" && DASHBOARD_CHARTS.some(({ id }) => id === value),
                ),
              }),
              range: v.object({
                type: v.literal("choice"),
                choice: v.custom<(typeof DASHBOARD_RANGES)[number]["id"]>(
                  (value) =>
                    typeof value === "string" && DASHBOARD_RANGES.some(({ id }) => id === value),
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
      return c.json({
        chart: suggestion.output.result.answers.chart.choice,
        range: suggestion.output.result.answers.range.choice,
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
