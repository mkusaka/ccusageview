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
- **Ask AI for a chart** — describe a chart in natural language; Chrome's on-device model generates a local DuckDB query and a line or bar chart

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

Load a report, click **Ask AI for a chart**, then start typing a request. The on-device model suggests more specific chart requests based on the report type and available breakdown tables, using the same language as the request (English or Japanese). Select a suggestion to fill the prompt, then click **Generate chart**. The app imports normalized, source-aware usage rows into DuckDB-Wasm in your browser. `window.LanguageModel` generates a SQL query and a chart definition; the query runs locally, and you can inspect it under **Generated SQL**. Valibot validates the chart definition, and invalid JSON, schema, SQL, or chart-row results are returned to the model for correction until the chart succeeds or you click **Stop generation**. Model API failures are shown directly.

This requires a [Chrome environment with the Prompt API available](https://developer.chrome.com/docs/ai/prompt-api); the on-device model may need to download on first use. The AI panel shows an unavailable message in other environments. The model receives the schema, your request, and any query/validation errors; the usage rows stay in the browser rather than being sent to an AI service. AI-generated charts can still be misleading: check the SQL and aggregation grain before relying on their conclusions. Individual models and agents can only be charted when their breakdowns exist in the supplied report.

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
