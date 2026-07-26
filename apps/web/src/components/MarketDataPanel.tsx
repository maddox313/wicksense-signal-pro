"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { TRADING_TIMEFRAMES } from "@/lib/main-chart-prefs";
import {
  setMainChartRoutingAuto,
  setMainChartRoutingManual,
} from "@/lib/main-chart-routing-client";

export function MarketDataPanel({
  quote,
  dataSource,
}: {
  quote?: { price: number; change: number };
  dataSource?: "live" | "mock" | null;
}) {
  const {
    symbol,
    timeframe,
    tradingStyle,
    mainChartRoutingMode,
    mainChartRoutingReason,
    setSymbol,
    applyServerMainSymbol,
    setMainChartRoutingMeta,
    setTimeframe,
    setTradingStyle,
  } = useAppStore();
  const [draftSymbol, setDraftSymbol] = useState(symbol);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraftSymbol(symbol);
  }, [symbol, editing]);

  const commitManualSymbol = async (raw: string) => {
    const next = raw.trim().toUpperCase();
    setEditing(false);
    if (!next) {
      setDraftSymbol(symbol);
      return;
    }
    if (next === symbol && mainChartRoutingMode === "MANUAL") return;
    setBusy(true);
    try {
      setSymbol(next);
      const state = await setMainChartRoutingManual(next);
      if (state) {
        applyServerMainSymbol(state.mainSymbol);
        setMainChartRoutingMeta({
          mode: state.mode,
          reason: state.lastAssignment?.reason ?? "MANUAL_USER_OVERRIDE",
        });
        setDraftSymbol(state.mainSymbol);
      }
    } finally {
      setBusy(false);
    }
  };

  const returnToAuto = async () => {
    setBusy(true);
    try {
      const state = await setMainChartRoutingAuto();
      if (state) {
        applyServerMainSymbol(state.mainSymbol);
        setMainChartRoutingMeta({
          mode: state.mode,
          reason: state.lastAssignment?.reason ?? "AUTO_BEST_EXECUTABLE",
        });
        setDraftSymbol(state.mainSymbol);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={editing ? draftSymbol : symbol}
          onChange={(e) => setDraftSymbol(e.target.value.toUpperCase())}
          onFocus={() => {
            setEditing(true);
            setDraftSymbol(symbol);
          }}
          onBlur={() => void commitManualSymbol(draftSymbol || symbol)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          disabled={busy}
          className="w-24 rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-lg font-bold uppercase outline-none focus:border-[var(--accent)]"
        />
        {quote && (
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">${quote.price.toFixed(2)}</span>
            <span className={`text-sm ${quote.change >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
              {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}%
            </span>
          </div>
        )}
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${
            dataSource === "live"
              ? "bg-[var(--accent)]/20 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
              : dataSource === "mock"
                ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40"
                : "bg-white/10 text-[var(--muted)]"
          }`}
        >
          {dataSource === "live" ? "● Live Data" : dataSource === "mock" ? "● Mock Data" : "● Loading..."}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${
            mainChartRoutingMode === "MANUAL"
              ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40"
              : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
          }`}
          title={mainChartRoutingReason ?? undefined}
        >
          {mainChartRoutingMode === "MANUAL" ? "Manual" : "Auto"}
          {mainChartRoutingReason === "ACTIVE_TRADE_PIN" ||
          mainChartRoutingReason === "RESTORE_ACTIVE_POSITION"
            ? " · Pinned"
            : ""}
        </span>
        {mainChartRoutingMode === "MANUAL" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void returnToAuto()}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-white/15 hover:text-white disabled:opacity-50"
          >
            Return to AUTO
          </button>
        )}
      </div>

      <div className="mb-3 flex gap-1">
        {TRADING_TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`rounded px-2 py-1 text-xs ${
              timeframe === tf ? "bg-[var(--accent)] text-black" : "bg-white/5 text-[var(--muted)]"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {(["day", "swing"] as const).map((style) => (
          <button
            key={style}
            onClick={() => setTradingStyle(style)}
            className={`flex-1 rounded-lg py-1.5 text-xs capitalize ${
              tradingStyle === style ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 text-[var(--muted)]"
            }`}
          >
            {style} Trade
          </button>
        ))}
      </div>
    </div>
  );
}
