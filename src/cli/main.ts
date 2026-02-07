import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { encodePayload } from "../utils/compression.ts";

const DEFAULT_BASE_URL = "https://mkusaka.github.io/ccusageview/";

export function buildViewerUrl(jsonInput: string, baseUrl: string): string {
  const encoded = encodePayload(jsonInput);
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/#data=${encoded}`;
}

function printUsage(): void {
  const text = `Usage: ccusage --json | ccusageview [options]

Options:
  --url <base-url>  Base URL of ccusageview app
                    (default: ${DEFAULT_BASE_URL})
  --no-open         Print URL to stdout instead of opening browser
  --help            Show this help message`;
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
  const { values } = parseArgs({
    options: {
      url: { type: "string", default: DEFAULT_BASE_URL },
      "no-open": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const input = await readStdin();
  if (!input.trim()) {
    console.error(
      "Error: No input received. Pipe JSON from ccusage:\n  ccusage daily --json | ccusageview",
    );
    process.exit(1);
  }

  let url: string;
  try {
    url = buildViewerUrl(input, values.url!);
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
