import type { ModelBreakdown } from "../types";
import type { NormalizedEntry } from "./normalize";

export type BreakdownMode = "model" | "provider";

export interface BreakdownMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export const OTHER_BREAKDOWN_KEY = "Other";

const BREAKDOWN_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "cacheReadTokens",
  "cost",
] as const satisfies ReadonlyArray<keyof BreakdownMetrics>;

const PROVIDER_ALIASES: ReadonlyArray<{ provider: string; aliases: readonly string[] }> = [
  { provider: "Anthropic", aliases: ["anthropic", "claude"] },
  { provider: "OpenAI", aliases: ["openai", "gpt", "o1", "o3", "o4", "codex", "chatgpt"] },
  { provider: "Google", aliases: ["google", "gemini"] },
  { provider: "xAI", aliases: ["xai", "grok"] },
  { provider: "Meta", aliases: ["meta", "llama"] },
  { provider: "Mistral", aliases: ["mistral", "ministral", "codestral", "pixtral"] },
  { provider: "DeepSeek", aliases: ["deepseek"] },
  { provider: "Cohere", aliases: ["cohere", "command"] },
  { provider: "Alibaba", aliases: ["alibaba", "qwen"] },
  { provider: "AWS", aliases: ["aws", "amazon", "bedrock", "nova"] },
  { provider: "Perplexity", aliases: ["perplexity", "sonar"] },
  { provider: "Moonshot", aliases: ["moonshot", "kimi"] },
  { provider: "Microsoft", aliases: ["microsoft", "phi"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenMatchesAlias(token: string, alias: string): boolean {
  if (token === alias) return true;
  return new RegExp(`^${escapeRegExp(alias)}(?:[-.0-9]|$)`).test(token);
}

function tokenizeModelName(modelName: string): string[] {
  return modelName.trim().toLowerCase().split(/[/:]/).filter(Boolean);
}

export function getProviderName(modelName: string): string {
  const tokens = tokenizeModelName(modelName);
  for (const { provider, aliases } of PROVIDER_ALIASES) {
    if (tokens.some((token) => aliases.some((alias) => tokenMatchesAlias(token, alias)))) {
      return provider;
    }
  }
  return "Unknown";
}

export function shortenModelName(name: string): string {
  const match = name.match(/^claude-(.+)-\d{8}$/);
  return match ? match[1] : name;
}

export function formatBreakdownLabel(key: string, mode: BreakdownMode): string {
  return mode === "model" ? shortenModelName(key) : key;
}

export function getBreakdownMetricValue(
  metrics: BreakdownMetrics,
  metric: keyof BreakdownMetrics | "totalTokens",
): number {
  if (metric === "totalTokens") {
    return (
      metrics.inputTokens +
      metrics.outputTokens +
      metrics.cacheCreationTokens +
      metrics.cacheReadTokens
    );
  }
  return metrics[metric];
}

function getBreakdownKey(modelName: string, mode: BreakdownMode): string {
  return mode === "model" ? modelName : getProviderName(modelName);
}

export function groupBreakdowns(
  breakdowns: ModelBreakdown[] | undefined,
  mode: BreakdownMode,
): Map<string, BreakdownMetrics> {
  const grouped = new Map<string, BreakdownMetrics>();

  if (!breakdowns || breakdowns.length === 0) {
    return grouped;
  }

  for (const breakdown of breakdowns) {
    const key = getBreakdownKey(breakdown.modelName, mode);
    const existing = grouped.get(key);
    if (existing) {
      for (const metric of BREAKDOWN_KEYS) {
        existing[metric] += breakdown[metric];
      }
      continue;
    }

    grouped.set(key, {
      inputTokens: breakdown.inputTokens,
      outputTokens: breakdown.outputTokens,
      cacheCreationTokens: breakdown.cacheCreationTokens,
      cacheReadTokens: breakdown.cacheReadTokens,
      cost: breakdown.cost,
    });
  }

  return grouped;
}

export function collectBreakdownKeys(entries: NormalizedEntry[], mode: BreakdownMode): string[] {
  const keys = new Set<string>();

  for (const entry of entries) {
    for (const key of groupBreakdowns(entry.modelBreakdowns, mode).keys()) {
      keys.add(key);
    }
  }

  return Array.from(keys).toSorted();
}
