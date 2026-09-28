# ccusageview

A web dashboard and CLI tool for visualizing [ccusage](https://github.com/ryoppippi/ccusage) JSON reports — tokens, costs, and model/provider breakdown at a glance.

**Live:** https://ccusageview.polyfill.workers.dev/

## Features

- **Interactive dashboard** — cost chart, token chart, model/provider/agent breakdown, activity heatmap, and data table (including per-agent rows for `ccusage --by-agent`)
- **Token Breakdown** — breakdown views start with **Total** tokens; choose Input, Output, Cache Write, Cache Read, or Stack to change the metric.
- **Compare agents for a model** — in Cost Over Time, Token Breakdown, Cache Efficiency, or Breakdown, choose **By Agent** and pick a model from the adjacent **Model** menu. Requires per-agent `modelBreakdowns`; **All models** shows agent totals.
- **Multiple report types** — daily, weekly, monthly, hourly, session, and blocks
- **Multi-source comparison** — load multiple JSON files with labels and toggle them on/off
- **Shareable URLs** — data is compressed into the URL hash, or use short URLs via `/s/:id`
- **Copy as image** — export individual charts or the entire dashboard to clipboard
- **Dark mode** — respects system preference, toggleable
- **Ask AI for charts** — describe an analysis; Chrome's on-device model selects and orders predefined local charts without generating SQL or changing the default dashboard

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

### Ask AI for charts

Load a report, click **Ask AI for charts**, and describe the views you want. Chrome's on-device model suggests requests in the same language as your input (English or Japanese); suggestions are optional. You can generate charts while suggestions are loading, which cancels the pending suggestion request. The default dashboard is unchanged.

The model chooses **which charts to show and in what order**, not how to calculate them. The browser aggregates the supplied data locally using fixed metrics (input, output, cache write/read, total tokens, and cost) and axes (period, model, agent, or input source). Supported views include time-series line charts and bar charts, with categorical doughnut charts where appropriate. A second, different dimension can split a chart into series. Where the input supports it, the model can select daily, weekly, or monthly aggregation and choose an available time scope or a specific date range. Calendar weeks start Monday. Weekly/monthly aggregate reports cannot be split back into daily rows; unavailable breakdowns are not inferred.

Valibot validates the model's choices. Malformed responses may be retried with validation feedback; an empty response starts one fresh model session, while repeated invalid or empty responses stop. Click **Stop generation** to cancel. Unsupported combinations and ranges with no matching data are shown as errors rather than silently substituted with another view or period.

This requires a [Chrome environment with the Prompt API available](https://developer.chrome.com/docs/ai/prompt-api); the on-device model may need to download on first use. Usage rows stay in your browser instead of being sent to an AI service. The model can still choose the wrong **valid** selection: check the metric, axes, and displayed range before relying on a chart.

For diagnostics, filter DevTools Console for `[AI chart]`. Model responses can contain your request; redact them before sharing logs.

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


## License

MIT
