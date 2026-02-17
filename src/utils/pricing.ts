import type { NormalizedEntry } from "./normalize";

// Per-million-token prices (USD)
export interface TokenPricing {
  input: number;
  output: number;
  cacheWrite: number; // 5-minute cache (1.25x input)
  cacheRead: number; // 0.1x input
}

// Model family key → pricing
// Keys are derived by stripping "claude-" prefix and "-YYYYMMDD" suffix from model names
const PRICING_MAP: ReadonlyMap<string, TokenPricing> = new Map([
  // Opus 4.6
  ["opus-4-6", { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }],
  // Opus 4.5
  ["opus-4-5", { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }],
  // Opus 4.1
  ["opus-4-1", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  // Opus 4
  ["opus-4", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  // Sonnet 4.5
  ["sonnet-4-5", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  // Sonnet 4
  ["sonnet-4", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  // Sonnet 3.7 (both naming conventions)
  ["sonnet-3-7", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ["3-7-sonnet", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  // Sonnet 3.5 (both naming conventions)
  ["sonnet-3-5", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ["3-5-sonnet", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  // Haiku 4.5
  ["haiku-4-5", { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }],
  // Haiku 3.5 (both naming conventions)
  ["haiku-3-5", { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 }],
  ["3-5-haiku", { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 }],
  // Opus 3 (both naming conventions)
  ["opus-3", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  ["3-opus", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  // Sonnet 3 (both naming conventions, deprecated)
  ["sonnet-3", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ["3-sonnet", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  // Haiku 3 (both naming conventions)
  ["haiku-3", { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 }],
  ["3-haiku", { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 }],
]);

// Extract the model family key from a full model name
// e.g. "claude-sonnet-4-5-20250929" → "sonnet-4-5"
function extractFamilyKey(modelName: string): string {
  const match = modelName.match(/^claude-(.+)-\d{8}$/);
  return match ? match[1] : modelName;
}

export function getTokenPricing(modelName: string): TokenPricing | null {
  const key = extractFamilyKey(modelName);
  return PRICING_MAP.get(key) ?? null;
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
export function buildCostByTokenType(
  entries: NormalizedEntry[],
): {
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
