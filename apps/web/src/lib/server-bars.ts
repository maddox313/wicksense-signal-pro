import type { OHLCV } from "@wicksense/core";
import { fetchBars } from "@/lib/alpaca";
import type { FetchBarsResult } from "@/lib/autoTradeRunner";

export async function fetchServerSlotBars(
  symbol: string,
  timeframe: string
): Promise<FetchBarsResult> {
  try {
    const { bars, source, error } = await fetchBars(symbol, timeframe);
    const dataSource = source === "alpaca" ? "live" : "mock";
    let fetchError: string | null = null;
    if (dataSource === "mock" && error) {
      fetchError = `Using mock data — ${error}`;
    } else if (!bars.length && error) {
      fetchError = error;
    }

    let quote: { price: number; change: number } | undefined;
    if (bars.length >= 2) {
      const last = bars[bars.length - 1] as OHLCV;
      const prev = bars[bars.length - 2] as OHLCV;
      quote = { price: last.close, change: ((last.close - prev.close) / prev.close) * 100 };
    }

    return { bars, quote, dataSource, fetchError };
  } catch (err) {
    return {
      bars: [],
      dataSource: null,
      fetchError: err instanceof Error ? err.message : "Failed to load chart data",
    };
  }
}
