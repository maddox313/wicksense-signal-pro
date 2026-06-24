"use client";

import Link from "next/link";
import { useState } from "react";
import type { Trade } from "@wicksense/core";
import { computePerformanceStats, type PerformanceStats } from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { chartSlotLabel } from "@/lib/chart-slots";
import { ArrowRight, Trash2 } from "lucide-react";

function lossRate(stats: PerformanceStats): number {
  return stats.totalTrades ? (stats.losingTrades / stats.totalTrades) * 100 : 0;
}

export default function PerformancePage() {
  const { trades, setTrades, setPerformance, clearMarkers, resetSafetyStop, multiChartSlots, updateMultiChartSlot, clearMultiChartMarkers } =
    useAppStore();
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  const paperTrades = trades.filter((t) => t.mode === "paper");
  const liveTrades = trades.filter((t) => t.mode === "live");
  const paperStats = computePerformanceStats(paperTrades);
  const liveStats = computePerformanceStats(liveTrades);

  const clearPaperTrades = async () => {
    if (
      !window.confirm(
        "Delete all paper trades and reset paper performance stats, chart markers, and safety stops across the app?"
      )
    ) {
      return;
    }

    setClearing(true);
    setClearMessage(null);
    try {
      const res = await fetch("/api/trades/clear-paper", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setClearMessage(data.error ?? "Failed to clear paper trades");
        return;
      }

      setTrades(data.trades ?? []);
      setPerformance(data.performance ?? computePerformanceStats(data.trades ?? []));
      clearMarkers();
      resetSafetyStop();
      for (const slot of multiChartSlots) {
        clearMultiChartMarkers(slot.id);
        updateMultiChartSlot(slot.id, { safetyStopActive: false, consecutiveLosses: 0 });
      }

      setClearMessage(
        data.deleted > 0
          ? `Cleared ${data.deleted} paper trade${data.deleted === 1 ? "" : "s"}.`
          : "No paper trades to clear."
      );
    } catch {
      setClearMessage("Could not clear paper trades.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Trade Analysis</h1>
          <p className="text-sm text-[var(--muted)]">Paper and live trade history by account type</p>
        </div>
        <Link
          href="/performance-analysis"
          className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
        >
          View performance analysis
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <TradeModeSection
        title="Paper Trades"
        trades={paperTrades}
        modeStats={paperStats}
        onClear={clearPaperTrades}
        clearing={clearing}
        clearMessage={clearMessage}
      />

      <TradeModeSection title="Live Trades" trades={liveTrades} modeStats={liveStats} className="mt-8" />
    </div>
  );
}

function TradeModeSection({
  title,
  trades,
  modeStats,
  onClear,
  clearing,
  clearMessage,
  className = "",
}: {
  title: string;
  trades: Trade[];
  modeStats: PerformanceStats;
  onClear?: () => void;
  clearing?: boolean;
  clearMessage?: string | null;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[var(--card-border)] bg-[var(--card)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] p-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {onClear && (
          <button
            type="button"
            onClick={() => void onClear()}
            disabled={clearing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/20 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {clearing ? "Clearing..." : "Clear Paper Trades"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--card-border)] p-4 md:grid-cols-5">
        <Metric label="Total Trades" value={String(modeStats.totalTrades)} compact />
        <Metric label="Win Rate" value={`${modeStats.winRate.toFixed(1)}%`} accent={modeStats.winRate >= 50} compact />
        <Metric label="Loss Rate" value={`${lossRate(modeStats).toFixed(1)}%`} danger={lossRate(modeStats) > 50} compact />
        <Metric label="Total P&L" value={`$${modeStats.totalPnl.toFixed(2)}`} accent={modeStats.totalPnl >= 0} compact />
        <Metric label="Profit Factor" value={modeStats.profitFactor.toFixed(2)} accent={modeStats.profitFactor >= 1} compact />
      </div>

      {clearMessage && onClear && (
        <p
          className={`border-b border-[var(--card-border)] px-4 py-2 text-xs ${
            clearMessage.includes("Cleared") || clearMessage.includes("No paper")
              ? "text-[var(--accent)]"
              : "text-[var(--danger)]"
          }`}
        >
          {clearMessage}
        </p>
      )}

      <TradeHistoryTable trades={trades} emptyMessage={`No ${title.toLowerCase()} yet.`} />
    </div>
  );
}

function TradeHistoryTable({ trades, emptyMessage }: { trades: Trade[]; emptyMessage: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
          <th className="p-3">Chart</th>
          <th className="p-3">Symbol</th>
          <th className="p-3">Side</th>
          <th className="p-3">Entry</th>
          <th className="p-3">Exit</th>
          <th className="p-3">P&L</th>
          <th className="p-3">Strategy</th>
          <th className="p-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {trades.length === 0 ? (
          <tr>
            <td colSpan={8} className="p-8 text-center text-[var(--muted)]">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          trades.map((t) => (
            <tr key={t.id} className="border-b border-[var(--card-border)]/50">
              <td className="p-3 text-[var(--muted)]">{chartSlotLabel(t.chartSlot ?? "main")}</td>
              <td className="p-3 font-medium">{t.symbol}</td>
              <td className={`p-3 capitalize ${t.side === "buy" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                {t.side}
              </td>
              <td className="p-3">${t.entryPrice.toFixed(2)}</td>
              <td className="p-3">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
              <td className={`p-3 ${(t.pnl ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                {t.pnl !== undefined ? `$${t.pnl.toFixed(2)}` : "—"}
              </td>
              <td className="p-3 text-[var(--muted)]">{t.strategy}</td>
              <td className="p-3 capitalize">{t.status}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function Metric({
  label,
  value,
  accent,
  danger,
  compact = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div>
        <p className="text-[10px] text-[var(--muted)]">{label}</p>
        <p
          className={`mt-0.5 text-lg font-bold ${
            accent ? "text-[var(--accent)]" : danger ? "text-[var(--danger)]" : ""
          }`}
        >
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          accent ? "text-[var(--accent)]" : danger ? "text-[var(--danger)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
