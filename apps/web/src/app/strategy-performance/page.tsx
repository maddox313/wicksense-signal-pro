"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ALL_STRATEGIES,
  computeAccountSyncActivity,
  computeStrategyExtendedBreakdown,
} from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { syncTradesWithAlpaca } from "@/lib/sync-client";
import { lookupUnrealizedForOpenTrade } from "@/lib/alpaca-unrealized-pnl-shared";
import { UnrealizedPnlDisplay } from "@/components/UnrealizedPnlDisplay";
import {
  bootstrapGeneratedFromSignals,
  loadSignalActivities,
  SIGNAL_ACTIVITY_EVENT,
} from "@/lib/signal-activity-store";
import {
  ENGINE_TELEMETRY_EVENT,
  isEngineCurrentlyRunning,
  loadEngineTelemetry,
  mergeStrategyTelemetry,
} from "@/lib/strategy-engine-telemetry";
import { ArrowRight, ListTree, RefreshCw, Activity } from "lucide-react";

type ModeFilter = "all" | "paper" | "live";

const REFRESH_MS = 15_000;

const KNOWN_STRATEGY_IDS = [...ALL_STRATEGIES.map((strategy) => strategy.id), "manual"];

const STRATEGY_LABELS = Object.fromEntries(
  ALL_STRATEGIES.map((strategy) => [strategy.id, strategy.name])
);

function formatStrategyLabel(strategyId: string): string {
  if (strategyId === "manual") return "Manual";
  return STRATEGY_LABELS[strategyId] ?? strategyId;
}

function formatMoney(value: number): string {
  const prefix = value >= 0 ? "$" : "-$";
  return `${prefix}${Math.abs(value).toFixed(2)}`;
}

function formatList(values: string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(", ") : emptyLabel;
}

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export default function StrategyPerformancePage() {
  const { trades, signals, presets, activePresetId, unrealizedPnl } = useAppStore();
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);

  const activePreset =
    presets.find((preset) => preset.id === activePresetId) ?? presets[0];
  const presetStrategyIds = activePreset?.strategies ?? [];

  useEffect(() => {
    bootstrapGeneratedFromSignals(signals);
  }, [signals]);

  useEffect(() => {
    const bump = () => setActivityVersion((value) => value + 1);
    window.addEventListener(SIGNAL_ACTIVITY_EVENT, bump);
    window.addEventListener(ENGINE_TELEMETRY_EVENT, bump);
    return () => {
      window.removeEventListener(SIGNAL_ACTIVITY_EVENT, bump);
      window.removeEventListener(ENGINE_TELEMETRY_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    const refresh = async () => {
      await syncTradesWithAlpaca();
      bootstrapGeneratedFromSignals(useAppStore.getState().signals);
      setLastUpdated(new Date());
      setActivityVersion((value) => value + 1);
    };
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    const telemetryInterval = setInterval(() => setActivityVersion((v) => v + 1), 5000);
    return () => {
      clearInterval(interval);
      clearInterval(telemetryInterval);
    };
  }, []);

  const filteredTrades = useMemo(() => {
    if (modeFilter === "all") return trades;
    return trades.filter((t) => t.mode === modeFilter);
  }, [trades, modeFilter]);

  const activities = useMemo(
    () => loadSignalActivities(),
    [activityVersion, lastUpdated]
  );

  const engineTelemetry = useMemo(
    () => loadEngineTelemetry(),
    [activityVersion, lastUpdated]
  );

  const telemetryOverlay = useMemo(
    () =>
      Object.fromEntries(
        KNOWN_STRATEGY_IDS.map((strategyId) => [
          strategyId,
          mergeStrategyTelemetry(strategyId, presetStrategyIds, engineTelemetry),
        ])
      ),
    [engineTelemetry, presetStrategyIds]
  );

  const rows = useMemo(
    () =>
      computeStrategyExtendedBreakdown(
        filteredTrades,
        activities,
        KNOWN_STRATEGY_IDS,
        telemetryOverlay
      ),
    [filteredTrades, activities, telemetryOverlay]
  );

  const syncActivity = useMemo(
    () => computeAccountSyncActivity(filteredTrades),
    [filteredTrades]
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        openTrades: acc.openTrades + row.openTrades,
        closedTrades: acc.closedTrades + row.closedTrades,
        signalsGenerated: acc.signalsGenerated + row.signalsGenerated,
        signalsRejected: acc.signalsRejected + row.signalsRejected,
        signalsConverted: acc.signalsConverted + row.signalsConverted,
        netPnl: acc.netPnl + row.netPnl,
      }),
      {
        openTrades: 0,
        closedTrades: 0,
        signalsGenerated: 0,
        signalsRejected: 0,
        signalsConverted: 0,
        netPnl: 0,
      }
    );
  }, [rows]);

  const hasStrategyActivity = rows.some(
    (row) =>
      row.openTrades > 0 ||
      row.closedTrades > 0 ||
      row.signalsGenerated > 0 ||
      row.signalsRejected > 0 ||
      row.signalsConverted > 0 ||
      row.totalGeneratedSinceStartup > 0
  );

  const engineRunning = isEngineCurrentlyRunning();
  const activityRecordCount = activities.length;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ListTree className="h-5 w-5 text-[var(--accent)]" />
            <h1 className="text-xl font-bold">Strategy Performance Breakdown</h1>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Signal-generated strategies only — trades, signals, and closed-trade P&amp;L
            {lastUpdated && (
              <span className="ml-2 text-[10px]">
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/performance-analysis"
          className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
        >
          Performance Analysis
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <div className="mb-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold">Strategy Engine Diagnostics</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              engineRunning
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-white/10 text-[var(--muted)]"
            }`}
          >
            {engineRunning ? "Engine running" : "Engine idle / not polling"}
          </span>
        </div>
        <div className="grid gap-3 text-xs text-[var(--muted)] sm:grid-cols-2 lg:grid-cols-4">
          <p>
            Cycles since startup:{" "}
            <span className="text-white">{engineTelemetry.totalCycles}</span>
          </p>
          <p>
            Last cycle:{" "}
            <span className="text-white">
              {formatTimestamp(engineTelemetry.lastCycleCompletedAt)}
            </span>
          </p>
          <p>
            Activity records (local):{" "}
            <span className="text-white">{activityRecordCount}</span>
          </p>
          <p>
            Active preset:{" "}
            <span className="text-white">{activePreset?.name ?? "None loaded"}</span>
          </p>
        </div>
        {engineTelemetry.lastDetectError && (
          <p className="mt-2 text-xs text-[var(--danger)]">
            Last detect error: {engineTelemetry.lastDetectError}
          </p>
        )}
        {engineTelemetry.lastSlotScans.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-[var(--card-border)] pt-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              Recent slot scans
            </p>
            {engineTelemetry.lastSlotScans.slice(0, 4).map((scan) => (
              <p key={`${scan.chartSlot}-${scan.at}`} className="text-[11px] text-[var(--muted)]">
                <span className="text-white">{scan.chartSlot}</span> · {scan.symbol} ·{" "}
                {scan.outcome}
                {scan.detail ? ` — ${scan.detail}` : ""} · {formatTimestamp(scan.at)}
              </p>
            ))}
          </div>
        )}
        {activityRecordCount === 0 && engineTelemetry.totalCycles > 0 && (
          <p className="mt-3 text-xs text-amber-400">
            Engine is polling but no signals recorded yet — strategies may not be matching current
            market bars, or preset may not include firing strategies.
          </p>
        )}
        {engineTelemetry.totalCycles === 0 && (
          <p className="mt-3 text-xs text-amber-400">
            No engine cycles recorded this session. Keep the app open; AutoTradeEngine polls every
            30s.
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "paper", "live"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setModeFilter(mode)}
            className={`rounded-lg px-3 py-1.5 text-xs capitalize ${
              modeFilter === mode
                ? "bg-[var(--accent)] text-black font-medium"
                : "bg-white/5 text-[var(--muted)] hover:text-white"
            }`}
          >
            {mode === "all" ? "All Trades" : mode}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--muted)]">
          Open {totals.openTrades} · Closed {totals.closedTrades} · Signals {totals.signalsGenerated}{" "}
          · Rejected {totals.signalsRejected} · Converted {totals.signalsConverted} · Net{" "}
          <span className={totals.netPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}>
            {formatMoney(totals.netPnl)}
          </span>
        </span>
      </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
          <table className="w-full min-w-[2000px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-white/[0.02] text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-3 py-3 font-medium">Open</th>
                <th className="px-3 py-3 font-medium">Closed</th>
                <th className="px-3 py-3 font-medium">Signals</th>
                <th className="px-3 py-3 font-medium">Rejected</th>
                <th className="px-3 py-3 font-medium">Converted</th>
                <th className="px-3 py-3 font-medium">Since Startup</th>
                <th className="px-3 py-3 font-medium">Last Signal</th>
                <th className="px-3 py-3 font-medium">Last Rejected</th>
                <th className="px-3 py-3 font-medium">Last Converted</th>
                <th className="px-3 py-3 font-medium">Engine</th>
                <th className="px-3 py-3 font-medium">Wins</th>
                <th className="px-3 py-3 font-medium">Losses</th>
                <th className="px-3 py-3 font-medium">Win Rate</th>
                <th className="px-3 py-3 font-medium">Gross Profit</th>
                <th className="px-3 py-3 font-medium">Gross Loss</th>
                <th className="px-3 py-3 font-medium">Net P&amp;L</th>
                <th className="px-3 py-3 font-medium">Avg Win</th>
                <th className="px-3 py-3 font-medium">Avg Loss</th>
                <th className="px-3 py-3 font-medium">Profit Factor</th>
                <th className="px-3 py-3 font-medium">Markets</th>
                <th className="px-4 py-3 font-medium">Timeframes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.strategy}
                  className="border-b border-[var(--card-border)]/50 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{formatStrategyLabel(row.strategy)}</p>
                    <p className="text-[10px] text-[var(--muted)]">{row.strategy}</p>
                  </td>
                  <td className="px-3 py-3">{row.openTrades}</td>
                  <td className="px-3 py-3">{row.closedTrades}</td>
                  <td className="px-3 py-3">{row.signalsGenerated}</td>
                  <td className="px-3 py-3 text-amber-400">{row.signalsRejected}</td>
                  <td className="px-3 py-3 text-[var(--accent)]">{row.signalsConverted}</td>
                  <td className="px-3 py-3">{row.totalGeneratedSinceStartup}</td>
                  <td className="px-3 py-3 text-[var(--muted)]">
                    {formatTimestamp(row.lastSignalAt)}
                  </td>
                  <td className="px-3 py-3 text-[var(--muted)]">
                    {formatTimestamp(row.lastRejectedAt)}
                  </td>
                  <td className="px-3 py-3 text-[var(--muted)]">
                    {formatTimestamp(row.lastConvertedAt)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.engineActive ? "text-[var(--accent)]" : "text-[var(--muted)]"
                      }
                    >
                      {row.engineActive ? "Active" : "Idle"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[var(--accent)]">{row.wins}</td>
                  <td className="px-3 py-3 text-[var(--danger)]">{row.losses}</td>
                  <td className="px-3 py-3">{row.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-[var(--accent)]">{formatMoney(row.grossProfit)}</td>
                  <td className="px-3 py-3 text-[var(--danger)]">{formatMoney(row.grossLoss)}</td>
                  <td
                    className={`px-3 py-3 font-semibold ${
                      row.netPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {formatMoney(row.netPnl)}
                  </td>
                  <td className="px-3 py-3">{formatMoney(row.avgWin)}</td>
                  <td className="px-3 py-3">{formatMoney(row.avgLoss)}</td>
                  <td className="px-3 py-3">
                    {row.grossLoss === 0 && row.grossProfit > 0
                      ? "∞"
                      : row.profitFactor.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-[var(--muted)]">
                    {formatList(row.markets, "—")}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {formatList(row.timeframes, "Not recorded")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      {!hasStrategyActivity && (
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          All strategies listed — activity will populate as signals fire and trades open or close.
        </p>
      )}

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-[var(--muted)]" />
              <h2 className="text-lg font-semibold">Account Sync Activity</h2>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Alpaca position imports and reconciliation closes — excluded from strategy stats
            </p>
          </div>
          {syncActivity.summary.totalRecords > 0 && (
            <p className="text-xs text-[var(--muted)]">
              {syncActivity.summary.totalRecords} records · {syncActivity.summary.openRecords} open ·{" "}
              {syncActivity.summary.closedRecords} closed · Reconciliation P&amp;L{" "}
              <span
                className={
                  syncActivity.summary.netPnl >= 0
                    ? "text-[var(--accent)]"
                    : "text-[var(--danger)]"
                }
              >
                {formatMoney(syncActivity.summary.netPnl)}
              </span>
            </p>
          )}
        </div>

        {syncActivity.records.length === 0 ? (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
            <p className="text-sm text-[var(--muted)]">No Alpaca sync records for this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--card-border)] bg-white/[0.02] text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-3 py-3 font-medium">Side</th>
                  <th className="px-3 py-3 font-medium">Mode</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Activity</th>
                  <th className="px-3 py-3 font-medium">Qty</th>
                  <th className="px-3 py-3 font-medium">P&amp;L</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {syncActivity.records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-[var(--card-border)]/50 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-medium text-white">{record.symbol}</td>
                    <td className="px-3 py-3 capitalize">{record.side}</td>
                    <td className="px-3 py-3 capitalize">{record.mode}</td>
                    <td className="px-3 py-3 capitalize">{record.status}</td>
                    <td className="px-3 py-3 text-[var(--muted)]">{record.label}</td>
                    <td className="px-3 py-3">{record.quantity}</td>
                    <td className="px-3 py-3">
                      {record.status === "open" ? (
                        <UnrealizedPnlDisplay
                          position={lookupUnrealizedForOpenTrade(
                            record,
                            record.mode === "live" ? unrealizedPnl.live : unrealizedPnl.paper
                          )}
                        />
                      ) : record.pnl === undefined ? (
                        <span className="text-[var(--muted)]">—</span>
                      ) : (
                        <span
                          className={
                            record.pnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                          }
                        >
                          {formatMoney(record.pnl)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatTimestamp(record.exitTime ?? record.entryTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Signal telemetry persists in this browser (localStorage + session). &quot;Since Startup&quot;
        counts each bar-level signal detection this session. Engine Active = strategy is in the
        active preset and the auto-trade engine polled within the last ~65s.
      </p>
    </div>
  );
}
