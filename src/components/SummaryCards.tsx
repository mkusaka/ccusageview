import type { NormalizedTotals } from "../utils/normalize";
import { formatCost, formatTokens } from "../utils/format";

interface Props {
  totals: NormalizedTotals;
  entryCount: number;
}

interface CardData {
  label: string;
  value: string;
  subLabel?: string;
}

export function SummaryCards({ totals, entryCount }: Props) {
  const cards: CardData[] = [
    { label: "Total Cost", value: formatCost(totals.totalCost) },
    { label: "Total Tokens", value: formatTokens(totals.totalTokens) },
    { label: "Input Tokens", value: formatTokens(totals.inputTokens) },
    { label: "Output Tokens", value: formatTokens(totals.outputTokens) },
    {
      label: "Cache Read",
      value: formatTokens(totals.cacheReadTokens),
    },
    { label: "Entries", value: entryCount.toLocaleString("en-US") },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-bg-card border border-border rounded-lg p-4"
        >
          <p className="text-xs text-text-secondary uppercase tracking-wide">
            {card.label}
          </p>
          <p className="text-xl font-semibold mt-1 text-text-primary">
            {card.value}
          </p>
          {card.subLabel && (
            <p className="text-xs text-text-secondary mt-0.5">
              {card.subLabel}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
