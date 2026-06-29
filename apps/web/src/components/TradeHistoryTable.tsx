"use client";

import type { Trade } from "@wicksense/core";
import { Archive } from "lucide-react";
import { chartSlotLabel } from "@/lib/chart-slots";
import { formatTradeDate, formatTradeTime } from "@/lib/trade-format";
import {
  lookupUnrealizedForOpenTrade,
  type ModeUnrealizedPnlSnapshot,
} from "@/lib/alpaca-unrealized-pnl-shared";
import { UnrealizedPnlDisplay } from "@/components/UnrealizedPnlDisplay";

interface TradeHistoryTableProps {
  trades: Trade[];
  emptyMessage: string;
  showArchiveAction?: boolean;
  archivingId?: string | null;
  onArchive?: (tradeId: string) => void;
  unrealizedSnapshot?: ModeUnrealizedPnlSnapshot | null;
}

export function TradeHistoryTable({
  trades,
  emptyMessage,
  showArchiveAction = false,
  archivingId = null,
  onArchive,
  unrealizedSnapshot = null,
}: TradeHistoryTableProps) {
  const colSpan = showArchiveAction ? 11 : 10;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
            <th className="p-3">Chart</th>
            <th className="p-3">Symbol</th>
            <th className="p-3">Side</th>
            <th className="p-3">Entry Date</th>
            <th className="p-3">Entry Time</th>
            <th className="p-3">Entry $</th>
            <th className="p-3">Exit $</th>
            <th className="p-3">P&L</th>
            <th className="p-3">Strategy</th>
            <th className="p-3">Status</th>
            {showArchiveAction && <th className="p-3">Archive</th>}
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="p-8 text-center text-[var(--muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            trades.map((t) => (
              <tr key={t.id} className="border-b border-[var(--card-border)]/50">
                <td className="p-3 text-[var(--muted)]">{chartSlotLabel(t.chartSlot ?? "main")}</td>
                <td className="p-3 font-medium">{t.symbol}</td>
                <td
                  className={`p-3 capitalize ${t.side === "buy" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
                >
                  {t.side}
                </td>
                <td className="p-3 whitespace-nowrap text-[var(--muted)]">{formatTradeDate(t.entryTime)}</td>
                <td className="p-3 whitespace-nowrap text-[var(--muted)]">{formatTradeTime(t.entryTime)}</td>
                <td className="p-3">${t.entryPrice.toFixed(2)}</td>
                <td className="p-3">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
                <td className="p-3">
                  {t.status === "closed" && t.pnl !== undefined ? (
                    <span
                      className={
                        (t.pnl ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                      }
                    >
                      ${t.pnl.toFixed(2)}
                    </span>
                  ) : (
                    <UnrealizedPnlDisplay
                      position={lookupUnrealizedForOpenTrade(t, unrealizedSnapshot)}
                    />
                  )}
                </td>
                <td className="p-3 text-[var(--muted)]">{t.strategy}</td>
                <td className="p-3 capitalize">{t.status}</td>
                {showArchiveAction && (
                  <td className="p-3">
                    {t.status === "closed" ? (
                      <button
                        type="button"
                        onClick={() => onArchive?.(t.id)}
                        disabled={archivingId === t.id}
                        title="Archive this trade"
                        className="flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] disabled:opacity-40"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {archivingId === t.id ? "…" : "Archive"}
                      </button>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
