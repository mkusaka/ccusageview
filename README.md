# ccusageview

A web dashboard and CLI tool for visualizing [ccusage](https://github.com/anthropics/ccusage) JSON reports — tokens, costs, and model breakdown at a glance.

**Live:** https://ccusageview.polyfill.workers.dev/

## Features

- **Interactive dashboard** — cost chart, token chart, model breakdown, activity heatmap, and data table
- **Multiple report types** — daily, weekly, monthly, session, and blocks
- **Multi-source comparison** — load multiple JSON files with labels and toggle them on/off
- **Shareable URLs** — data is compressed into the URL hash, or use short URLs via `/s/:id`
- **Copy as image** — export individual charts or the entire dashboard to clipboard
- **Dark mode** — respects system preference, toggleable

## Quick start

### Pipe from ccusage

```sh
npx ccusage daily --json | npx ccusageview
```

This compresses the JSON data into a URL and opens it in your browser.

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
pnpm test         # Run tests
pnpm lint         # Lint with oxlint
pnpm format       # Format with oxfmt
```

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
