import { useState, useCallback, useRef } from "react";
import { hc } from "hono/client";
import type { AppType } from "../worker";

type Status = "idle" | "loading" | "copied" | "error";

export function ShareButton() {
  const [status, setStatus] = useState<Status>("idle");
  const clientRef = useRef<ReturnType<typeof hc<AppType>>>(undefined);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = hc<AppType>(window.location.origin);
    }
    return clientRef.current;
  }, []);

  const handleShare = useCallback(async () => {
    const hash = window.location.hash;
    if (!hash.startsWith("#data=")) return;

    const data = hash.slice("#data=".length);
    setStatus("loading");

    try {
      const res = await getClient().api.s.$post({ json: { data } });
      if (!res.ok) {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      }
      const { id } = await res.json();
      const shortUrl = `${window.location.origin}/s/${id}`;
      await navigator.clipboard.writeText(shortUrl);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, [getClient]);

  return (
    <button
      onClick={handleShare}
      disabled={status === "loading"}
      className="h-8 px-2.5 flex items-center gap-1.5 rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors text-xs disabled:opacity-50"
      title="Generate Tiny URL"
    >
      {status === "loading" ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="animate-spin"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ) : status === "copied" ? (
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
      ) : status === "error" ? (
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
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
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
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      )}
      {status === "copied" ? "Copied!" : "Generate Tiny URL"}
    </button>
  );
}
