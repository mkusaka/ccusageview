import { createContext, use, useEffect } from "react";

export interface RegisteredMarkdownSection {
  id: string;
  order: number;
  markdown: string | (() => string);
}

export type RegisterMarkdownSection = (section: RegisteredMarkdownSection) => () => void;

export const ChartMarkdownContext = createContext<RegisterMarkdownSection | null>(null);

export function useRegisterChartMarkdown(section: RegisteredMarkdownSection | null) {
  const register = use(ChartMarkdownContext);

  useEffect(() => {
    if (!register || !section) return;
    return register(section);
  }, [register, section]);
}
