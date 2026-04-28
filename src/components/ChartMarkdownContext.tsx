import { createContext, useContext, useEffect } from "react";

export interface RegisteredMarkdownSection {
  id: string;
  order: number;
  markdown: string;
}

export type RegisterMarkdownSection = (section: RegisteredMarkdownSection) => () => void;

export const ChartMarkdownContext = createContext<RegisterMarkdownSection | null>(null);

export function useRegisterChartMarkdown(section: RegisteredMarkdownSection | null) {
  const register = useContext(ChartMarkdownContext);

  useEffect(() => {
    if (!register || !section) return;
    return register(section);
  }, [register, section]);
}
