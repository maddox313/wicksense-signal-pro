"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { OHLCV } from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { TradeControls } from "@/components/TradeControls";
import { SignalPanel } from "@/components/SignalPanel";
import { MarketDataPanel } from "@/components/MarketDataPanel";
import { ShoppingCart, DollarSign } from "lucide-react";

const TradingChart = dynamic(
  () => import("@/components/TradingChart").then((m) => m.TradingChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
        <p className="text-sm text-[var(--muted)]">Loading chart...</p>
      </div>
    ),
  }
);

export default function ChartPage() {
  const {
    symbol,
    timeframe,
    tradingStyle,
    mode,
    autoTradeEnabled,
    markers,
    presets,
    activePresetId,
    riskSettings,
    alertSettings,
    safetyStopActive,
    addMarker,
    clearMarkers,
    addSignal,
    addTrade,
    setPerformance,
    setSafetyStopActive,
    setConsecutiveLosses,
  } = useAppStore();

  const [bars, setBars] = useState<OHLCV[]>([]);
  const [quote, setQuote] = useState<{ price: number; change: number }>();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"live" | "mock" | null>(null);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];
  const lastTradedSignalRef = useRef<string | null>(null);

  useEffect(() => {
    lastTradedSignalRef.current = null;
  }, [symbol, timeframe]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const load = async (attempt: number): Promise<void> => {
      const res = await fetch(`/api/market/bars?symbol=${symbol}&timeframe=${timeframe}`);
      const text = await res.text();
      let data: { bars?: OHLCV[]; source?: string; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          attempt < 2
            ? "retry"
            : "Server not ready — wait a few seconds and refresh (use http://localhost:3000)"
        );
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to load market data");
      setBars(data.bars ?? []);
      setDataSource(data.source === "alpaca" ? "live" : "mock");
      if (data.source !== "alpaca" && data.error) {
        setFetchError(`Using mock data — ${data.error}`);
      }
      if (data.bars && data.bars.length >= 2) {
        const last = data.bars[data.bars.length - 1];
        const prev = data.bars[data.bars.length - 2];
        setQuote({ price: last.close, change: ((last.close - prev.close) / prev.close) * 100 });
      }
    };
    try {
      try {
        await load(1);
      } catch (err) {
        if (err instanceof Error && err.message === "retry") {
          await new Promise((r) => setTimeout(r, 3000));
          await load(2);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load chart data");
      setBars([]);
      setDataSource(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const executeTrade = useCallback(
    async (side: "buy" | "sell", price: number, strategy: string, signalId?: string) => {
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
            chartSlot: "main",
          }),
        });
        const data = await res.json();
        if (data.skipped) return;
        if (!res.ok) {
          console.error(data.error ?? "Trade failed");
          return;
        }
        if (data.trade) {
          addTrade(data.trade);
          const barTime = bars[bars.length - 1]?.time ?? Math.floor(Date.now() / 1000);
          const markerId = signalId ?? data.trade.id;
          addMarker({
            id: markerId,
            time: barTime,
            price,
            side,
            label: side === "buy" ? "BUY" : "SELL",
            strategy,
          });
        }
        if (data.safetyStopTriggered) setSafetyStopActive(true);
        if (data.consecutiveLosses !== undefined) setConsecutiveLosses(data.consecutiveLosses);
        if (data.performance) setPerformance(data.performance);
      } catch (err) {
        console.error("Trade execution failed", err);
      }
    },
    [symbol, mode, riskSettings, alertSettings, bars, addTrade, addMarker, setSafetyStopActive, setConsecutiveLosses, setPerformance]
  );

  const runAnalysis = useCallback(async () => {
    if (bars.length < 30 || !activePreset) return;
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
      if (data.signal) {
        addSignal(data.signal);
        if (autoTradeEnabled && !safetyStopActive && mode !== "manual") {
          if (lastTradedSignalRef.current !== data.signal.id) {
            lastTradedSignalRef.current = data.signal.id;
            await executeTrade(
              data.signal.side,
              data.signal.price,
              data.signal.strategy,
              data.signal.id
            );
          }
        }
      }
    } catch (err) {
      console.error("Signal analysis failed", err);
    }
  }, [bars, symbol, activePreset, tradingStyle, autoTradeEnabled, safetyStopActive, mode, addSignal, executeTrade]);

  useEffect(() => {
    if (bars.length >= 30 && activePreset) {
      runAnalysis();
    }
  }, [bars, activePreset, runAnalysis]);

  const manualTrade = (side: "buy" | "sell") => {
    const price = quote?.price ?? bars[bars.length - 1]?.close ?? 0;
    if (price <= 0) return;
    executeTrade(side, price, "manual");
  };

  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then((d) => {
        const loaded = d.presets ?? [];
        useAppStore.getState().setPresets(loaded);
        if (loaded[0] && !useAppStore.getState().activePresetId) {
          useAppStore.getState().setActivePresetId(loaded[0].id);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Chart & Signals</h1>
        <p className="text-sm text-[var(--muted)]">Real-time analysis with buy/sell markers</p>
      </header>

      {fetchError && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-2 text-sm text-[var(--danger)]">
          {fetchError}
        </p>
      )}

      <div className="mb-4 grid grid-cols-4 gap-4">
        <div className="col-span-3">
          <MarketDataPanel quote={quote} dataSource={dataSource} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => manualTrade("buy")}
            disabled={safetyStopActive || loading || bars.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-medium text-black disabled:opacity-40"
          >
            <ShoppingCart className="h-4 w-4" />
            Buy
          </button>
          <button
            onClick={() => manualTrade("sell")}
            disabled={safetyStopActive || loading || bars.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--danger)] py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <DollarSign className="h-4 w-4" />
            Sell
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3">
          {loading ? (
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
              <p className="text-sm text-[var(--muted)]">Loading chart data...</p>
            </div>
          ) : bars.length === 0 ? (
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
              <p className="text-sm text-[var(--muted)]">No chart data available for {symbol}</p>
            </div>
          ) : (
            <TradingChart bars={bars} markers={markers} onClearMarkers={clearMarkers} />
          )}
        </div>
        <div className="space-y-4">
          <TradeControls />
          <SignalPanel />
        </div>
      </div>
    </div>
  );
}
