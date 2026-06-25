export type ChartStyle = "candles" | "heikin-ashi" | "line";

export const DEFAULT_CHART_STYLE: ChartStyle = "candles";

const STORAGE_KEY = "wicksense-chart-styles";

export function loadChartStyles(): Record<string, ChartStyle> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const styles: Record<string, ChartStyle> = {};
    for (const [slotId, style] of Object.entries(parsed)) {
      if (style === "candles" || style === "heikin-ashi" || style === "line") {
        styles[slotId] = style;
      }
    }
    return styles;
  } catch {
    return {};
  }
}

export function persistChartStyles(styles: Record<string, ChartStyle>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
  } catch {
    // ignore quota / private mode
  }
}
