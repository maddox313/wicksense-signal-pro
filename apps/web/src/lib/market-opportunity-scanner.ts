import { scanMarket, type ScannerResult, type StrategyPreset } from "@wicksense/core";
import { fetchBars, WATCHLIST } from "@/lib/alpaca";

export interface ScanOpportunitiesOptions {
  preset: StrategyPreset;
  timeframe: string;
  minResults?: number;
}

/** Scan the watchlist for current-bar signals ranked by confidence. */
export async function scanTopOpportunities(
  options: ScanOpportunitiesOptions
): Promise<ScannerResult[]> {
  const { preset, timeframe } = options;
  const style = preset.tradingStyle;

  const data = await Promise.all(
    WATCHLIST.map(async (symbol) => {
      try {
        const { bars } = await fetchBars(symbol, timeframe, 100);
        const changePercent =
          bars.length >= 2
            ? ((bars[bars.length - 1].close - bars[bars.length - 2].close) /
                bars[bars.length - 2].close) *
              100
            : 0;
        return { symbol, bars, changePercent };
      } catch {
        return { symbol, bars: [], changePercent: 0 };
      }
    })
  );

  const withBars = data.filter((d) => d.bars.length >= 30);
  return scanMarket(withBars, preset.strategies, style, undefined, timeframe);
}
