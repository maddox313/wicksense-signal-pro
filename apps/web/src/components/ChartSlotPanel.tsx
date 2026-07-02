"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { computePerformanceStats } from "@wicksense/core";
import { useAppStore, EMPTY_SLOT_MARKET_DATA } from "@/lib/store";
import type { MultiChartSlot } from "@/lib/store";
import { executeSlotTrade } from "@/lib/autoTradeRunner";
import { filterMarkersForSymbol } from "@/lib/chart-marker-utils";
import { persistAutoTradeSlot } from "@/lib/auto-trade-client";
import { TRADING_TIMEFRAMES } from "@/lib/main-chart-prefs";
import { resetSafetyStopClient } from "@/lib/reset-safety-stop-client";
import { ShoppingCart, DollarSign, Play, Pause, ShieldAlert } from "lucide-react";

const TradingChart = dynamic(
  () => import("@/components/TradingChart").then((m) => m.TradingChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-[var(--card-border)] bg-black/20">
        <p className="text-xs text-[var(--muted)]">Loading...</p>
      </div>
    ),
  }
);

const TIMEFRAMES = TRADING_TIMEFRAMES;

interface ChartSlotPanelProps {
  slot: MultiChartSlot;
}

export function ChartSlotPanel({ slot }: ChartSlotPanelProps) {
  const { trades, updateMultiChartSlot, clearMultiChartMarkers, slotMarketData } = useAppStore();
  const [tradeBlockMessage, setTradeBlockMessage] = useState<string | null>(null);

  const marketData = slotMarketData[slot.id] ?? EMPTY_SLOT_MARKET_DATA;
  const { bars, quote, loading, refreshing, fetchError } = marketData;
  const initialLoad = loading && bars.length === 0;

  const manualTrade = async (side: "buy" | "sell") => {
    const price = quote?.price ?? bars[bars.length - 1]?.close ?? 0;
    if (price <= 0) return;
    const result = await executeSlotTrade({
      slotId: slot.id,
      symbol: slot.symbol,
      side,
      price,
      strategy: "manual",
      mode: slot.mode,
      bars,
      timeframe: slot.timeframe,
    });
    if (result.skipped && result.reason) {
      setTradeBlockMessage(result.reason);
    } else if (result.ok) {
      setTradeBlockMessage(null);
    }
  };

  const slotTrades = trades.filter((t) => (t.chartSlot ?? "main") === slot.id);
  const stats = computePerformanceStats(slotTrades);
  const openPnl = slotTrades
    .filter((t) => t.status === "open")
    .reduce((sum, t) => {
      const current = quote?.price ?? t.entryPrice;
      return sum + (current - t.entryPrice) * t.quantity;
    }, 0);

  return (
    <div className="flex flex-col rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--card-border)] p-3">
        <span className="text-xs font-semibold text-[var(--accent)]">{slot.label}</span>
        <input
          value={slot.symbol}
          onChange={(e) =>
            updateMultiChartSlot(slot.id, { symbol: e.target.value.toUpperCase() })
          }
          className="w-16 rounded bg-white/5 px-2 py-1 text-xs font-medium uppercase outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <select
          value={slot.timeframe}
          onChange={(e) => updateMultiChartSlot(slot.id, { timeframe: e.target.value })}
          className="rounded bg-white/5 px-2 py-1 text-xs outline-none"
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {(["paper", "live", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => updateMultiChartSlot(slot.id, { mode: m })}
              className={`rounded px-2 py-1 text-[10px] capitalize transition-colors ${
                slot.mode === m
                  ? "bg-[var(--accent)] text-black font-medium"
                  : "bg-white/5 text-[var(--muted)] hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const next = !slot.autoTradeEnabled;
            updateMultiChartSlot(slot.id, { autoTradeEnabled: next });
            void persistAutoTradeSlot(slot.id, next);
          }}
          disabled={slot.mode === "manual" || slot.safetyStopActive}
          className={`ml-auto flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
            slot.autoTradeEnabled
              ? "bg-[var(--accent)] text-black"
              : "bg-white/5 text-[var(--muted)]"
          } disabled:opacity-40`}
        >
          {slot.autoTradeEnabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          Auto
        </button>
        <button
          onClick={() => void manualTrade("buy")}
          disabled={slot.safetyStopActive || initialLoad || bars.length === 0}
          className="flex items-center gap-1 rounded bg-[var(--accent)] px-2 py-1 text-[10px] font-medium text-black disabled:opacity-40"
        >
          <ShoppingCart className="h-3 w-3" />
          Buy
        </button>
        <button
          onClick={() => void manualTrade("sell")}
          disabled={slot.safetyStopActive || initialLoad || bars.length === 0}
          className="flex items-center gap-1 rounded bg-[var(--danger)] px-2 py-1 text-[10px] font-medium text-white disabled:opacity-40"
        >
          <DollarSign className="h-3 w-3" />
          Sell
        </button>
      </div>

      {slot.safetyStopActive && (
        <div className="flex items-center gap-2 border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-1.5">
          <ShieldAlert className="h-3 w-3 text-[var(--danger)]" />
          <span className="text-[10px] text-[var(--danger)]">Safety stop — auto paused</span>
          <button
            onClick={() => void resetSafetyStopClient(slot.id)}
            className="ml-auto text-[10px] text-[var(--danger)] underline"
          >
            Reset
          </button>
        </div>
      )}

      {fetchError && (
        <p className="border-b border-[var(--card-border)] px-3 py-1.5 text-[10px] text-[var(--danger)]">
          {fetchError}
        </p>
      )}

      {tradeBlockMessage && (
        <p className="border-b border-[var(--card-border)] px-3 py-1.5 text-[10px] text-[var(--danger)]">
          {tradeBlockMessage}
        </p>
      )}

      <div className="p-2">
        {initialLoad ? (
          <div className="flex h-[220px] items-center justify-center rounded-lg bg-black/20">
            <p className="text-xs text-[var(--muted)]">Loading...</p>
          </div>
        ) : bars.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center rounded-lg bg-black/20">
            <p className="text-xs text-[var(--muted)]">No data for {slot.symbol}</p>
          </div>
        ) : (
          <TradingChart
            slotId={slot.id}
            bars={bars}
            markers={filterMarkersForSymbol(slot.markers, slot.symbol)}
            onClearMarkers={() => clearMultiChartMarkers(slot.id)}
            height={220}
            compact
            title={`${slot.symbol} · ${slot.timeframe}`}
            refreshing={refreshing}
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-[var(--card-border)] p-3 text-center">
        <Stat label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} positive={stats.winRate >= 50} />
        <Stat
          label="Realized P&L"
          value={`$${stats.totalPnl.toFixed(2)}`}
          positive={stats.totalPnl >= 0}
        />
        <Stat label="Open P&L" value={`$${openPnl.toFixed(2)}`} positive={openPnl >= 0} />
        <Stat label="Trades" value={String(stats.totalTrades)} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p
        className={`text-sm font-semibold ${
          positive === undefined
            ? ""
            : positive
              ? "text-[var(--accent)]"
              : "text-[var(--danger)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
