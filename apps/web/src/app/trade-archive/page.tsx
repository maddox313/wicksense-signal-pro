"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trade } from "@wicksense/core";
import { computePerformanceStats, TRADING_CALENDAR_TIMEZONE } from "@wicksense/core";
import { TradeHistoryTable } from "@/components/TradeHistoryTable";
import { formatTradeDate } from "@/lib/trade-format";
import { ArrowLeft, CalendarDays } from "lucide-react";

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

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
        <div className="border-b border-[var(--card-border)] p-4">
          <h2 className="text-sm font-medium">
            {loadingTrades || loadingDates
              ? "Loading…"
              : `${selectedLabel} — ${trades.length} trade${trades.length === 1 ? "" : "s"}`}
          </h2>
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
