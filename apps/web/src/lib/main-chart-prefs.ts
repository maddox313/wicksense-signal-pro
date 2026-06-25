import type { TradingStyle } from "@wicksense/core";

export interface MainChartPrefs {
  symbol: string;
  timeframe: string;
  tradingStyle: TradingStyle;
}

export const DEFAULT_MAIN_CHART_PREFS: MainChartPrefs = {
  symbol: "AAPL",
  timeframe: "5m",
  tradingStyle: "day",
};

const STORAGE_KEY = "wicksense-main-chart-prefs";

const VALID_TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return symbol.length > 0 ? symbol : null;
}

function normalizeTimeframe(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timeframe = value.trim();
  return VALID_TIMEFRAMES.has(timeframe) ? timeframe : null;
}

function normalizeTradingStyle(value: unknown): TradingStyle | null {
  return value === "day" || value === "swing" ? value : null;
}

export function loadMainChartPrefs(): MainChartPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_MAIN_CHART_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MAIN_CHART_PREFS };
    const parsed = JSON.parse(raw) as Partial<MainChartPrefs>;
    return {
      symbol: normalizeSymbol(parsed.symbol) ?? DEFAULT_MAIN_CHART_PREFS.symbol,
      timeframe: normalizeTimeframe(parsed.timeframe) ?? DEFAULT_MAIN_CHART_PREFS.timeframe,
      tradingStyle:
        normalizeTradingStyle(parsed.tradingStyle) ?? DEFAULT_MAIN_CHART_PREFS.tradingStyle,
    };
  } catch {
    return { ...DEFAULT_MAIN_CHART_PREFS };
  }
}

export function persistMainChartPrefs(prefs: MainChartPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        symbol: normalizeSymbol(prefs.symbol) ?? DEFAULT_MAIN_CHART_PREFS.symbol,
        timeframe: normalizeTimeframe(prefs.timeframe) ?? DEFAULT_MAIN_CHART_PREFS.timeframe,
        tradingStyle:
          normalizeTradingStyle(prefs.tradingStyle) ?? DEFAULT_MAIN_CHART_PREFS.tradingStyle,
      })
    );
  } catch {
    // ignore quota / private mode
  }
}
