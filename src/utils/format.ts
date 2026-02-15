// Format a USD cost value
export function formatCost(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Format a large token count compactly (e.g. 45736126 -> "45.7M")
export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

// Format a date string for chart labels (e.g. "2025-07-07" -> "Jul 7")
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Format a month string (e.g. "2025-07" -> "Jul 2025")
export function formatMonth(monthStr: string): string {
  const d = new Date(monthStr + "-01T00:00:00");
  if (isNaN(d.getTime())) return monthStr;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Format a generic stat value with locale-aware commas and up to `decimals` fractional digits
export function formatStatValue(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "N/A";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// Format skewness with a directional label
export function formatSkewness(value: number): string {
  if (!Number.isFinite(value)) return "N/A";
  const label = Math.abs(value) < 0.1 ? "symmetric" : value > 0 ? "right-skewed" : "left-skewed";
  return `${value.toFixed(2)} (${label})`;
}
