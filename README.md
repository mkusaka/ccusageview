# ccusageview

A web dashboard and CLI tool for visualizing [ccusage](https://github.com/ryoppippi/ccusage) JSON reports — tokens, costs, and model/provider breakdown at a glance.

**Live:** https://ccusageview.polyfill.workers.dev/

## Features

- **Interactive dashboard** — cost chart, token chart, model/provider/agent breakdown, activity heatmap, and data table (including per-agent rows for `ccusage --by-agent`)
- **Token Breakdown** — breakdown views start with **Total** tokens; choose Input, Output, Cache Write, or Cache Read to change the metric. **Stack** combines every visible model/provider/agent and token type into one bar per time bucket; **%** shows each segment's share of that bar.
- **Compare agents for a model** — in Cost Over Time, Token Breakdown, Cache Efficiency, or Breakdown, choose **By Agent** and pick a model from the adjacent **Model** menu. Requires per-agent `modelBreakdowns`; **All models** shows agent totals.
- **Multiple report types** — daily, weekly, monthly, hourly, session, and blocks
- **Multi-source comparison** — load multiple JSON files with labels and toggle them on/off
- **Shareable URLs** — data is compressed into the URL hash, or use short URLs via `/s/:id`
- **Copy as image** — export individual charts or the entire dashboard to clipboard
- **Dark mode** — respects system preference, toggleable
- **Modular charts** — add, replace, remove, and reorder predefined dashboard charts; optional AI suggestions rank fixed chart recipes and choose per-card dates

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

Use the dividers below and between charts to add a predefined chart, tab, and date range; controls inside a chart move, replace, or remove it. The default dashboard stays unchanged. **Dashboard range** follows the main range slider; other ranges apply only to the selected chart.

On mobile, the add/replace dialog stays within the screen, with chart and date-range choices stacked vertically.

Choose **Share stats → Tiles** or **Compact** for a mobile-friendly sharing card with prominent usage numbers and agent costs (provider costs when agent data is absent). This module is opt-in and is not included in the default dashboard. Its image-copy button captures only the card, without dashboard controls; Markdown export is also available. Tiles uses a portrait layout and Compact uses an aligned summary that fits square sharing images, expanding when necessary to keep every breakdown visible.

Share stats follows the selected card range and uses original report entries even when the dashboard is grouped weekly or monthly. Daily/hourly reports show active days (days with tokens or cost) over the inclusive calendar span and average cost over that span, including missing days. Other reports show entry count and average cost per entry instead. Reported breakdown costs are preserved; if their sum differs from the usage total, the card labels that difference rather than showing misleading percentages.

For **Activity**, choose **Cost**, **Total Tokens**, **Input**, **Output**, **Cache Write**, or **Cache Read** in the chart picker. The original Activity card still starts on Cost. A request such as “ことしのtokenアクティビティ” can select the Total Tokens heatmap and This year range together.

Choose **Presentation** in the add/replace dialog to change how an eligible chart is drawn. Time-series cost and token breakdowns support independent lines, stacked lines, filled stacked areas, side-by-side bars, and stacked bars; single-metric time series offer lines or bars. Token mix by model, agent, or source offers stacked or side-by-side horizontal bars. Cost-per-million and cache-rate breakdowns are ratios, so they cannot be stacked; unordered model/agent/source categories do not offer lines. **Default** retains each chart's existing appearance.

Choose **Analysis** for additional, deterministic axes: input/output/cache token mix by model, agent, or source; cost per million tokens by model, agent, source, or time; and cache-read rate by model or agent. Token mix defaults to stacked horizontal bars; ratios by category use horizontal bars; the time trend uses a line. Ratios are computed from summed costs and tokens (not averages of row ratios). Model, agent, and source axes require the corresponding data; source comparisons preserve each enabled input before the dashboard merges matching periods. For daily and hourly reports, an analysis chart can use its own hourly/daily/weekly/monthly granularity without changing the dashboard toggle.

In the add/replace dialog, enter a request such as “show model usage by agent as side-by-side bars” and select **Suggest**. A Cloudflare Worker asks [Jev](https://developers.cloudflare.com/ai/models/typesafe/jev/) to rank predefined chart/tab options and choose a date range, a compatible chart presentation, and, where applicable, a time granularity. The top available suggestion updates the selection and preview; other suggestions remain selectable. In **Add chart**, **Add suggested charts in order** inserts multiple available suggestions after the current chart in the AI-ranked order. Unavailable options cannot be applied. Jev cannot create charts, generate SQL, or change the data. Manual selection works without AI.

The browser sends the prompt, report type, displayed time granularity, and availability flags (multiple entries, model/agent data, multiple sources) to the Worker; it does **not** send chart or range option lists. Report contents and computed usage rows stay in the browser. Suggestions require a configured Workers AI binding **and AI Gateway credits on the Cloudflare account**. They are unavailable when serving the frontend with plain `pnpm dev`. Use `pnpm cf:dev` to test the Worker locally; Workers AI requests can incur charges even in local development.

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
