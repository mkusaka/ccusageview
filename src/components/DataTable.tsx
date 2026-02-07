import { useState, useMemo } from "react";
import type { NormalizedEntry } from "../utils/normalize";
import { formatCost, formatTokens } from "../utils/format";

interface Props {
  entries: NormalizedEntry[];
}

type SortDir = "asc" | "desc";

interface Column {
  key: string;
  label: string;
  align: "left" | "right";
  render: (entry: NormalizedEntry) => string;
  sortValue: (entry: NormalizedEntry) => number | string;
}

const COLUMNS: Column[] = [
  {
    key: "label",
    label: "Label",
    align: "left",
    render: (e) => e.label,
    sortValue: (e) => e.label,
  },
  {
    key: "inputTokens",
    label: "Input",
    align: "right",
    render: (e) => formatTokens(e.inputTokens),
    sortValue: (e) => e.inputTokens,
  },
  {
    key: "outputTokens",
    label: "Output",
    align: "right",
    render: (e) => formatTokens(e.outputTokens),
    sortValue: (e) => e.outputTokens,
  },
  {
    key: "cacheCreationTokens",
    label: "Cache Create",
    align: "right",
    render: (e) => formatTokens(e.cacheCreationTokens),
    sortValue: (e) => e.cacheCreationTokens,
  },
  {
    key: "cacheReadTokens",
    label: "Cache Read",
    align: "right",
    render: (e) => formatTokens(e.cacheReadTokens),
    sortValue: (e) => e.cacheReadTokens,
  },
  {
    key: "totalTokens",
    label: "Total Tokens",
    align: "right",
    render: (e) => formatTokens(e.totalTokens),
    sortValue: (e) => e.totalTokens,
  },
  {
    key: "cost",
    label: "Cost",
    align: "right",
    render: (e) => formatCost(e.cost),
    sortValue: (e) => e.cost,
  },
  {
    key: "models",
    label: "Models",
    align: "left",
    render: (e) => e.models.join(", "),
    sortValue: (e) => e.models.join(", "),
  },
];

export function DataTable({ entries }: Props) {
  const [open, setOpen] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Default: reverse order (newest first, since entries are typically time-ascending)
  const sorted = useMemo(() => {
    if (!sortCol) return [...entries].reverse();
    const col = COLUMNS.find((c) => c.key === sortCol);
    if (!col) return [...entries].reverse();
    return [...entries].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortCol, sortDir]);

  function handleSort(key: string) {
    if (sortCol === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 text-left text-sm font-medium text-text-secondary hover:text-text-primary flex items-center justify-between"
      >
        <span>Raw Data</span>
        <span className="text-xs">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`py-2 px-3 font-medium text-text-secondary cursor-pointer hover:text-text-primary select-none whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="ml-1">
                        {sortDir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => (
                <tr key={i} className="border-b border-border/50">
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2 px-3 whitespace-nowrap text-text-primary ${
                        col.align === "right" ? "text-right" : "text-left"
                      } ${col.key === "label" || col.key === "models" ? "font-mono text-xs" : ""}`}
                    >
                      {col.render(entry)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
