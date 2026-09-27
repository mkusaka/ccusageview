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

export const CHART_PLAN_CONSTRAINT = {
  type: "object",
  properties: {
    metric: {
      type: "string",
      enum: [
        "input_tokens",
        "output_tokens",
        "cache_creation_tokens",
        "cache_read_tokens",
        "total_tokens",
        "cost",
        "unsupported",
      ],
    },
    x: { type: "string", enum: ["period", "model", "agent", "source"] },
    series: { type: "string", enum: ["none", "model", "agent", "source"] },
    time: {
      type: "string",
      enum: CHART_TIME_SCOPES,
    },
    chart: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["line", "bar"] },
        title: { type: "string" },
        stacked: { type: "boolean" },
      },
      required: ["type", "title", "stacked"],
      additionalProperties: false,
    },
    reason: { type: "string" },
  },
  required: ["metric", "x", "series", "time", "chart", "reason"],
  additionalProperties: false,
};

export const CHART_PLAN_SCHEMA = v.strictObject({
  metric: v.picklist([
    "input_tokens",
    "output_tokens",
    "cache_creation_tokens",
    "cache_read_tokens",
    "total_tokens",
    "cost",
    "unsupported",
  ]),
  x: v.picklist(["period", "model", "agent", "source"]),
  series: v.picklist(["none", "model", "agent", "source"]),
  time: v.picklist(CHART_TIME_SCOPES),
  chart: v.strictObject({
    type: v.picklist(["line", "bar"]),
    title: v.pipe(v.string(), v.trim(), v.nonEmpty("Chart title is required.")),
    stacked: v.boolean(),
  }),
  reason: v.string(),
});

export type ChartPlan = v.InferOutput<typeof CHART_PLAN_SCHEMA>;
export type ChartContext = { availableTables: readonly string[]; reportTypes: readonly string[] };
export type CompiledAiChart = {
  sql: string;
  from: string;
  chart: {
    type: "line" | "bar";
    title: string;
    x: "x";
    y: "y";
    series: "" | "series";
    stacked: boolean;
  };
};

function dimensionExpression(dimension: ChartPlan["x"]): string {
  switch (dimension) {
    case "period":
      return "e.period";
    case "model":
      return "u.model";
    case "agent":
      return "u.agent";
    case "source":
      return "e.source_label || ' (' || e.source_id || ')'";
    default:
      throw new Error("The requested chart dimension is invalid.");
  }
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  if (plan.series !== "none" && plan.series === plan.x) {
    throw new Error("The chart x and series dimensions must be different.");
  }
  if (!context.availableTables.includes("entries")) {
    throw new Error("No chart data is available.");
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

  let metric: string;
  switch (plan.metric) {
    case "input_tokens":
    case "output_tokens":
    case "cache_creation_tokens":
    case "cache_read_tokens":
    case "total_tokens":
    case "cost":
      metric = plan.metric;
      break;
    default:
      throw new Error("The requested chart metric is invalid.");
  }

  const filters: string[] = [];
  if (plan.time !== "all") {
    if (context.reportTypes.includes("weekly") || context.reportTypes.includes("monthly")) {
      throw new Error("Date filtering is unavailable for weekly or monthly aggregate reports.");
    }
    const periodDay = "substr(e.period, 1, 10)";
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    let start: Date | undefined;
    let finish = today;
    switch (plan.time) {
      case "today":
        start = today;
        break;
      case "yesterday":
        start = new Date(year, month, day - 1);
        finish = start;
        break;
      case "through_today":
        filters.push(`${periodDay} <= '${localDate(today)}'`);
        break;
      case "this_week":
      case "last_week": {
        const daysSinceMonday = (today.getDay() + 6) % 7;
        start = new Date(year, month, day - daysSinceMonday - (plan.time === "last_week" ? 7 : 0));
        if (plan.time === "last_week") finish = new Date(year, month, day - daysSinceMonday - 1);
        break;
      }
      case "this_month":
        start = new Date(year, month, 1);
        break;
      case "last_month":
        start = new Date(year, month - 1, 1);
        finish = new Date(year, month, 0);
        break;
      case "this_quarter":
        start = new Date(year, Math.floor(month / 3) * 3, 1);
        break;
      case "last_quarter": {
        const quarterMonth = Math.floor(month / 3) * 3;
        start = new Date(year, quarterMonth - 3, 1);
        finish = new Date(year, quarterMonth, 0);
        break;
      }
      case "this_year":
        start = new Date(year, 0, 1);
        break;
      case "last_year":
        start = new Date(year - 1, 0, 1);
        finish = new Date(year - 1, 11, 31);
        break;
      case "last_7_days":
      case "last_30_days":
      case "last_90_days":
      case "last_365_days":
        start = new Date(year, month, day);
        start.setDate(day - Number(plan.time.slice(5, -5)) + 1);
        break;
      default:
        throw new Error("The requested chart time range is invalid.");
    }
    if (start) {
      filters.push(
        `${periodDay} >= '${localDate(start)}'`,
        `${periodDay} <= '${localDate(finish)}'`,
      );
    }
  }

  const x = dimensionExpression(plan.x);
  const series = plan.series === "none" ? "" : dimensionExpression(plan.series);
  const from =
    table === "entries"
      ? "entries AS e"
      : `${table} AS u JOIN entries AS e ON u.entry_id = e.entry_id`;
  const sql = [
    `SELECT ${x} AS x, SUM(${table === "entries" ? "e" : "u"}.${metric}) AS y${series ? `, ${series} AS series` : ""}`,
    `FROM ${from}`,
    ...(filters.length ? [`WHERE ${filters.join(" AND ")}`] : []),
    `GROUP BY x${series ? ", series" : ""}`,
    `ORDER BY x${series ? ", series" : ""}`,
  ].join("\n");

  return {
    sql,
    from,
    chart: {
      type: plan.chart.type,
      title: plan.chart.title,
      x: "x",
      y: "y",
      series: series ? "series" : "",
      stacked: plan.chart.stacked,
    },
  };
}
