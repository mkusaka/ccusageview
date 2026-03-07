import claudePricing from "../../assets/claude_pricing.json";
import codexPricing from "../../assets/codex_pricing.json";
import type { NormalizedEntry } from "./normalize";

// Per-million-token prices (USD)
export interface TokenPricing {
  input: number;
  output: number;
  cacheWrite: number; // 5-minute cache (1.25x input)
  cacheRead: number; // 0.1x input
}

interface RawTokenPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
}

const RAW_PRICING_DATA: ReadonlyMap<string, RawTokenPricing> = new Map(
  Object.entries({
    ...claudePricing,
    ...codexPricing,
  }).map(([name, pricing]) => [name.toLowerCase(), pricing as RawTokenPricing]),
);

const RAW_PRICING_ENTRIES = Array.from(RAW_PRICING_DATA.entries());

const PROVIDER_PREFIXES = ["anthropic/", "anthropic.", "openai/", "azure/", "openrouter/openai/"];

const MODEL_ALIASES: ReadonlyMap<string, string> = new Map([
  ["claude-opus-4.5", "claude-opus-4-5"],
  ["claude-sonnet-4.5", "claude-sonnet-4-5"],
  ["claude-haiku-4.5", "claude-haiku-4-5"],
  ["claude-opus-4", "claude-opus-4-20250514"],
  ["claude-opus-41", "claude-opus-4-1"],
  ["claude-sonnet-4", "claude-sonnet-4-20250514"],
  ["claude-3.5-sonnet", "claude-3-5-sonnet-latest"],
  ["claude-3.7-sonnet", "claude-3-7-sonnet-latest"],
  ["claude-3.7-sonnet-thought", "claude-3-7-sonnet-latest"],
  ["claude-haiku-3", "claude-3-haiku-20240307"],
  ["claude-sonnet-3", "claude-3-sonnet-20240229"],
  ["claude-opus-3", "claude-3-opus-20240229"],
  ["opus-4.5", "claude-opus-4-5"],
  ["sonnet-4.5", "claude-sonnet-4-5"],
  ["haiku-4.5", "claude-haiku-4-5"],
  ["opus-4-1-20250805", "claude-opus-4-1-20250805"],
  ["opus-4-5-20251101", "claude-opus-4-5-20251101"],
  ["opus-4-6", "claude-opus-4-6"],
  ["sonnet-4-5-20250929", "claude-sonnet-4-5-20250929"],
  ["opus-4-20250514", "claude-opus-4-20250514"],
  ["opus-4-5", "claude-opus-4-5"],
  ["haiku-4-5-20251001", "claude-haiku-4-5-20251001"],
  ["sonnet-4-20250514", "claude-sonnet-4-20250514"],
  ["sonnet-4-6", "claude-sonnet-4-6"],
  ["sonnet-4-5", "claude-sonnet-4-5"],
  ["haiku-3", "claude-3-haiku-20240307"],
  ["sonnet-3", "claude-3-sonnet-20240229"],
  ["opus-3", "claude-3-opus-20240229"],
  ["3-haiku", "claude-3-haiku-20240307"],
  ["3-sonnet", "claude-3-sonnet-20240229"],
  ["3-opus", "claude-3-opus-20240229"],
]);

function normalizeModelName(modelName: string): string {
  return modelName.trim().toLowerCase();
}

function swapClaudeV3Order(modelName: string): string {
  const withMinor = modelName.replace(
    /^(claude-)?(haiku|sonnet|opus)-3-(5|7)(.*)$/u,
    (_, prefix = "", family: string, minor: string, rest: string) =>
      `${prefix}3-${minor}-${family}${rest}`,
  );
  if (withMinor !== modelName) return withMinor;

  return modelName.replace(
    /^(claude-)?(haiku|sonnet|opus)-3(.*)$/u,
    (_, prefix = "", family: string, rest: string) => `${prefix}3-${family}${rest}`,
  );
}

function buildCandidateNames(modelName: string): string[] {
  const queue = [normalizeModelName(modelName)];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const alias = MODEL_ALIASES.get(current);
    if (alias) queue.push(alias);

    const swappedClaudeV3 = swapClaudeV3Order(current);
    if (swappedClaudeV3 !== current) queue.push(swappedClaudeV3);

    const normalizedAtDate = current.replace(/@(\d{8})$/u, "-$1");
    if (normalizedAtDate !== current) queue.push(normalizedAtDate);

    const withoutVersionSuffix = normalizedAtDate
      .replace(/-v\d+(?::\d+)?$/u, "")
      .replace(/:\d+$/u, "");
    if (withoutVersionSuffix !== normalizedAtDate) queue.push(withoutVersionSuffix);

    const withoutDateSuffix = withoutVersionSuffix.replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/u, "");
    if (withoutDateSuffix !== withoutVersionSuffix) {
      queue.push(withoutDateSuffix);
      if (/^claude-3(?:-[57])?-(haiku|sonnet|opus)$/u.test(withoutDateSuffix)) {
        queue.push(`${withoutDateSuffix}-latest`);
      }
    }

    const hasProviderPrefix = current.includes("/") || current.startsWith("anthropic.");
    if (!hasProviderPrefix) {
      for (const prefix of PROVIDER_PREFIXES) {
        if (!current.startsWith(prefix)) queue.push(`${prefix}${current}`);
      }
    }

    if (
      !hasProviderPrefix &&
      /^(haiku|sonnet|opus|3-)/u.test(current) &&
      !current.startsWith("claude-")
    ) {
      queue.push(`claude-${current}`);
    }
  }

  return Array.from(seen);
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function toTokenPricing(raw: RawTokenPricing): TokenPricing | null {
  if (raw.input_cost_per_token == null || raw.output_cost_per_token == null) {
    return null;
  }

  const input = roundPrice(raw.input_cost_per_token * 1_000_000);
  return {
    input,
    output: roundPrice(raw.output_cost_per_token * 1_000_000),
    cacheWrite: roundPrice(
      (raw.cache_creation_input_token_cost ?? raw.input_cost_per_token) * 1_000_000,
    ),
    cacheRead: roundPrice((raw.cache_read_input_token_cost ?? 0) * 1_000_000),
  };
}

export function getTokenPricing(modelName: string): TokenPricing | null {
  const candidates = buildCandidateNames(modelName);

  for (const candidate of candidates) {
    const pricing = RAW_PRICING_DATA.get(candidate);
    if (!pricing) continue;
    const converted = toTokenPricing(pricing);
    if (!converted) continue;
    return converted;
  }

  for (const candidate of candidates) {
    const fuzzyMatch = RAW_PRICING_ENTRIES.find(
      ([key]) => key.includes(candidate) || candidate.includes(key),
    );
    if (!fuzzyMatch) continue;
    const converted = toTokenPricing(fuzzyMatch[1]);
    if (!converted) continue;
    return converted;
  }

  return null;
}

export interface CostByTokenType {
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
}

// Calculate cost by token type for a single entry
export function calculateCostByTokenType(entry: NormalizedEntry): CostByTokenType | null {
  if (entry.modelBreakdowns && entry.modelBreakdowns.length > 0) {
    let inputCost = 0;
    let outputCost = 0;
    let cacheWriteCost = 0;
    let cacheReadCost = 0;
    let hasAnyPricing = false;

    for (const mb of entry.modelBreakdowns) {
      const pricing = getTokenPricing(mb.modelName);
      if (!pricing) continue;
      hasAnyPricing = true;
      inputCost += (mb.inputTokens * pricing.input) / 1_000_000;
      outputCost += (mb.outputTokens * pricing.output) / 1_000_000;
      cacheWriteCost += (mb.cacheCreationTokens * pricing.cacheWrite) / 1_000_000;
      cacheReadCost += (mb.cacheReadTokens * pricing.cacheRead) / 1_000_000;
    }

    return hasAnyPricing ? { inputCost, outputCost, cacheWriteCost, cacheReadCost } : null;
  }

  // No modelBreakdowns — try to use the single model from models array
  if (entry.models.length === 1) {
    const pricing = getTokenPricing(entry.models[0]);
    if (!pricing) return null;
    return {
      inputCost: (entry.inputTokens * pricing.input) / 1_000_000,
      outputCost: (entry.outputTokens * pricing.output) / 1_000_000,
      cacheWriteCost: (entry.cacheCreationTokens * pricing.cacheWrite) / 1_000_000,
      cacheReadCost: (entry.cacheReadTokens * pricing.cacheRead) / 1_000_000,
    };
  }

  return null;
}

// Build chart data for cost-by-token-type view
export function buildCostByTokenType(entries: NormalizedEntry[]): {
  label: string;
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
}[] {
  return entries.map((e) => {
    const costs = calculateCostByTokenType(e);
    return {
      label: e.label,
      inputCost: costs?.inputCost ?? 0,
      outputCost: costs?.outputCost ?? 0,
      cacheWriteCost: costs?.cacheWriteCost ?? 0,
      cacheReadCost: costs?.cacheReadCost ?? 0,
    };
  });
}
