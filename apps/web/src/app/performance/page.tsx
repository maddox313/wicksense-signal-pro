"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { computePerformanceStats } from "@wicksense/core";
import { chartSlotLabel } from "@/lib/chart-slots";
import { ArrowRight } from "lucide-react";

const SLOT_ORDER = ["main", "multi-1", "multi-2", "multi-3", "multi-4"];

export default function PerformancePage() {
  const { trades, performance } = useAppStore();
  const stats = performance ?? computePerformanceStats(trades);

  const slotIds = [
    ...new Set([
      ...SLOT_ORDER,
      ...trades.map((t) => t.chartSlot ?? "main"),
    ]),
  ].filter((id) => id === "main" || id.startsWith("multi-"));

  const slotSummaries = slotIds
    .map((id) => {
      const slotTrades = trades.filter((t) => (t.chartSlot ?? "main") === id);
      return { id, label: chartSlotLabel(id), stats: computePerformanceStats(slotTrades) };
    })
    .filter((s) => s.stats.totalTrades > 0);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Performance</h1>
          <p className="text-sm text-[var(--muted)]">Track your trading results across all charts</p>
        </div>
        <Link
          href="/account"
          className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
        >
          View account balances
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Metric label="Total Trades" value={String(stats.totalTrades)} />
        <Metric label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} accent={stats.winRate >= 50} />
        <Metric label="Total P&L" value={`$${stats.totalPnl.toFixed(2)}`} accent={stats.totalPnl >= 0} />
        <Metric label="Profit Factor" value={stats.profitFactor.toFixed(2)} accent={stats.profitFactor >= 1} />
      </div>

      {slotSummaries.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">By Chart</h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {slotSummaries.map(({ id, label, stats: slotStats }) => (
              <div
                key={id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3"
              >
                <p className="mb-2 text-xs font-medium text-[var(--accent)]">{label}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[var(--muted)]">Win Rate</p>
                    <p className="font-semibold">{slotStats.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[var(--muted)]">Trades</p>
                    <p className="font-semibold">{slotStats.totalTrades}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[var(--muted)]">P&L</p>
                    <p
                      className={`font-semibold ${
                        slotStats.totalPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                      }`}
                    >
                      ${slotStats.totalPnl.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
        <h2 className="border-b border-[var(--card-border)] p-4 text-sm font-medium">Trade History</h2>
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
              <th className="p-3">Mode</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-[var(--muted)]">
                  No trades yet. Start paper or live trading from the Chart or Multi-Chart pages.
                </td>
              </tr>
            ) : (
              trades.map((t) => (
                <tr key={t.id} className="border-b border-[var(--card-border)]/50">
                  <td className="p-3 text-[var(--muted)]">{chartSlotLabel(t.chartSlot ?? "main")}</td>
                  <td className="p-3 font-medium">{t.symbol}</td>
                  <td className={`p-3 capitalize ${t.side === "buy" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>{t.side}</td>
                  <td className="p-3">${t.entryPrice.toFixed(2)}</td>
                  <td className="p-3">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
                  <td className={`p-3 ${(t.pnl ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                    {t.pnl !== undefined ? `$${t.pnl.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-3 text-[var(--muted)]">{t.strategy}</td>
                  <td className="p-3 capitalize">{t.mode}</td>
                  <td className="p-3 capitalize">{t.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p>
    </div>
  );
}
