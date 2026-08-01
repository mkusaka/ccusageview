import { getNextHiddenSeriesForLabelClick } from "../utils/chartLegend";

export interface SeriesLegendItem {
  key: string;
  label: string;
  color: string;
}

interface Props {
  items: readonly SeriesLegendItem[];
  hiddenSeries: ReadonlySet<string>;
  onToggleSeries: (key: string) => void;
  onHiddenSeriesChange: (hiddenSeries: Set<string>) => void;
  className?: string;
}

export function SeriesLegend({
  items,
  hiddenSeries,
  onToggleSeries,
  onHiddenSeriesChange,
  className = "",
}: Props) {
  const seriesKeys = items.map((item) => item.key);

  return (
    <div className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-1 ${className}`}>
      {items.map((item) => {
        const isHidden = hiddenSeries.has(item.key);
        const visibleKeys = seriesKeys.filter((key) => !hiddenSeries.has(key));
        const isOnlyVisibleSeries = visibleKeys.length === 1 && visibleKeys[0] === item.key;

        return (
          <div
            key={item.key}
            className="inline-flex items-center gap-1"
            style={{
              opacity: isHidden ? 0.3 : 1,
              fontSize: "inherit",
              color: "inherit",
              textDecoration: isHidden ? "line-through" : "none",
            }}
          >
            <button
              type="button"
              aria-label={`Toggle ${item.label}`}
              onClick={() => onToggleSeries(item.key)}
              className="bg-transparent border-none p-0 cursor-pointer"
              style={{
                width: 10,
                height: 10,
                backgroundColor: item.color,
                display: "inline-block",
              }}
            />
            <button
              type="button"
              aria-pressed={isOnlyVisibleSeries}
              onClick={() =>
                onHiddenSeriesChange(
                  getNextHiddenSeriesForLabelClick(hiddenSeries, seriesKeys, item.key),
                )
              }
              className="bg-transparent border-none p-0 cursor-pointer"
              style={{
                fontSize: "inherit",
                color: "var(--color-text-secondary)",
                textDecoration: "inherit",
              }}
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
