"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAppStore, EMPTY_SLOT_MARKET_DATA } from "@/lib/store";
import { TradeControls } from "@/components/TradeControls";
import { SignalPanel } from "@/components/SignalPanel";
import { MarketDataPanel } from "@/components/MarketDataPanel";
import { ShoppingCart, DollarSign } from "lucide-react";
import { executeSlotTrade } from "@/lib/autoTradeRunner";
import { MAIN_CHART_SLOT } from "@/lib/chart-slots";

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
    mode,
    markers,
    safetyStopActive,
    clearMarkers,
    slotMarketData,
  } = useAppStore();

  const marketData = slotMarketData[MAIN_CHART_SLOT] ?? EMPTY_SLOT_MARKET_DATA;
  const { bars, quote, loading, fetchError, dataSource } = marketData;
  const [tradeBlockMessage, setTradeBlockMessage] = useState<string | null>(null);

  const manualTrade = async (side: "buy" | "sell") => {
    const price = quote?.price ?? bars[bars.length - 1]?.close ?? 0;
    if (price <= 0) return;
    const result = await executeSlotTrade({
      slotId: MAIN_CHART_SLOT,
      symbol,
      side,
      price,
      strategy: "manual",
      mode,
      bars,
    });
    if (result.skipped && result.reason) {
      setTradeBlockMessage(result.reason);
    } else if (result.ok) {
      setTradeBlockMessage(null);
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Chart & Signals</h1>
        <p className="text-sm text-[var(--muted)]">
          Real-time analysis with buy/sell markers — auto trade runs in the background
        </p>
      </header>

      {fetchError && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-2 text-sm text-[var(--danger)]">
          {fetchError}
        </p>
      )}

      {tradeBlockMessage && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-2 text-sm text-[var(--danger)]">
          {tradeBlockMessage}
        </p>
      )}

      <div className="mb-4 grid grid-cols-4 gap-4">
        <div className="col-span-3">
          <MarketDataPanel quote={quote} dataSource={dataSource} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void manualTrade("buy")}
            disabled={safetyStopActive || loading || bars.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-medium text-black disabled:opacity-40"
          >
            <ShoppingCart className="h-4 w-4" />
            Buy
          </button>
          <button
            onClick={() => void manualTrade("sell")}
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
