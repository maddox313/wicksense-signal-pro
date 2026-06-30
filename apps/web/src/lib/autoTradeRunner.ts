import type { OHLCV, Trade, TradeMode, TradingStyle } from "@wicksense/core";
import { MAIN_CHART_SLOT } from "./chart-slots";
import { addSignalChartMarker } from "./chart-marker-utils";
import { useAppStore } from "./store";
import { recordSignalActivity, recordSignalActivities } from "./signal-activity-store";
import {
  recordDetectError,
  clearDetectError,
  recordSlotScan,
  recordStrategyConverted,
  recordStrategyRejected,
} from "./strategy-engine-telemetry";
import { resolveActivePreset } from "./presets-client";
import { runSlotCycleWithContext, type SlotCycleContext } from "./slot-cycle-core";

export const AUTO_TRADE_POLL_MS = 30_000;

export interface SlotTradeConfig {
  slotId: string;
  symbol: string;
  timeframe: string;
  tradingStyle: TradingStyle;
  mode: TradeMode;
  autoTradeEnabled: boolean;
  safetyStopActive: boolean;
}

export interface FetchBarsResult {
  bars: OHLCV[];
  quote?: { price: number; change: number };
  dataSource: "live" | "mock" | null;
  fetchError: string | null;
}

export async function fetchSlotBars(
  symbol: string,
  timeframe: string,
  retry = true
): Promise<FetchBarsResult> {
  const load = async (): Promise<FetchBarsResult> => {
    const res = await fetch(`/api/market/bars?symbol=${symbol}&timeframe=${timeframe}`);
    const text = await res.text();
    let data: { bars?: OHLCV[]; source?: string; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      if (retry) throw new Error("retry");
      return {
        bars: [],
        dataSource: null,
        fetchError: "Server not ready — wait a few seconds and refresh",
      };
    }
    if (!res.ok) {
      return {
        bars: [],
        dataSource: null,
        fetchError: data.error ?? "Failed to load market data",
      };
    }

    const bars = data.bars ?? [];
    const dataSource = data.source === "alpaca" ? "live" : "mock";
    let fetchError: string | null = null;
    if (dataSource === "mock" && data.error) {
      fetchError = `Using mock data — ${data.error}`;
    }

    let quote: { price: number; change: number } | undefined;
    if (bars.length >= 2) {
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      quote = { price: last.close, change: ((last.close - prev.close) / prev.close) * 100 };
    }

    return { bars, quote, dataSource, fetchError };
  };

  try {
    return await load();
  } catch (err) {
    if (retry && err instanceof Error && err.message === "retry") {
      await new Promise((r) => setTimeout(r, 3000));
      return fetchSlotBars(symbol, timeframe, false);
    }
    return {
      bars: [],
      dataSource: null,
      fetchError: err instanceof Error ? err.message : "Failed to load chart data",
    };
  }
}

export async function executeSlotTrade(params: {
  slotId: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  strategy: string;
  mode: TradeMode;
  signalId?: string;
  bars: OHLCV[];
  timeframe?: string;
  signalReason?: string;
  signalBarTime?: number;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const { riskSettings, alertSettings } = useAppStore.getState();
  const {
    slotId,
    symbol,
    side,
    price,
    strategy,
    mode,
    signalId,
    bars,
    timeframe,
    signalReason,
    signalBarTime,
  } = params;

  try {
    const res = await fetch("/api/trades/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        side,
        price,
        strategy,
        mode,
        riskSettings,
        alertSettings,
        signalId,
        chartSlot: slotId,
        timeframe,
        signalReason,
        signalBarTime,
      }),
    });
    const data = await res.json();
    if (data.skipped) {
      if (data.reason?.includes("trading hours") || data.reason?.includes("Trading is not")) {
        console.warn(`[AutoTrade:${slotId}] ${data.reason}`);
      }
      return { ok: false, skipped: true, reason: data.reason };
    }
    if (!res.ok) {
      const store = useAppStore.getState();
      if (data.trade) {
        store.addTrade(data.trade);
        const barTime =
          signalBarTime ?? bars[bars.length - 1]?.time ?? Math.floor(Date.now() / 1000);
        const marker = {
          id: signalId ?? data.trade.id ?? `${slotId}-${side}-${Date.now()}`,
          time: barTime,
          price,
          side,
          label: side === "buy" ? "BUY" : "SELL",
          strategy,
          symbol,
        } as const;
        if (slotId === MAIN_CHART_SLOT) {
          store.addMarker(marker);
        } else {
          store.addMultiChartMarker(slotId, marker);
        }
      }
      console.error(`[AutoTrade:${slotId}]`, data.error ?? "Trade failed");
      return { ok: false, reason: data.error ?? "Trade failed" };
    }

    const barTime =
      signalBarTime ?? bars[bars.length - 1]?.time ?? Math.floor(Date.now() / 1000);
    const marker = {
      id: signalId ?? data.trade?.id ?? `${slotId}-${side}-${Date.now()}`,
      time: barTime,
      price,
      side,
      label: side === "buy" ? "BUY" : "SELL",
      strategy,
      symbol,
    } as const;

    const store = useAppStore.getState();
    if (data.trade) {
      store.addTrade(data.trade);
      if (slotId === MAIN_CHART_SLOT) {
        store.addMarker(marker);
      } else {
        store.addMultiChartMarker(slotId, marker);
      }
    }

    if (slotId === MAIN_CHART_SLOT) {
      if (data.safetyStopTriggered) store.setSafetyStopActive(true);
      if (data.consecutiveLosses !== undefined) store.setConsecutiveLosses(data.consecutiveLosses);
    } else {
      if (data.safetyStopTriggered) {
        store.updateMultiChartSlot(slotId, { safetyStopActive: true });
      }
      if (data.consecutiveLosses !== undefined) {
        store.updateMultiChartSlot(slotId, { consecutiveLosses: data.consecutiveLosses });
      }
    }

    if (data.performance) store.setPerformance(data.performance);
    return { ok: true };
  } catch (err) {
    console.error(`[AutoTrade:${slotId}] Trade execution failed`, err);
    return { ok: false, reason: err instanceof Error ? err.message : "Trade execution failed" };
  }
}

const barsFetchInFlight = new Map<string, Promise<FetchBarsResult>>();

/** Fetch OHLCV for a chart slot and update the store — independent of auto-trade cycles. */
export async function refreshSlotBarsOnly(
  slotId: string,
  symbol: string,
  timeframe: string
): Promise<FetchBarsResult> {
  const fetchKey = `${slotId}:${symbol}:${timeframe}`;
  const inFlight = barsFetchInFlight.get(fetchKey);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<FetchBarsResult> => {
    const store = useAppStore.getState();
    const existingBars = store.slotMarketData[slotId]?.bars ?? [];
    if (existingBars.length === 0) {
      store.patchSlotMarketData(slotId, { loading: true, refreshing: false });
    } else {
      store.patchSlotMarketData(slotId, { refreshing: true });
    }

    try {
      const result = await fetchSlotBars(symbol, timeframe);
      store.patchSlotMarketData(slotId, {
        bars: result.bars,
        quote: result.quote,
        dataSource: result.dataSource,
        fetchError: result.fetchError,
        loading: false,
        refreshing: false,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load chart data";
      store.patchSlotMarketData(slotId, {
        loading: false,
        refreshing: false,
        fetchError: message,
      });
      return { bars: [], dataSource: null, fetchError: message };
    }
  })();

  barsFetchInFlight.set(fetchKey, promise);
  try {
    return await promise;
  } finally {
    barsFetchInFlight.delete(fetchKey);
  }
}

function createClientSlotCycleContext(slotId: string, mode: TradeMode): SlotCycleContext {
  const activityOpts = { chartSlot: slotId, mode };
  return {
    getTrades: () => useAppStore.getState().trades,
    tradingSchedule: useAppStore.getState().tradingSchedule,
    riskSettings: useAppStore.getState().riskSettings,
    alertSettings: useAppStore.getState().alertSettings,
    resolveActivePreset,
    fetchBars: async (symbol, timeframe) => {
      const result = await refreshSlotBarsOnly(slotId, symbol, timeframe);
      return result;
    },
    executeTrade: executeSlotTrade,
    onSignalDetected: (signal) => {
      const store = useAppStore.getState();
      store.addSignal(signal);
      addSignalChartMarker(slotId, signal);
    },
    recordBarSignalsGenerated: (signals) =>
      recordSignalActivities(signals, "generated", activityOpts),
    recordSlotScan: (scan) => recordSlotScan(scan as Parameters<typeof recordSlotScan>[0]),
    recordSignalGenerated: (signal) => recordSignalActivity(signal, "generated", activityOpts),
    recordSignalRejected: (signal, reason) => {
      recordSignalActivity(signal, "rejected", { ...activityOpts, reason });
      recordStrategyRejected(signal.strategy);
    },
    recordSignalConverted: (signal) => {
      recordSignalActivity(signal, "converted", activityOpts);
      recordStrategyConverted(signal.strategy);
    },
    recordDetectError,
    clearDetectError,
  };
}

export async function runSlotCycle(config: SlotTradeConfig): Promise<void> {
  const { slotId, mode } = config;
  await runSlotCycleWithContext(config, createClientSlotCycleContext(slotId, mode));
}

export function buildMainSlotConfig(): SlotTradeConfig {
  const s = useAppStore.getState();
  return {
    slotId: MAIN_CHART_SLOT,
    symbol: s.symbol,
    timeframe: s.timeframe,
    tradingStyle: s.tradingStyle,
    mode: s.mode,
    autoTradeEnabled: s.autoTradeEnabled,
    safetyStopActive: s.safetyStopActive,
  };
}

export function buildMultiSlotConfig(
  slot: ReturnType<typeof useAppStore.getState>["multiChartSlots"][number]
): SlotTradeConfig {
  return {
    slotId: slot.id,
    symbol: slot.symbol,
    timeframe: slot.timeframe,
    tradingStyle: slot.tradingStyle,
    mode: slot.mode,
    autoTradeEnabled: slot.autoTradeEnabled,
    safetyStopActive: slot.safetyStopActive,
  };
}
