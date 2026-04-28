import { useCallback, useState } from "react";

interface Props {
  markdown: string;
  title?: string;
}

export function CopyMarkdownButton({ markdown, title = "Copy as Markdown" }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy Markdown:", err);
    }
  }, [markdown]);

  return (
    <button
      onClick={handleCopy}
      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
      title={copied ? "Copied Markdown" : title}
      aria-label={title}
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4h16v16H4z" />
          <path d="M7 16V8l3 4 3-4v8" />
          <path d="M16 8v8" />
          <path d="M14 14l2 2 2-2" />
        </svg>
      )}
    </button>
  );
}
