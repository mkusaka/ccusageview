# ccusageview

A web dashboard and CLI tool for visualizing [ccusage](https://github.com/ryoppippi/ccusage) JSON reports — tokens, costs, and model/provider breakdown at a glance.

**Live:** https://ccusageview.polyfill.workers.dev/

## Features

- **Interactive dashboard** — cost chart, token chart, model/provider/agent breakdown, activity heatmap, and data table (including per-agent rows for `ccusage --by-agent`)
- **Compare agents for a model** — in Cost Over Time, Token Breakdown, Cache Efficiency, or Breakdown, choose **By Agent** and pick a model from the adjacent **Model** menu. Requires per-agent `modelBreakdowns`; **All models** shows agent totals.
- **Multiple report types** — daily, weekly, monthly, hourly, session, and blocks
- **Multi-source comparison** — load multiple JSON files with labels and toggle them on/off
- **Shareable URLs** — data is compressed into the URL hash, or use short URLs via `/s/:id`
- **Copy as image** — export individual charts or the entire dashboard to clipboard
- **Dark mode** — respects system preference, toggleable
- **Ask AI for a chart** — describe a chart in natural language; Chrome's on-device model selects a chart plan, and the browser builds a local DuckDB query for a line or bar chart

## Quick start

### Pipe from ccusage

```sh
npx ccusage daily --json | npx ccusageview
```

This compresses the JSON data into a URL and opens it in your browser.

### Hourly reports from ccost

```sh
ccost hourly --json | npx ccusageview
```

`ccost hourly --json` gives you hour-level granularity **with per-model breakdowns** (`modelBreakdowns`). ccusage's `blocks` report cannot do this — even with `--breakdown`, its JSON only lists `models: string[]`.

### Open a file

```sh
npx ccusageview daily.json
```

### Compare multiple sources

```sh
npx ccusageview --label "Claude Code" --label "OpenCode" claude.json opencode.json
```

### Paste JSON directly

Open https://ccusageview.polyfill.workers.dev/ and paste your ccusage JSON into the input area.

### Ask AI for a chart

Load a report, click **Ask AI for a chart**, and describe an analysis. Chrome's on-device model suggests requests in the same language as your input (English or Japanese); suggestions are optional. You can click **Generate chart** while suggestions are loading, which cancels the pending suggestion request.

The model selects a **chart plan**, not SQL. Supported plans sum `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `total_tokens`, or `cost` by period, model, agent, or input source, with an optional different series dimension. Available time scopes are all data, today, through today, last 7 days, and last 30 days. Weekly and monthly aggregate reports cannot use those date filters. The model is instructed to mark requests outside these metrics and dimensions (such as averages, percentiles, or arbitrary filters) as unsupported rather than choosing a different chart.

The browser compiles the plan into a DuckDB-Wasm `SELECT` query using the appropriate source-aware usage table. Model and agent breakdowns are only charted when the supplied report contains those rows; metrics are summed at the selected breakdown's grain, so joining cannot multiply entry totals. Date filters use the browser's local calendar date and the original report period; no model-generated SQL or external files are executed. A query returning more than 500 rows is rejected instead of silently truncated. Inspect the app-built query under **Generated SQL**.

Valibot validates the model's plan. Malformed responses may be retried with validation feedback; an empty response starts one fresh model session, while repeated invalid or empty responses stop. Click **Stop generation** to cancel. Unsupported plans, missing breakdowns, and DuckDB errors are shown rather than asking the model to rewrite SQL. If a valid query has no rows, the error shows the selected time scope and the dates actually available for that chart's breakdown; it does not substitute older data or another time range.

This requires a [Chrome environment with the Prompt API available](https://developer.chrome.com/docs/ai/prompt-api); the on-device model may need to download on first use. Usage rows stay in your browser instead of being sent to an AI service. The model can still choose the wrong **valid** plan: check the selected metric and dimensions against your request before relying on the chart.

For diagnostics, filter DevTools Console for `[AI chart]`. Logs show the model response, selected plan, session lifecycle, and the complete app-compiled SQL before execution. Responses or SQL may contain your request or usage data; redact them before sharing logs.

## CLI options

```
Usage: ccusage --json | ccusageview [options] [files...]

Arguments:
  files               One or more ccusage JSON files

Options:
  --url <base-url>    Base URL of ccusageview app
                      (default: https://ccusageview.polyfill.workers.dev/)
  --label <name>      Source label for a file (in order, repeatable)
  --stdin-label <name> Source label for stdin input
  --no-open           Print URL to stdout instead of opening browser
  --help              Show this help message
```

## Development

Requires Node.js >= 22 and pnpm.

```sh
pnpm install
pnpm dev          # Start Vite dev server
pnpm pricing:update # Refresh offline Claude/Codex pricing assets
pnpm test         # Run tests
pnpm lint         # Lint with oxlint
pnpm format       # Format with oxfmt
```

Pricing lookup data is sourced from `assets/claude_pricing.json` and `assets/codex_pricing.json`.
Run `pnpm pricing:update` to refresh those filtered LiteLLM datasets.

### Cloudflare Workers (local)

```sh
pnpm cf:dev       # Build frontend + start wrangler dev
```

### Deploy

```sh
pnpm cf:deploy    # Build frontend + deploy to Cloudflare Workers
```

The build compresses DuckDB's Wasm files into self-hosted `.wasm.gz` assets because
the uncompressed files exceed Cloudflare Workers' 25 MiB per-asset limit.
The browser decompresses only the selected DuckDB variant when opening an AI chart.

## License

MIT
