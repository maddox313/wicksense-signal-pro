"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trade } from "@wicksense/core";
import { computePerformanceStats, TRADING_CALENDAR_TIMEZONE } from "@wicksense/core";
import { TradeHistoryTable } from "@/components/TradeHistoryTable";
import { formatTradeDate } from "@/lib/trade-format";
import { ArrowLeft, CalendarDays, Loader2, XCircle } from "lucide-react";

function todayDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TRADING_CALENDAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function TradeArchivePage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayDayKey());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [totalArchived, setTotalArchived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);

  const needsManualCloseCount = useMemo(
    () => trades.filter((t) => t.status === "needs_manual_close").length,
    [trades]
  );

  const loadDates = useCallback(async () => {
    setLoadingDates(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/archive");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load archive dates");
        return [];
      }
      const list = (data.dates ?? []) as string[];
      setDates(list);
      setTotalArchived(data.totalArchived ?? 0);
      return list;
    } catch {
      setError("Could not load archive dates.");
      return [];
    } finally {
      setLoadingDates(false);
    }
  }, []);

  const loadTradesForDate = useCallback(async (date: string) => {
    setLoadingTrades(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/archive?date=${encodeURIComponent(date)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load archived trades");
        return;
      }
      setTrades(data.trades ?? []);
    } catch {
      setError("Could not load archived trades.");
    } finally {
      setLoadingTrades(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await loadDates();
      if (list.length > 0) {
        setSelectedDate((current) => (list.includes(current) ? current : list[0]));
      }
    })();
  }, [loadDates]);

  useEffect(() => {
    if (selectedDate) void loadTradesForDate(selectedDate);
  }, [selectedDate, loadTradesForDate]);

  const dayStats = useMemo(() => computePerformanceStats(trades), [trades]);

  const selectedLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return selectedDate;
    return formatTradeDate(new Date(y, m - 1, d).getTime());
  }, [selectedDate]);

  const closeAllArchived = async () => {
    if (
      !confirm(
        "Close all archived legacy paper trades? This will liquidate at Alpaca when the market is open, or mark them closed at the current market price when it is closed."
      )
    ) {
      return;
    }
    setClosingAll(true);
    setCloseMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/trades/archive/close-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCloseMessage(data.error ?? "Failed to close archived trades");
        return;
      }
      const closed = data.result?.dbClosed?.length ?? 0;
      const broker = data.result?.brokerClosed?.length ?? 0;
      const marked = data.result?.dbMarkedToMarket?.length ?? 0;
      const remaining = data.result?.remainingPositions?.length ?? 0;
      setCloseMessage(
        `Closed ${closed} archive record(s)` +
          (broker > 0 ? ` · ${broker} liquidated at Alpaca` : "") +
          (marked > 0 ? ` · ${marked} marked to market (broker still open — retry when market opens)` : "") +
          (remaining > 0 ? ` · ${remaining} Alpaca position(s) remain` : "")
      );
      const list = await loadDates();
      if (list.length > 0) {
        setSelectedDate((current) => (list.includes(current) ? current : list[0]));
      }
      if (selectedDate) await loadTradesForDate(selectedDate);
    } catch {
      setCloseMessage("Could not close archived trades.");
    } finally {
      setClosingAll(false);
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/performance"
            className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Trade Analysis
          </Link>
          <h1 className="text-xl font-bold">Trade Archive</h1>
          <p className="text-sm text-[var(--muted)]">
            Archived closed trades grouped by close date (Eastern Time). {totalArchived} total archived.
          </p>
        </div>
      </header>

      <div className="mb-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="archive-date" className="mb-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <CalendarDays className="h-3.5 w-3.5" />
              Select date
            </label>
            <input
              id="archive-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>

          {dates.length > 0 && (
            <div className="flex-1">
              <p className="mb-1 text-xs text-[var(--muted)]">Dates with archived trades</p>
              <div className="flex flex-wrap gap-1.5">
                {dates.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      day === selectedDate
                        ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                        : "border border-[var(--card-border)] text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {closeMessage && (
        <p
          className={`mb-4 text-sm ${
            closeMessage.includes("Failed") || closeMessage.includes("Could not")
              ? "text-[var(--danger)]"
              : "text-[var(--accent)]"
          }`}
        >
          {closeMessage}
        </p>
      )}

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
        <div className="border-b border-[var(--card-border)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">
              {loadingTrades || loadingDates
                ? "Loading…"
                : `${selectedLabel} — ${trades.length} trade${trades.length === 1 ? "" : "s"}`}
            </h2>
            {needsManualCloseCount > 0 && (
              <button
                type="button"
                onClick={() => void closeAllArchived()}
                disabled={closingAll}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/20 disabled:opacity-40"
              >
                {closingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {closingAll ? "Closing…" : `Close All Legacy (${needsManualCloseCount})`}
              </button>
            )}
          </div>
          {trades.length > 0 && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Day P&L:{" "}
              <span className={dayStats.totalPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}>
                ${dayStats.totalPnl.toFixed(2)}
              </span>
              {" · "}
              Win rate: {dayStats.winRate.toFixed(1)}%
            </p>
          )}
        </div>

        <TradeHistoryTable
          trades={trades}
          emptyMessage={
            loadingTrades
              ? "Loading archived trades…"
              : `No archived trades for ${selectedLabel}. Archive closed trades from Trade Analysis.`
          }
        />
      </div>
    </div>
  );
}
