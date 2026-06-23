"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { computePerformanceStats } from "@wicksense/core";
import type { LiveTradingSettings } from "@wicksense/core";
import { DEFAULT_STARTING_BALANCE, formatUsd } from "@/lib/account-utils";
import {
  Wallet,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Shield,
} from "lucide-react";

interface AccountSnapshot {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  currency: string;
  status: string;
}

interface BalanceResponse {
  paper: {
    configured: boolean;
    connected: boolean;
    account: AccountSnapshot | null;
    error: string | null;
  };
  live: {
    configured: boolean;
    connected: boolean;
    account: AccountSnapshot | null;
    error: string | null;
  };
  updatedAt: string;
}

interface LivePosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  market_value: string;
}

interface LiveStopOrder {
  id: string;
  symbol: string;
  qty: string;
  type: string;
  stop_price?: string;
  status: string;
}

interface LiveTradingResponse {
  configured: boolean;
  settings: LiveTradingSettings;
  positions: LivePosition[];
  stopOrders: LiveStopOrder[];
  error?: string;
  updatedAt?: string;
}

export default function AccountPage() {
  const { trades, performance } = useAppStore();
  const [balances, setBalances] = useState<BalanceResponse | null>(null);
  const [liveTrading, setLiveTrading] = useState<LiveTradingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingLiveSettings, setSavingLiveSettings] = useState(false);
  const [liveSettingsMessage, setLiveSettingsMessage] = useState<string | null>(null);

  const stats = performance ?? computePerformanceStats(trades);
  const paperTrades = trades.filter((t) => t.mode === "paper");
  const liveTrades = trades.filter((t) => t.mode === "live");
  const paperStats = computePerformanceStats(paperTrades);
  const liveStats = computePerformanceStats(liveTrades);

  const fetchBalances = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [balanceRes, liveRes] = await Promise.all([
        fetch("/api/account/balances"),
        fetch("/api/account/live-trading"),
      ]);
      setBalances(await balanceRes.json());
      setLiveTrading(await liveRes.json());
    } catch {
      setBalances(null);
      setLiveTrading(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const saveLiveSettings = async (updates: Partial<LiveTradingSettings>) => {
    setSavingLiveSettings(true);
    setLiveSettingsMessage(null);
    try {
      const res = await fetch("/api/account/live-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveSettingsMessage(data.error ?? "Failed to save");
        return;
      }
      setLiveTrading((prev) =>
        prev ? { ...prev, settings: data.settings } : prev
      );
      setLiveSettingsMessage("Live stop-loss settings saved");
    } catch {
      setLiveSettingsMessage("Failed to save settings");
    } finally {
      setSavingLiveSettings(false);
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(() => fetchBalances(true), 30000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  const paperEquity = balances?.paper.connected
    ? balances.paper.account!.equity
    : DEFAULT_STARTING_BALANCE + paperStats.totalPnl;

  const liveEquity = balances?.live.connected
    ? balances.live.account!.equity
    : null;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Account</h1>
          <p className="text-sm text-[var(--muted)]">
            Paper and live balances synced with Alpaca when keys are configured
          </p>
        </div>
        <button
          onClick={() => fetchBalances(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BalanceCard
          title="Paper Account"
          subtitle="Simulated & Alpaca paper trading"
          loading={loading}
          connected={balances?.paper.connected ?? false}
          configured={balances?.paper.configured ?? false}
          error={balances?.paper.error}
          equity={paperEquity}
          cash={
            balances?.paper.connected
              ? balances.paper.account!.cash
              : paperEquity
          }
          buyingPower={
            balances?.paper.connected
              ? balances.paper.account!.buyingPower
              : paperEquity
          }
          sessionPnl={paperStats.totalPnl}
          source={balances?.paper.connected ? "alpaca" : "simulated"}
        />
        <BalanceCard
          title="Live Account"
          subtitle="Real money — Alpaca live trading"
          loading={loading}
          connected={balances?.live.connected ?? false}
          configured={balances?.live.configured ?? false}
          error={balances?.live.error}
          equity={liveEquity}
          cash={balances?.live.connected ? balances.live.account!.cash : null}
          buyingPower={
            balances?.live.connected ? balances.live.account!.buyingPower : null
          }
          sessionPnl={liveStats.totalPnl}
          source={balances?.live.connected ? "alpaca" : "unconfigured"}
        />
      </div>

      <LiveStopLossSection
        loading={loading}
        liveConnected={balances?.live.connected ?? false}
        liveConfigured={liveTrading?.configured ?? false}
        settings={liveTrading?.settings}
        positions={liveTrading?.positions ?? []}
        stopOrders={liveTrading?.stopOrders ?? []}
        error={liveTrading?.error}
        saving={savingLiveSettings}
        saveMessage={liveSettingsMessage}
        onSave={saveLiveSettings}
      />

      <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Performance Summary</h2>
            <p className="text-xs text-[var(--muted)]">
              Same totals as the Performance page — all charts and trade modes combined
            </p>
          </div>
          <Link
            href="/performance"
            className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            View full trade history
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <PerfMetric
            label="Total P&L"
            value={formatUsd(stats.totalPnl)}
            positive={stats.totalPnl >= 0}
          />
          <PerfMetric
            label="Profit Factor"
            value={stats.profitFactor.toFixed(2)}
            positive={stats.profitFactor >= 1}
          />
          <PerfMetric
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            positive={stats.winRate >= 50}
          />
          <PerfMetric label="Total Trades" value={String(stats.totalTrades)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--card-border)] pt-4 md:grid-cols-2">
          <ModeBreakdown label="Paper session P&L" stats={paperStats} />
          <ModeBreakdown label="Live session P&L" stats={liveStats} />
        </div>
      </section>

      {balances?.updatedAt && (
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          Balances last synced {new Date(balances.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function BalanceCard({
  title,
  subtitle,
  loading,
  connected,
  configured,
  error,
  equity,
  cash,
  buyingPower,
  sessionPnl,
  source,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  connected: boolean;
  configured: boolean;
  error: string | null | undefined;
  equity: number | null;
  cash: number | null;
  buyingPower: number | null;
  sessionPnl: number;
  source: "alpaca" | "simulated" | "unconfigured";
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]/15">
            <Wallet className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="font-medium">{title}</h2>
            <p className="text-xs text-[var(--muted)]">{subtitle}</p>
          </div>
        </div>
        <SourceBadge source={source} connected={connected} configured={configured} />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Loading balance...</p>
      ) : source === "unconfigured" ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Live keys not configured
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Add your Alpaca live API keys in{" "}
            <Link href="/settings" className="text-[var(--accent)] hover:underline">
              Settings
            </Link>{" "}
            to sync your real account balance.
          </p>
          {sessionPnl !== 0 && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              In-app live trades this session:{" "}
              <span className={sessionPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}>
                {formatUsd(sessionPnl)}
              </span>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold">{equity !== null ? formatUsd(equity) : "—"}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Account equity</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Cash</dt>
              <dd className="font-medium">{cash !== null ? formatUsd(cash) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Buying Power</dt>
              <dd className="font-medium">
                {buyingPower !== null ? formatUsd(buyingPower) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Session P&L</dt>
              <dd
                className={`font-medium ${
                  sessionPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                }`}
              >
                {formatUsd(sessionPnl)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Source</dt>
              <dd className="font-medium capitalize">{source}</dd>
            </div>
          </dl>

          {error && !connected && (
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--danger)]">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SourceBadge({
  source,
  connected,
  configured,
}: {
  source: string;
  connected: boolean;
  configured: boolean;
}) {
  if (source === "alpaca" && connected) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] text-[var(--accent)]">
        <CheckCircle className="h-3 w-3" />
        Alpaca synced
      </span>
    );
  }
  if (source === "simulated") {
    return (
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[var(--muted)]">
        Simulated
      </span>
    );
  }
  if (!configured) {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
        Not connected
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--danger)]/15 px-2 py-0.5 text-[10px] text-[var(--danger)]">
      Sync error
    </span>
  );
}

function PerfMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-white/5 p-4">
      <div className="mb-1 flex items-center gap-1 text-xs text-[var(--muted)]">
        {label === "Total P&L" && <TrendingUp className="h-3 w-3" />}
        {label}
      </div>
      <p
        className={`text-xl font-bold ${
          positive === undefined ? "" : positive ? "text-[var(--accent)]" : "text-[var(--danger)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ModeBreakdown({
  label,
  stats,
}: {
  label: string;
  stats: ReturnType<typeof computePerformanceStats>;
}) {
  return (
    <div className="rounded-lg bg-white/5 p-3 text-sm">
      <p className="mb-2 text-xs font-medium text-[var(--muted)]">{label}</p>
      <div className="flex flex-wrap gap-4">
        <span>
          P&L:{" "}
          <strong className={stats.totalPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}>
            {formatUsd(stats.totalPnl)}
          </strong>
        </span>
        <span>
          Win rate: <strong>{stats.winRate.toFixed(1)}%</strong>
        </span>
        <span>
          Trades: <strong>{stats.totalTrades}</strong>
        </span>
      </div>
    </div>
  );
}

function LiveStopLossSection({
  loading,
  liveConnected,
  liveConfigured,
  settings,
  positions,
  stopOrders,
  error,
  saving,
  saveMessage,
  onSave,
}: {
  loading: boolean;
  liveConnected: boolean;
  liveConfigured: boolean;
  settings?: LiveTradingSettings;
  positions: LivePosition[];
  stopOrders: LiveStopOrder[];
  error?: string;
  saving: boolean;
  saveMessage: string | null;
  onSave: (updates: Partial<LiveTradingSettings>) => void;
}) {
  const stopBySymbol = new Map(stopOrders.map((o) => [o.symbol, o]));

  return (
    <section className="mb-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--danger)]/15">
          <Shield className="h-5 w-5 text-[var(--danger)]" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Live Stop-Loss Protection</h2>
          <p className="text-sm text-[var(--muted)]">
            Broker-side stop orders on Alpaca live buys only — paper mode uses market orders without
            attached stops
          </p>
        </div>
      </div>

      {!liveConfigured ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          Add live Alpaca keys in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          to enable broker stop-loss orders.
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--card-border)] bg-white/5 p-4">
              <input
                type="checkbox"
                checked={settings?.brokerStopLossEnabled ?? true}
                disabled={saving}
                onChange={(e) =>
                  onSave({ brokerStopLossEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <div>
                <p className="text-sm font-medium">Attach stop-loss on live buys</p>
                <p className="text-xs text-[var(--muted)]">
                  Places a GTC stop sell at Alpaca after each live entry
                </p>
              </div>
            </label>

            <div className="rounded-lg border border-[var(--card-border)] bg-white/5 p-4">
              <label className="mb-2 block text-sm font-medium">
                Stop distance: {settings?.stopLossPercent ?? 2}%
              </label>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.5}
                value={settings?.stopLossPercent ?? 2}
                disabled={saving}
                onChange={(e) =>
                  onSave({ stopLossPercent: parseFloat(e.target.value) })
                }
                className="w-full accent-[var(--accent)]"
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                Also used for position sizing risk distance. Example on $310 entry: stop at $
                {(310 * (1 - (settings?.stopLossPercent ?? 2) / 100)).toFixed(2)}
              </p>
            </div>
          </div>

          {saveMessage && (
            <p className="mb-4 text-sm text-[var(--accent)]">{saveMessage}</p>
          )}

          {error && (
            <p className="mb-4 flex items-center gap-2 text-sm text-[var(--danger)]">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}

          <div>
            <h3 className="mb-3 text-sm font-medium">Live positions &amp; active stops</h3>
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Loading live account data...</p>
            ) : !liveConnected ? (
              <p className="text-sm text-[var(--muted)]">
                Live account not connected — check keys in Settings
              </p>
            ) : positions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No open live positions at Alpaca</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--card-border)] bg-white/5 text-xs text-[var(--muted)]">
                    <tr>
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Entry</th>
                      <th className="p-3">Current</th>
                      <th className="p-3">Unrealized P&amp;L</th>
                      <th className="p-3">Stop order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const stop = stopBySymbol.get(p.symbol);
                      const upl = parseFloat(p.unrealized_pl);
                      return (
                        <tr key={p.symbol} className="border-b border-[var(--card-border)]/60">
                          <td className="p-3 font-medium">{p.symbol}</td>
                          <td className="p-3">{p.qty}</td>
                          <td className="p-3">${parseFloat(p.avg_entry_price).toFixed(2)}</td>
                          <td className="p-3">${parseFloat(p.current_price).toFixed(2)}</td>
                          <td
                            className={`p-3 ${
                              upl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                            }`}
                          >
                            {formatUsd(upl)}
                          </td>
                          <td className="p-3">
                            {stop?.stop_price ? (
                              <span className="text-[var(--danger)]">
                                ${parseFloat(stop.stop_price).toFixed(2)}{" "}
                                <span className="text-[var(--muted)]">({stop.status})</span>
                              </span>
                            ) : (
                              <span className="text-amber-400">No stop attached</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
