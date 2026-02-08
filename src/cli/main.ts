import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { encodePayload } from "../utils/compression.ts";

const DEFAULT_BASE_URL = "https://ccusageview.polyfill.workers.dev/";

export function buildViewerUrl(jsonInput: string, baseUrl: string): string {
  const encoded = encodePayload(jsonInput);
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/#data=${encoded}`;
}

interface LabeledInput {
  label: string;
  data: string;
}

export function buildPayload(labeled: LabeledInput[]): string {
  const hasAnyLabel = labeled.some((l) => l.label);

  if (labeled.length === 1 && !hasAnyLabel) {
    return labeled[0].data;
  }

  if (hasAnyLabel) {
    return JSON.stringify({
      sources: labeled.map((l) => ({
        label: l.label,
        data: JSON.parse(l.data),
      })),
    });
  }

  return JSON.stringify(labeled.map((l) => JSON.parse(l.data)));
}

function printUsage(): void {
  const text = `Usage: ccusage --json | ccusageview [options] [files...]

Arguments:
  files               One or more ccusage JSON files

Options:
  --url <base-url>    Base URL of ccusageview app
                      (default: ${DEFAULT_BASE_URL})
  --label <name>      Source label for a file (in order, repeatable)
  --stdin-label <name> Source label for stdin input
  --no-open           Print URL to stdout instead of opening browser
  --help              Show this help message

Examples:
  ccusage daily --json | ccusageview
  ccusageview daily.json
  ccusageview --label "Claude Code" --label "OpenCode" claude.json opencode.json`;
  console.log(text);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execSync(`open ${JSON.stringify(url)}`);
  } else if (platform === "win32") {
    execSync(`start "" ${JSON.stringify(url)}`);
  } else {
    execSync(`xdg-open ${JSON.stringify(url)}`);
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  const chunks: string[] = [];
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }
  return chunks.join("");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      url: { type: "string", default: DEFAULT_BASE_URL },
      "no-open": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      label: { type: "string", multiple: true },
      "stdin-label": { type: "string" },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const labeled: LabeledInput[] = [];
  const fileLabels = values.label ?? [];

  // Read stdin
  const stdinData = await readStdin();
  if (stdinData.trim()) {
    labeled.push({ label: values["stdin-label"] ?? "", data: stdinData });
  }

  // Read file arguments
  const fileReads = await Promise.all(positionals.map((f) => readFile(f, "utf-8")));
  for (let i = 0; i < fileReads.length; i++) {
    labeled.push({ label: fileLabels[i] ?? "", data: fileReads[i] });
  }

  if (labeled.length === 0) {
    console.error(
      "Error: No input received. Pipe JSON or pass file arguments:\n  ccusage daily --json | ccusageview\n  ccusageview daily.json",
    );
    process.exit(1);
  }

  let url: string;
  try {
    const payload = buildPayload(labeled);
    url = buildViewerUrl(payload, values.url!);
  } catch {
    console.error("Error: Invalid JSON input.");
    process.exit(1);
  }

  if (values["no-open"]) {
    console.log(url);
  } else {
    console.error(`Opening: ${url.slice(0, 80)}...`);
    openBrowser(url);
  }
}

main();
