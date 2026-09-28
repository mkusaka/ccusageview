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
- **Modular charts** — add, replace, remove, and reorder predefined dashboard charts; optionally ask Workers AI for a chart and range suggestion

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

### Customize dashboard charts

Load a report and use **Add chart** to choose a predefined chart and date-range preset. Each chart also has an icon toolbar for moving, replacing, removing, or adding another chart **directly after it**; the toolbar labels appear on hover or keyboard focus. The dialog puts the request first, followed by **every chart and range from the start** in a scrollable list; options the current report or granularity cannot support remain visible but disabled. The initial dashboard layout is unchanged. **Dashboard range** follows the main range slider; other presets apply only to that chart.

In the add/replace dialog, enter a request such as “モデル別のコストの推移を見たい” and select **Suggest**. A Cloudflare Worker gives the [Jev model](https://developers.cloudflare.com/ai/models/typesafe/jev/) the **full chart and range catalog**, marking options unavailable in the current view, and asks it to select the closest chart and range. Available suggestions render with your report data in a scrollable preview before you apply them. Unavailable suggestions stay visible with an explanation and cannot be applied. Jev cannot create a new chart, generate SQL, or change the underlying data. Manual selection works without AI.

Only the prompt and IDs marking which fixed choices are usable in this view are sent to Cloudflare Workers AI (Jev is a third-party model); report contents and computed usage rows stay in the browser. Suggestions require a configured Workers AI binding **and AI Gateway credits on the Cloudflare account**. They are unavailable when serving the frontend with plain `pnpm dev`. Use `pnpm cf:dev` to test the Worker locally; Workers AI requests can incur charges even in local development.

If Jev returns `Insufficient AI Gateway credits`, open [Cloudflare AI Gateway](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway), check **Credits Available**, then use **Manage → Top-up credits**. The AI binding does not need the model page's **Generate API Token**. Purchasing credits incurs charges; if routing through a configured gateway, set that gateway's **Workers AI Billing** to **Unified billing**.

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

`wrangler.jsonc` enables Cloudflare Workers Observability, including logs and traces, for deployments. Inspect them in the Cloudflare dashboard after deployment.

### Deploy

```sh
pnpm cf:deploy    # Build frontend + deploy to Cloudflare Workers
```

## License

MIT
