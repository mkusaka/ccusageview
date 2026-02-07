import { useCallback } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

export function InputView({ value, onChange, error }: Props) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onChange(reader.result);
        }
      };
      reader.readAsText(file);
    },
    [onChange]
  );

  return (
    <div>
      <textarea
        className="w-full h-48 font-mono text-sm p-4 border border-border rounded-lg bg-bg-card text-text-primary placeholder:text-text-secondary/50 resize-y focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        placeholder={'Paste ccusage --json output here\n\n{"daily": [...], "totals": {...}}'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        spellCheck={false}
      />
      {error && (
        <p className="text-sm text-chart-red mt-1.5 opacity-80">{error}</p>
      )}
    </div>
  );
}
