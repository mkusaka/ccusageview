import { useState, useCallback } from "react";
import { toBlob } from "html-to-image";

interface Props {
  targetRef: React.RefObject<HTMLElement | null>;
}

export function CopyImageButton({ targetRef }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const el = targetRef.current;
    if (!el) return;

    try {
      // Safari requires ClipboardItem to be created synchronously from the
      // user gesture, but accepts a Promise for the blob value.
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": toBlob(el, { pixelRatio: 2 }).then((blob) => {
            if (!blob) throw new Error("toBlob returned null");
            return blob;
          }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy chart image:", err);
    }
  }, [targetRef]);

  return (
    <button
      onClick={handleCopy}
      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
      title="Copy as image"
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
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
