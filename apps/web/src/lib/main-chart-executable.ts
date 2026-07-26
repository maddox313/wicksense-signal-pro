import type { OHLCV, Signal, TradingScheduleSettings } from "@wicksense/core";
import { detectActionableSignal } from "@wicksense/core";
import type { Trade } from "@wicksense/core";
import type { SlotTradeConfig } from "./autoTradeRunner";
import { evaluateSlotEntryGates } from "./slot-entry-gates";

export interface ExecutableCandidate {
  symbol: string;
  signal: Signal;
  bars: OHLCV[];
  confidence: number;
}

export interface FindBestExecutableDeps {
  opportunities: Array<{ symbol: string; signal: Signal }>;
  fetchBars: (symbol: string, timeframe: string) => Promise<{ bars: OHLCV[] }>;
  mainConfig: SlotTradeConfig;
  trades: Trade[];
  tradingSchedule: TradingScheduleSettings;
  strategyIds: string[];
  tradingStyle: SlotTradeConfig["tradingStyle"];
  timeframe: string;
  filterSignalBeforeExecute?: (params: {
    signal: Signal;
    bars: OHLCV[];
    config: SlotTradeConfig;
  }) => Promise<{ allow: boolean; reason?: string } | void>;
  /** Optional re-check after gates pass (invalidation before execute). */
  revalidate?: (candidate: ExecutableCandidate) => Promise<boolean>;
  /**
   * Test/injection hook. Defaults to detectActionableSignal.
   * When provided, `fallback` is the opportunity's scan signal.
   */
  detectSignal?: (
    symbol: string,
    bars: OHLCV[],
    strategyIds: string[],
    tradingStyle: SlotTradeConfig["tradingStyle"],
    timeframe: string,
    fallback: Signal
  ) => Signal | null;
}

/**
 * Walk confidence-ranked opportunities and return the first that passes
 * the same entry gates as the live slot cycle.
 */
export async function findBestExecutableOpportunity(
  deps: FindBestExecutableDeps
): Promise<ExecutableCandidate | null> {
  for (const item of deps.opportunities) {
    const symbol = item.symbol.toUpperCase();
    const { bars } = await deps.fetchBars(symbol, deps.timeframe);
    const config: SlotTradeConfig = { ...deps.mainConfig, symbol };
    const signal = deps.detectSignal
      ? deps.detectSignal(
          symbol,
          bars,
          deps.strategyIds,
          deps.tradingStyle,
          deps.timeframe,
          item.signal
        )
      : detectActionableSignal(
          symbol,
          bars,
          deps.strategyIds,
          deps.tradingStyle,
          deps.timeframe
        );

    if (!signal || signal.symbol.toUpperCase() !== symbol) continue;

    const gate = await evaluateSlotEntryGates({
      config,
      signal,
      bars,
      trades: deps.trades,
      tradingSchedule: deps.tradingSchedule,
      filterSignalBeforeExecute: deps.filterSignalBeforeExecute,
    });
    if (!gate.executable) continue;

    const candidate: ExecutableCandidate = {
      symbol,
      signal,
      bars,
      confidence: signal.confidence,
    };
    if (deps.revalidate) {
      const stillValid = await deps.revalidate(candidate);
      if (!stillValid) continue;
    }
    return candidate;
  }
  return null;
}
