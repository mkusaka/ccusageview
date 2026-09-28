import * as v from "valibot";

export const CHART_TIME_SCOPES = [
  "all",
  "today",
  "yesterday",
  "through_today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "last_365_days",
] as const;

export const CHART_GRANULARITIES = ["daily", "weekly", "monthly"] as const;
const METRICS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_tokens",
  "cache_read_tokens",
  "total_tokens",
  "cost",
  "unsupported",
] as const;
const DIMENSIONS = ["period", "model", "agent", "source"] as const;
const SERIES = ["none", "model", "agent", "source"] as const;

const CHART_CONSTRAINT = {
  type: "object",
  properties: {
    metric: { type: "string", enum: METRICS },
    x: { type: "string", enum: DIMENSIONS },
    series: { type: "string", enum: SERIES },
    time: { type: "string", enum: CHART_TIME_SCOPES },
    granularity: { type: "string", enum: CHART_GRANULARITIES },
    start_date: { type: "string" },
    end_date: { type: "string" },
    chart: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["line", "bar", "doughnut"] },
        title: { type: "string" },
        stacked: { type: "boolean" },
      },
      required: ["type", "title", "stacked"],
      additionalProperties: false,
    },
    reason: { type: "string" },
  },
  required: ["metric", "x", "series", "time", "granularity", "chart", "reason"],
  additionalProperties: false,
};

export const CHART_PLAN_CONSTRAINT = {
  type: "object",
  properties: {
    charts: { type: "array", minItems: 1, maxItems: 4, items: CHART_CONSTRAINT },
  },
  required: ["charts"],
  additionalProperties: false,
};

const CHART_SCHEMA = v.strictObject({
  metric: v.picklist(METRICS),
  x: v.picklist(DIMENSIONS),
  series: v.picklist(SERIES),
  time: v.picklist(CHART_TIME_SCOPES),
  granularity: v.picklist(CHART_GRANULARITIES),
  start_date: v.optional(v.string()),
  end_date: v.optional(v.string()),
  chart: v.strictObject({
    type: v.picklist(["line", "bar", "doughnut"]),
    title: v.pipe(v.string(), v.trim(), v.nonEmpty("Chart title is required.")),
    stacked: v.boolean(),
  }),
  reason: v.string(),
});

export const CHART_PLAN_SCHEMA = v.strictObject({
  charts: v.pipe(v.array(CHART_SCHEMA), v.minLength(1), v.maxLength(4)),
});
export type ChartPlan = v.InferOutput<typeof CHART_SCHEMA>;
export type ChartContext = {
  availableTables: readonly string[];
  reportTypes: readonly string[];
  granularities: readonly (typeof CHART_GRANULARITIES)[number][];
};
export type CompiledAiChart = {
  table: "entries" | "model_usage" | "agent_usage" | "agent_model_usage";
  metric: Exclude<ChartPlan["metric"], "unsupported">;
  x: ChartPlan["x"];
  series: ChartPlan["series"];
  granularity: ChartPlan["granularity"];
  start?: string;
  end?: string;
  chart: ChartPlan["chart"];
  subtitle: string;
};

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateBound(date: string | undefined): string | undefined {
  if (date === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date bounds must use YYYY-MM-DD.");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("The requested date is invalid.");
  }
  return date;
}

export function compileAiChartPlan(
  plan: ChartPlan,
  context: ChartContext,
  today: Date,
): CompiledAiChart {
  if (plan.metric === "unsupported") {
    throw new Error(
      plan.reason.trim() || "This chart request is not supported by the available data.",
    );
  }
  if (!context.availableTables.includes("entries")) throw new Error("No chart data is available.");
  if (plan.series !== "none" && plan.series === plan.x) {
    throw new Error("The chart x and series dimensions must be different.");
  }
  if (!context.granularities.includes(plan.granularity)) {
    throw new Error(`The requested ${plan.granularity} granularity is unavailable in this report.`);
  }
  if (plan.chart.type === "line" && plan.x !== "period") {
    throw new Error("Line charts require a time axis.");
  }
  if (
    plan.chart.type === "doughnut" &&
    (plan.x === "period" || plan.series !== "none" || plan.chart.stacked)
  ) {
    throw new Error(
      "Doughnut charts require a categorical axis without a series breakdown or stacking.",
    );
  }
  if (plan.chart.stacked && (plan.series === "none" || plan.chart.type === "line")) {
    throw new Error("Only bar charts with a series breakdown can be stacked.");
  }
  const model = plan.x === "model" || plan.series === "model";
  const agent = plan.x === "agent" || plan.series === "agent";
  const table =
    model && agent
      ? "agent_model_usage"
      : model
        ? "model_usage"
        : agent
          ? "agent_usage"
          : "entries";
  if (!context.availableTables.includes(table)) {
    throw new Error(
      `The requested ${model && agent ? "model and agent" : model ? "model" : "agent"} breakdown is unavailable in this report.`,
    );
  }

  let start = dateBound(plan.start_date);
  let end = dateBound(plan.end_date);
  if ((start || end) && plan.time !== "all") {
    throw new Error("Choose either an explicit date range or a named time scope.");
  }
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  let from: Date | undefined;
  let through = today;
  switch (plan.time) {
    case "all":
      break;
    case "today":
      from = today;
      break;
    case "yesterday":
      from = new Date(year, month, day - 1);
      through = from;
      break;
    case "through_today":
      end = localDate(today);
      break;
    case "this_week":
    case "last_week": {
      const monday = day - ((today.getDay() + 6) % 7);
      from = new Date(year, month, monday - (plan.time === "last_week" ? 7 : 0));
      if (plan.time === "last_week") through = new Date(year, month, monday - 1);
      break;
    }
    case "this_month":
      from = new Date(year, month, 1);
      break;
    case "last_month":
      from = new Date(year, month - 1, 1);
      through = new Date(year, month, 0);
      break;
    case "this_quarter":
      from = new Date(year, Math.floor(month / 3) * 3, 1);
      break;
    case "last_quarter": {
      const quarter = Math.floor(month / 3) * 3;
      from = new Date(year, quarter - 3, 1);
      through = new Date(year, quarter, 0);
      break;
    }
    case "this_year":
      from = new Date(year, 0, 1);
      break;
    case "last_year":
      from = new Date(year - 1, 0, 1);
      through = new Date(year - 1, 11, 31);
      break;
    case "last_7_days":
      from = new Date(year, month, day - 6);
      break;
    case "last_30_days":
      from = new Date(year, month, day - 29);
      break;
    case "last_90_days":
      from = new Date(year, month, day - 89);
      break;
    case "last_365_days":
      from = new Date(year, month, day - 364);
      break;
  }
  if (from) {
    start = localDate(from);
    end = localDate(through);
  }
  if (start && end && start > end) throw new Error("The date range begins after it ends.");
  if (
    (start || end) &&
    context.reportTypes.some((type) => type === "weekly" || type === "monthly")
  ) {
    throw new Error("Date filtering is unavailable for weekly or monthly aggregate reports.");
  }
  return {
    table,
    metric: plan.metric,
    x: plan.x,
    series: plan.series,
    granularity: plan.granularity,
    start,
    end,
    chart: plan.chart,
    subtitle: `${plan.granularity} · ${start || end ? `${start ?? "first date"} – ${end ?? "last date"}` : "all dates"}`,
  };
}
