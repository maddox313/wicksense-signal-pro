"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildEquityCurve,
  buildTradePnLSeries,
  computeTodayPerformanceStats,
  evaluateSystemProfitability,
  lossRate,
  statsForTrades,
  type PerformanceStats,
} from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { syncTradesWithAlpaca } from "@/lib/sync-client";
import {
  EquityCurveChart,
  TradePnLBars,
  WinLossChart,
} from "@/components/PerformanceCharts";
import { Activity, ArrowRight, TrendingDown, TrendingUp, Minus } from "lucide-react";

type ModeFilter = "all" | "paper" | "live";

const REFRESH_MS = 15_000;

export default function PerformanceAnalysisPage() {
  const { trades } = useAppStore();
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = async () => {
      await syncTradesWithAlpaca();
      setLastUpdated(new Date());
    };
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const filteredTrades = useMemo(() => {
    if (modeFilter === "all") return trades;
    return trades.filter((t) => t.mode === modeFilter);
  }, [trades, modeFilter]);

  const stats = useMemo(() => statsForTrades(filteredTrades), [filteredTrades]);
  const todayStats = useMemo(
    () => computeTodayPerformanceStats(filteredTrades),
    [filteredTrades]
  );
  const paperStats = useMemo(() => statsForTrades(trades.filter((t) => t.mode === "paper")), [trades]);
  const liveStats = useMemo(() => statsForTrades(trades.filter((t) => t.mode === "live")), [trades]);
  const profitability = useMemo(() => evaluateSystemProfitability(stats), [stats]);
  const equityCurve = useMemo(() => buildEquityCurve(filteredTrades), [filteredTrades]);
  const pnlSeries = useMemo(() => buildTradePnLSeries(filteredTrades), [filteredTrades]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Performance Analysis</h1>
          <p className="text-sm text-[var(--muted)]">
            Closed-trade analytics — updates live as trades close
            {lastUpdated && (
              <span className="ml-2 text-[10px]">
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/performance"
          className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
        >
          View trade history
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <ProfitabilityBanner profitability={profitability} stats={stats} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "paper", "live"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setModeFilter(mode)}
            className={`rounded-lg px-3 py-1.5 text-xs capitalize transition-colors ${
              modeFilter === mode
                ? "bg-[var(--accent)] text-black font-medium"
                : "bg-white/5 text-[var(--muted)] hover:text-white"
            }`}
          >
            {mode === "all" ? "All Trades" : `${mode} Only`}
          </button>
        ))}
        <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-medium text-[var(--accent)]">
          P&L Source: Alpaca Broker Fill Prices
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-9">
        <StatCard label="Today's P&L" value={`$${todayStats.totalPnl.toFixed(2)}`} positive={todayStats.totalPnl >= 0} negative={todayStats.totalPnl < 0} />
        <StatCard label="Closed Today" value={String(todayStats.totalTrades)} />
        <StatCard label="Closed Trades" value={String(stats.totalTrades)} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} positive={stats.winRate >= 50} />
        <StatCard label="Loss Rate" value={`${lossRate(stats).toFixed(1)}%`} negative={lossRate(stats) > 50} />
        <StatCard label="Total P&L" value={`$${stats.totalPnl.toFixed(2)}`} positive={stats.totalPnl >= 0} negative={stats.totalPnl < 0} />
        <StatCard label="Profit Factor" value={stats.profitFactor.toFixed(2)} positive={stats.profitFactor >= 1} />
        <StatCard label="Avg Win" value={`$${stats.avgWin.toFixed(2)}`} positive />
        <StatCard label="Avg Loss" value={`$${stats.avgLoss.toFixed(2)}`} negative />
        <StatCard label="Max Drawdown" value={`$${stats.maxDrawdown.toFixed(2)}`} negative={stats.maxDrawdown > 0} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Cumulative P&L (Closed Trades)">
          <EquityCurveChart points={equityCurve} />
        </ChartCard>
        <ChartCard title="Win vs Loss Distribution">
          <WinLossChart stats={stats} />
        </ChartCard>
      </div>

      <ChartCard title="Per-Trade P&L (Most Recent Closed)" className="mb-6">
        <TradePnLBars trades={pnlSeries} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModeStatsPanel title="Paper Performance" stats={paperStats} />
        <ModeStatsPanel title="Live Performance" stats={liveStats} />
      </div>
    </div>
  );
}

function ProfitabilityBanner({
  profitability,
  stats,
}: {
  profitability: ReturnType<typeof evaluateSystemProfitability>;
  stats: PerformanceStats;
}) {
  const styles = {
    profitable: {
      border: "border-[var(--accent)]/40",
      bg: "bg-[var(--accent)]/10",
      text: "text-[var(--accent)]",
      icon: TrendingUp,
    },
    not_profitable: {
      border: "border-[var(--danger)]/40",
      bg: "bg-[var(--danger)]/10",
      text: "text-[var(--danger)]",
      icon: TrendingDown,
    },
    break_even: {
      border: "border-amber-500/40",
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      icon: Minus,
    },
    insufficient_data: {
      border: "border-[var(--card-border)]",
      bg: "bg-white/5",
      text: "text-[var(--muted)]",
      icon: Activity,
    },
  }[profitability.status];

  const Icon = styles.icon;

  return (
    <div className={`mb-6 flex flex-wrap items-center gap-4 rounded-xl border p-5 ${styles.border} ${styles.bg}`}>
      <Icon className={`h-8 w-8 ${styles.text}`} />
      <div className="flex-1">
        <p className={`text-lg font-bold ${styles.text}`}>System Status: {profitability.label}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{profitability.detail}</p>
      </div>
      {stats.totalTrades > 0 && (
        <div className="text-right text-xs text-[var(--muted)]">
          <p>{stats.winningTrades} wins · {stats.losingTrades} losses</p>
          <p className="mt-1">Based on {stats.totalTrades} closed trade{stats.totalTrades === 1 ? "" : "s"}</p>
        </div>
      )}
    </div>
  );
}

function ModeStatsPanel({ title, stats }: { title: string; stats: PerformanceStats }) {
  const status = evaluateSystemProfitability(stats);

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span
          className={`text-xs font-medium ${
            status.status === "profitable"
              ? "text-[var(--accent)]"
              : status.status === "not_profitable"
                ? "text-[var(--danger)]"
                : "text-[var(--muted)]"
          }`}
        >
          {status.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <StatRow label="Closed Trades" value={String(stats.totalTrades)} />
        <StatRow label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
        <StatRow label="Loss Rate" value={`${lossRate(stats).toFixed(1)}%`} />
        <StatRow label="Total P&L" value={`$${stats.totalPnl.toFixed(2)}`} />
        <StatRow label="Profit Factor" value={stats.profitFactor.toFixed(2)} />
        <StatRow label="Max Drawdown" value={`$${stats.maxDrawdown.toFixed(2)}`} />
      </dl>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-medium text-[var(--muted)]">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${
          positive ? "text-[var(--accent)]" : negative ? "text-[var(--danger)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
