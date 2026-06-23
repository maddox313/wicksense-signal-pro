import type { OHLCV, TradeMode, TradingStyle } from "@wicksense/core";
import { MAIN_CHART_SLOT } from "./chart-slots";
import { useAppStore } from "./store";

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
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const { riskSettings, alertSettings } = useAppStore.getState();
  const { slotId, symbol, side, price, strategy, mode, signalId, bars } = params;

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
      }),
    });
    const data = await res.json();
    if (data.skipped) return { ok: false, skipped: true };
    if (!res.ok) {
      console.error(`[AutoTrade:${slotId}]`, data.error ?? "Trade failed");
      return { ok: false };
    }

    const barTime = bars[bars.length - 1]?.time ?? Math.floor(Date.now() / 1000);
    const marker = {
      id: signalId ?? data.trade?.id ?? `${slotId}-${side}-${Date.now()}`,
      time: barTime,
      price,
      side,
      label: side === "buy" ? "BUY" : "SELL",
      strategy,
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
    return { ok: false };
  }
}

export async function runSlotCycle(
  config: SlotTradeConfig,
  lastSignalBySlot: Map<string, string>,
  symbolTfBySlot: Map<string, string>
): Promise<void> {
  const store = useAppStore.getState();
  const { slotId, symbol, timeframe, tradingStyle, mode, autoTradeEnabled, safetyStopActive } =
    config;

  const symbolTfKey = `${symbol}:${timeframe}`;
  if (symbolTfBySlot.get(slotId) !== symbolTfKey) {
    symbolTfBySlot.set(slotId, symbolTfKey);
    lastSignalBySlot.delete(slotId);
  }

  store.patchSlotMarketData(slotId, { loading: true });

  const { bars, quote, dataSource, fetchError } = await fetchSlotBars(symbol, timeframe);
  store.patchSlotMarketData(slotId, {
    bars,
    quote,
    dataSource,
    fetchError,
    loading: false,
  });

  if (bars.length < 30) return;

  const activePreset =
    store.presets.find((p) => p.id === store.activePresetId) ?? store.presets[0];
  if (!activePreset) return;

  try {
    const res = await fetch("/api/signals/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        bars,
        strategyIds: activePreset.strategies,
        style: tradingStyle,
      }),
    });
    const data = await res.json();
    if (!res.ok) return;

    if (!data.signal) return;

    store.addSignal(data.signal);

    if (!autoTradeEnabled || safetyStopActive || mode === "manual") return;

    if (lastSignalBySlot.get(slotId) === data.signal.id) return;

    lastSignalBySlot.set(slotId, data.signal.id);
    await executeSlotTrade({
      slotId,
      symbol,
      side: data.signal.side,
      price: data.signal.price,
      strategy: data.signal.strategy,
      mode,
      signalId: data.signal.id,
      bars,
    });
  } catch (err) {
    console.error(`[AutoTrade:${slotId}] Signal analysis failed`, err);
  }
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
