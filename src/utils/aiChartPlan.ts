import * as v from "valibot";

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
      enum: ["all", "today", "through_today", "last_7_days", "last_30_days"],
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
  time: v.picklist(["all", "today", "through_today", "last_7_days", "last_30_days"]),
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
    const end = localDate(today);
    const periodDay = "substr(e.period, 1, 10)";
    switch (plan.time) {
      case "today":
        filters.push(`${periodDay} = '${end}'`);
        break;
      case "through_today":
        filters.push(`${periodDay} <= '${end}'`);
        break;
      case "last_7_days":
      case "last_30_days": {
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        start.setDate(start.getDate() - (plan.time === "last_7_days" ? 6 : 29));
        filters.push(`${periodDay} >= '${localDate(start)}'`, `${periodDay} <= '${end}'`);
        break;
      }
      default:
        throw new Error("The requested chart time range is invalid.");
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
