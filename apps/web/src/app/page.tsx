"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { formatUsd } from "@/lib/account-utils";
import { TrendingUp, Shield, Zap, BarChart3, Wallet } from "lucide-react";

interface AccountSnapshot {
  equity: number;
  cash: number;
  buyingPower: number;
}

interface BalanceResponse {
  live: {
    configured: boolean;
    connected: boolean;
    account: AccountSnapshot | null;
    error: string | null;
  };
  updatedAt: string;
}

export default function DashboardPage() {
  const { performance, safetyStopActive, autoTradeEnabled, mode, trades } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [liveBalance, setLiveBalance] = useState<BalanceResponse | null>(null);

  const fetchLiveBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/account/balances");
      if (!res.ok) return;
      setLiveBalance(await res.json());
    } catch {
      setLiveBalance(null);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void fetchLiveBalance();
  }, [fetchLiveBalance]);

  const openTrades = trades.filter((t) => t.status === "open").length;

  const live = liveBalance?.live;
  const liveEquity = live?.connected && live.account ? live.account.equity : null;
  const liveBalanceLabel =
    !mounted || !liveBalance
      ? "—"
      : !live?.configured
        ? "Not configured"
        : !live.connected
          ? "Disconnected"
          : formatUsd(liveEquity ?? 0);
  const liveBalanceColor: "accent" | "danger" | "muted" =
    !live?.connected || !live?.configured ? "muted" : "accent";

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold">WickSense Signal Pro</h1>
        <p className="text-sm text-[var(--muted)]">
          Intelligent trade detection for day and swing traders
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Link href="/account" className="block transition-opacity hover:opacity-90">
          <StatCard
            icon={Wallet}
            label="Live Balance"
            value={liveBalanceLabel}
            color={liveBalanceColor}
            subtitle={
              live?.connected && live.account
                ? `Cash ${formatUsd(live.account.cash)}`
                : live?.error ?? undefined
            }
          />
        </Link>
        <StatCard
          icon={TrendingUp}
          label="Win Rate"
          value={mounted && performance ? `${performance.winRate.toFixed(1)}%` : "—"}
          color="accent"
        />
        <StatCard
          icon={BarChart3}
          label="Total P&L"
          value={mounted && performance ? `$${performance.totalPnl.toFixed(2)}` : "—"}
          color={performance && performance.totalPnl >= 0 ? "accent" : "danger"}
        />
        <StatCard
          icon={Zap}
          label="Open Trades"
          value={String(openTrades)}
          color="accent"
        />
        <StatCard
          icon={Shield}
          label="Safety Stop"
          value={safetyStopActive ? "ACTIVE" : "OK"}
          color={safetyStopActive ? "danger" : "accent"}
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 text-lg font-medium">Quick Start</h2>
          <div className="grid grid-cols-2 gap-4">
            <QuickLink href="/chart" title="Open Chart" desc="Analyze signals with full TradingView-style tools" />
            <QuickLink href="/scanner" title="Market Scanner" desc="Scan watchlist for buy/sell opportunities" />
            <QuickLink href="/backtest" title="Backtest" desc="Test strategies on historical data" />
            <QuickLink href="/account" title="Account" desc="Paper & live balances synced with Alpaca" />
            <QuickLink href="/settings" title="Configure" desc="Set risk limits, alerts, and broker API" />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 text-lg font-medium">System Status</h2>
          <dl className="space-y-3 text-sm">
            <StatusRow label="Trading Mode" value={mode} />
            <StatusRow label="Auto Trade" value={autoTradeEnabled ? "Enabled" : "Disabled"} />
            <StatusRow
              label="Live Account"
              value={
                live?.connected && liveEquity !== null ? formatUsd(liveEquity) : "Not connected"
              }
            />
            <StatusRow label="Broker" value="Alpaca" />
            <StatusRow label="Markets" value="US Equities + ETFs" />
          </dl>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: "accent" | "danger" | "muted";
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="mb-2 flex items-center gap-2 text-[var(--muted)]">
        <Icon className={`h-4 w-4 text-[var(--${color})]`} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold text-[var(--${color})]`}>{value}</p>
      {subtitle && (
        <p className="mt-1 truncate text-[10px] text-[var(--muted)]" title={subtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--card-border)] bg-white/5 p-4 transition-colors hover:border-[var(--accent)]/50"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{desc}</p>
    </Link>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}
