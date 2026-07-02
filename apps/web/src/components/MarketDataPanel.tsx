"use client";

import { useAppStore } from "@/lib/store";
import { TRADING_TIMEFRAMES } from "@/lib/main-chart-prefs";

export function MarketDataPanel({
  quote,
  dataSource,
}: {
  quote?: { price: number; change: number };
  dataSource?: "live" | "mock" | null;
}) {
  const { symbol, timeframe, tradingStyle, setSymbol, setTimeframe, setTradingStyle } = useAppStore();

  const timeframes = TRADING_TIMEFRAMES;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
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
      </div>

      <div className="mb-3 flex gap-1">
        {timeframes.map((tf) => (
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
