interface RangeSliderProps {
  /** Total number of items */
  count: number;
  /** Current start index (inclusive) */
  start: number;
  /** Current end index (inclusive) */
  end: number;
  /** Label for the start position */
  startLabel: string;
  /** Label for the end position */
  endLabel: string;
  /** Callback when range changes */
  onChange: (start: number, end: number) => void;
}

export function RangeSlider({
  count,
  start,
  end,
  startLabel,
  endLabel,
  onChange,
}: RangeSliderProps) {
  const max = count - 1;

  if (count <= 1) return null;

  const leftPercent = (start / max) * 100;
  const rightPercent = ((max - end) / max) * 100;

  return (
    <div className="bg-bg-card border border-border rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-secondary truncate mr-2">
          {startLabel} — {endLabel}
        </span>
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {end - start + 1} / {count}
        </span>
      </div>
      <div className="range-slider relative h-6 flex items-center">
        {/* Background track */}
        <div className="range-track w-full" />
        {/* Filled portion between handles */}
        <div
          className="range-filled"
          style={{ left: `${leftPercent}%`, right: `${rightPercent}%` }}
        />
        {/* Start handle */}
        <input
          type="range"
          min={0}
          max={max}
          value={start}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.min(v, end), end);
          }}
        />
        {/* End handle */}
        <input
          type="range"
          min={0}
          max={max}
          value={end}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(start, Math.max(v, start));
          }}
        />
      </div>
    </div>
  );
}
