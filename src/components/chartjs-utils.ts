import type {
  ActiveDataPoint,
  Chart as ChartJsInstance,
  ChartType,
  Plugin,
  TooltipItem,
  TooltipModel,
} from "chart.js";

export const CHART_JS_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#14b8a6", "#ef4444"];

export function getChartJsColor(index: number): string {
  return CHART_JS_COLORS[index % CHART_JS_COLORS.length];
}

export function withOpacity(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeStackValue(
  row: Record<string, unknown>,
  key: string,
  visibleKeys: readonly string[],
): number {
  const raw = asNumber(row[key]) ?? 0;
  const total = visibleKeys.reduce((sum, itemKey) => sum + (asNumber(row[itemKey]) ?? 0), 0);
  return total > 0 ? raw / total : 0;
}

export function getOrCreateExternalTooltipElement(
  chart: ChartJsInstance,
  datasetName: string,
): HTMLDivElement {
  const parent = chart.canvas.parentNode as HTMLElement;
  let tooltipEl = parent.querySelector<HTMLDivElement>(`[data-chartjs-tooltip="${datasetName}"]`);

  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.dataset.chartjsTooltip = datasetName;
    tooltipEl.style.position = "absolute";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.zIndex = "20";
    tooltipEl.style.minWidth = "180px";
    tooltipEl.style.maxWidth = "min(760px, calc(100vw - 32px))";
    tooltipEl.style.maxHeight = "min(420px, calc(100vh - 32px))";
    tooltipEl.style.overflowY = "auto";
    tooltipEl.style.border = "1px solid var(--color-border)";
    tooltipEl.style.borderRadius = "8px";
    tooltipEl.style.background = "var(--color-bg-card)";
    tooltipEl.style.boxShadow = "0 10px 30px rgba(15, 23, 42, 0.18)";
    tooltipEl.style.color = "var(--color-text-primary)";
    tooltipEl.style.fontSize = "12px";
    tooltipEl.style.lineHeight = "1.35";
    tooltipEl.style.padding = "8px 10px";
    tooltipEl.style.transition = "opacity 80ms ease";
    parent.appendChild(tooltipEl);
  }

  return tooltipEl;
}

export function positionExternalTooltip(
  chart: ChartJsInstance,
  tooltip: TooltipModel<"bar" | "line" | "doughnut">,
  tooltipEl: HTMLDivElement,
) {
  const parent = chart.canvas.parentNode as HTMLElement;
  const parentRect = parent.getBoundingClientRect();
  tooltipEl.style.maxHeight = `${Math.max(160, parentRect.height - 16)}px`;
  const tooltipWidth = tooltipEl.offsetWidth;
  const tooltipHeight = tooltipEl.offsetHeight;
  const left = Math.min(
    Math.max(tooltip.caretX, tooltipWidth / 2 + 8),
    parentRect.width - tooltipWidth / 2 - 8,
  );
  let top = tooltip.caretY - tooltipHeight - 12;
  if (top < 8) top = tooltip.caretY + 12;
  if (top + tooltipHeight > parentRect.height - 8) {
    top = Math.max(8, parentRect.height - tooltipHeight - 8);
  }

  tooltipEl.style.opacity = "1";
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.transform = "translateX(-50%)";
}

export function getParsedTooltipValue(
  item: TooltipItem<"bar" | "line" | "doughnut">,
): number | null {
  const parsed = item.parsed as number | { y?: unknown } | null;
  if (typeof parsed === "number") return Number.isFinite(parsed) ? parsed : null;
  if (parsed && typeof parsed === "object" && "y" in parsed) {
    const value = Number(parsed.y);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function createVerticalHoverLinePlugin<TType extends ChartType>(dataIndexRef: {
  readonly current: number | null;
}): Plugin<TType> {
  return {
    id: "vertical-hover-line",
    afterDatasetsDraw(chart) {
      const dataIndex = dataIndexRef.current;
      if (dataIndex == null) return;

      const element = chart.getDatasetMeta(0).data[dataIndex] as { x?: number } | undefined;
      const x = element?.x;
      if (typeof x !== "number") return;

      const { top, bottom, left, right } = chart.chartArea;
      if (x < left || x > right) return;

      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.72)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export function syncChartHoverState<TType extends ChartType>(
  chart: ChartJsInstance<TType> | null,
  dataIndex: number | null,
) {
  if (!chart) return;

  if (dataIndex == null) {
    chart.setActiveElements([]);
    chart.tooltip?.setActiveElements([], {
      x: (chart.chartArea.left + chart.chartArea.right) / 2,
      y: (chart.chartArea.top + chart.chartArea.bottom) / 2,
    });
    chart.update("none");
    return;
  }

  const activeElements: ActiveDataPoint[] = [];
  for (let datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex += 1) {
    if (!chart.isDatasetVisible(datasetIndex)) continue;
    const element = chart.getDatasetMeta(datasetIndex).data[dataIndex];
    if (!element) continue;
    activeElements.push({ datasetIndex, index: dataIndex });
  }

  const firstElement = chart.getDatasetMeta(0).data[dataIndex] as
    | { x?: number; y?: number }
    | undefined;
  const x =
    typeof firstElement?.x === "number"
      ? firstElement.x
      : (chart.chartArea.left + chart.chartArea.right) / 2;
  const y =
    typeof firstElement?.y === "number"
      ? firstElement.y
      : (chart.chartArea.top + chart.chartArea.bottom) / 2;

  chart.setActiveElements(activeElements);
  chart.tooltip?.setActiveElements(activeElements, { x, y });
  chart.update("none");
}

export function getActiveDataIndex(elements: readonly { index?: number }[]): number | null {
  const index = elements[0]?.index;
  return typeof index === "number" && Number.isInteger(index) ? index : null;
}
