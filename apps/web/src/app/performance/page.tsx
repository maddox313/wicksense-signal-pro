"use client";

import Link from "next/link";
import { useState } from "react";
import {
  computeTodayPerformanceStats,
  computeTradeAnalysisStats,
  type PerformanceStats,
} from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import {
  UNREALIZED_PNL_TOOLTIP,
  type ModeUnrealizedPnlSnapshot,
} from "@/lib/alpaca-unrealized-pnl-shared";
import { TradeHistoryTable } from "@/components/TradeHistoryTable";
import { ArrowRight, Archive, Trash2 } from "lucide-react";

export default function PerformancePage() {
  const {
    trades,
    unrealizedPnl,
    setTrades,
    setPerformance,
    clearMarkers,
    resetSafetyStop,
    multiChartSlots,
    updateMultiChartSlot,
    clearMultiChartMarkers,
  } = useAppStore();
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archivingAll, setArchivingAll] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);

  const paperTrades = trades.filter((t) => t.mode === "paper");
  const liveTrades = trades.filter((t) => t.mode === "live");
  const paperStats = computeTradeAnalysisStats(paperTrades);
  const liveStats = computeTradeAnalysisStats(liveTrades);
  const paperTodayStats = computeTodayPerformanceStats(paperTrades);
  const liveTodayStats = computeTodayPerformanceStats(liveTrades);

  const paperClosedCount = paperTrades.filter((t) => t.status === "closed").length;

  const applyTradeUpdate = (data: { trades?: typeof trades; performance?: ReturnType<typeof computeTradeAnalysisStats> }) => {
    setTrades(data.trades ?? []);
    if (data.performance) setPerformance(data.performance);
  };

  const archiveTrade = async (tradeId: string) => {
    setArchivingId(tradeId);
    setArchiveMessage(null);
    try {
      const res = await fetch("/api/trades/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeIds: [tradeId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setArchiveMessage(data.error ?? "Failed to archive trade");
        return;
      }
      applyTradeUpdate(data);
      setArchiveMessage(
        data.archived > 0 ? "Trade archived. View it on the Trade Archive page." : "Nothing to archive."
      );
    } catch {
      setArchiveMessage("Could not archive trade.");
    } finally {
      setArchivingId(null);
    }
  };

  const archiveAllClosedPaper = async () => {
    if (paperClosedCount === 0) return;
    if (!window.confirm(`Archive all ${paperClosedCount} closed paper trades? They will move to Trade Archive.`)) {
      return;
    }

    setArchivingAll(true);
    setArchiveMessage(null);
    try {
      const res = await fetch("/api/trades/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveAllClosed: true, mode: "paper" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setArchiveMessage(data.error ?? "Failed to archive trades");
        return;
      }
      applyTradeUpdate(data);
      setArchiveMessage(
        data.archived > 0
          ? `Archived ${data.archived} closed paper trade${data.archived === 1 ? "" : "s"}.`
          : "No closed paper trades to archive."
      );
    } catch {
      setArchiveMessage("Could not archive trades.");
    } finally {
      setArchivingAll(false);
    }
  };

  const clearPaperTrades = async () => {
    if (
      !window.confirm(
        "Delete all active paper trades and reset paper performance stats, chart markers, and safety stops? Archived trades are kept."
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

      applyTradeUpdate(data);
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
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/trade-archive"
            className="flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
          >
            <Archive className="h-4 w-4" />
            Trade Archive
          </Link>
          <Link
            href="/performance-analysis"
            className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            View performance analysis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <TradeModeSection
        title="Paper Trades"
        trades={paperTrades}
        modeStats={paperStats}
        todayStats={paperTodayStats}
        unrealizedSnapshot={unrealizedPnl.paper}
        onClear={clearPaperTrades}
        clearing={clearing}
        clearMessage={clearMessage}
        closedCount={paperClosedCount}
        onArchiveAllClosed={archiveAllClosedPaper}
        archivingAll={archivingAll}
        archiveMessage={archiveMessage}
        archivingId={archivingId}
        onArchive={archiveTrade}
      />

      <TradeModeSection
        title="Live Trades"
        trades={liveTrades}
        modeStats={liveStats}
        todayStats={liveTodayStats}
        unrealizedSnapshot={unrealizedPnl.live}
        className="mt-8"
      />
    </div>
  );
}

function TradeModeSection({
  title,
  trades,
  modeStats,
  todayStats,
  unrealizedSnapshot,
  onClear,
  clearing,
  clearMessage,
  closedCount = 0,
  onArchiveAllClosed,
  archivingAll,
  archiveMessage,
  archivingId,
  onArchive,
  className = "",
}: {
  title: string;
  trades: ReturnType<typeof useAppStore.getState>["trades"];
  modeStats: PerformanceStats;
  todayStats: PerformanceStats;
  unrealizedSnapshot: ModeUnrealizedPnlSnapshot;
  onClear?: () => void;
  clearing?: boolean;
  clearMessage?: string | null;
  closedCount?: number;
  onArchiveAllClosed?: () => void;
  archivingAll?: boolean;
  archiveMessage?: string | null;
  archivingId?: string | null;
  onArchive?: (tradeId: string) => void;
  className?: string;
}) {
  const showArchive = Boolean(onArchive);
  const openUnrealizedPl = unrealizedSnapshot.skipped ? 0 : unrealizedSnapshot.totalUnrealizedPl;

  return (
    <div className={`rounded-xl border border-[var(--card-border)] bg-[var(--card)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] p-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {onArchiveAllClosed && closedCount > 0 && (
            <button
              type="button"
              onClick={() => void onArchiveAllClosed()}
              disabled={archivingAll}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] disabled:opacity-40"
            >
              <Archive className="h-3.5 w-3.5" />
              {archivingAll ? "Archiving..." : `Archive Closed (${closedCount})`}
            </button>
          )}
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
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--card-border)] p-4 md:grid-cols-4 lg:grid-cols-7">
        <Metric label="Today's P&L" value={`$${todayStats.totalPnl.toFixed(2)}`} accent={todayStats.totalPnl >= 0} danger={todayStats.totalPnl < 0} compact />
        <Metric label="Closed Today" value={String(todayStats.totalTrades)} compact />
        <Metric label="Total Trades" value={String(modeStats.totalTrades)} compact />
        <Metric
          label="Open Unrealized P&L"
          value={`$${openUnrealizedPl.toFixed(2)}`}
          accent={openUnrealizedPl >= 0}
          danger={openUnrealizedPl < 0}
          compact
          title={UNREALIZED_PNL_TOOLTIP}
        />
        <Metric label="Win Rate" value={`${modeStats.winRate.toFixed(1)}%`} accent={modeStats.winRate >= 50} compact />
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

      {archiveMessage && showArchive && (
        <p
          className={`border-b border-[var(--card-border)] px-4 py-2 text-xs ${
            archiveMessage.includes("Failed") || archiveMessage.includes("Could not")
              ? "text-[var(--danger)]"
              : "text-[var(--accent)]"
          }`}
        >
          {archiveMessage}
        </p>
      )}

      <TradeHistoryTable
        trades={trades}
        emptyMessage={`No ${title.toLowerCase()} yet.`}
        showArchiveAction={showArchive}
        archivingId={archivingId}
        onArchive={onArchive}
        unrealizedSnapshot={unrealizedSnapshot}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  danger,
  compact = false,
  title,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
  compact?: boolean;
  title?: string;
}) {
  if (compact) {
    return (
      <div title={title}>
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
