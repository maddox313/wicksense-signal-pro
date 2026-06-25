import type { Trade, TradeSide } from "./types";

export type SignalActivityKind = "generated" | "rejected" | "converted";

export interface SignalActivityRecord {
  signalId: string;
  strategy: string;
  symbol: string;
  side: TradeSide;
  time: number;
  kind: SignalActivityKind;
  reason?: string;
  chartSlot?: string;
  mode?: string;
  recordedAt?: number;
}

export const ALPACA_SYNC_STRATEGY = "alpaca-sync";
export const ALPACA_SYNC_CHART_SLOT = "alpaca-sync";

export interface StrategyPerformanceBreakdown {
  strategy: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  markets: string[];
  timeframes: string[];
}

export interface StrategyExtendedBreakdown extends StrategyPerformanceBreakdown {
  openTrades: number;
  closedTrades: number;
  signalsGenerated: number;
  signalsRejected: number;
  signalsConverted: number;
  lastSignalAt: number | null;
  lastRejectedAt: number | null;
  lastConvertedAt: number | null;
  totalGeneratedSinceStartup: number;
  engineActive: boolean;
}

export function extractSignalIdFromTrade(trade: Trade): string | null {
  if (trade.signalId) return trade.signalId;
  if (!trade.id.startsWith("trade-") || !trade.chartSlot) return null;
  const prefix = `trade-${trade.chartSlot}-`;
  if (!trade.id.startsWith(prefix)) return null;
  const signalId = trade.id.slice(prefix.length);
  return signalId.length > 0 ? signalId : null;
}

function uniqueSignalCountByStrategy(
  records: SignalActivityRecord[],
  kind: SignalActivityKind
): Map<string, number> {
  const seen = new Map<string, Set<string>>();

  for (const record of records) {
    if (record.kind !== kind) continue;
    const bucket = seen.get(record.strategy) ?? new Set<string>();
    bucket.add(record.signalId);
    seen.set(record.strategy, bucket);
  }

  return new Map(
    Array.from(seen.entries()).map(([strategy, ids]) => [strategy, ids.size])
  );
}

function convertedSignalIdsByStrategy(trades: Trade[]): Map<string, Set<string>> {
  const byStrategy = new Map<string, Set<string>>();

  for (const trade of trades) {
    const signalId = extractSignalIdFromTrade(trade);
    if (!signalId) continue;
    const bucket = byStrategy.get(trade.strategy) ?? new Set<string>();
    bucket.add(signalId);
    byStrategy.set(trade.strategy, bucket);
  }

  return byStrategy;
}

function activityEventTime(record: SignalActivityRecord): number {
  if (record.recordedAt) return record.recordedAt;
  return record.time > 1_000_000_000_000 ? record.time : record.time * 1000;
}

function lastActivityTime(
  records: SignalActivityRecord[],
  strategy: string,
  kind: SignalActivityKind
): number | null {
  let latest: number | null = null;
  for (const record of records) {
    if (record.strategy !== strategy || record.kind !== kind) continue;
    const at = activityEventTime(record);
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

function lastConvertedTradeTime(trades: Trade[], strategy: string): number | null {
  let latest: number | null = null;
  for (const trade of trades) {
    if (trade.strategy !== strategy || isAccountSyncTrade(trade)) continue;
    if (!extractSignalIdFromTrade(trade)) continue;
    const at = trade.exitTime ?? trade.entryTime;
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

export interface StrategyTelemetryOverlay {
  totalGeneratedSinceStartup?: number;
  lastSignalAt?: number | null;
  lastRejectedAt?: number | null;
  lastConvertedAt?: number | null;
  engineActive?: boolean;
}

/** Count open positions per strategy from app trades and converted signal activity. */
export function buildOpenTradesByStrategy(
  trades: Trade[],
  activities: SignalActivityRecord[] = []
): Map<string, number> {
  const openByStrategy = new Map<string, number>();
  const openTrades = trades.filter((trade) => trade.status === "open");
  const attributedPositions = new Set<string>();

  for (const trade of openTrades) {
    if (!isAppStrategyTrade(trade)) continue;
    const strategy = trade.strategy.trim() || "unknown";
    openByStrategy.set(strategy, (openByStrategy.get(strategy) ?? 0) + 1);
    attributedPositions.add(`${trade.symbol}:${trade.side}`);
  }

  const latestConvertedByPosition = new Map<string, SignalActivityRecord>();
  for (const record of activities) {
    if (record.kind !== "converted") continue;
    const posKey = `${record.symbol}:${record.side}`;
    const existing = latestConvertedByPosition.get(posKey);
    if (!existing || activityEventTime(record) > activityEventTime(existing)) {
      latestConvertedByPosition.set(posKey, record);
    }
  }

  for (const [posKey, record] of latestConvertedByPosition) {
    if (attributedPositions.has(posKey)) continue;
    const hasOpenPosition = openTrades.some(
      (trade) => trade.symbol === record.symbol && trade.side === record.side
    );
    if (!hasOpenPosition) continue;
    const strategy = record.strategy.trim() || "unknown";
    openByStrategy.set(strategy, (openByStrategy.get(strategy) ?? 0) + 1);
    attributedPositions.add(posKey);
  }

  return openByStrategy;
}

/** Full per-strategy report: trades, signals, and closed-trade P&L. */
export function computeStrategyExtendedBreakdown(
  trades: Trade[],
  activities: SignalActivityRecord[],
  knownStrategyIds: string[] = [],
  telemetryOverlay: Record<string, StrategyTelemetryOverlay> = {}
): StrategyExtendedBreakdown[] {
  const strategyTrades = trades.filter((trade) => !isAccountSyncTrade(trade));
  const openByStrategy = buildOpenTradesByStrategy(trades, activities);

  const performanceRows = computeStrategyBreakdown(trades);
  const performanceByStrategy = new Map(
    performanceRows.map((row) => [row.strategy, row])
  );

  const generatedCounts = uniqueSignalCountByStrategy(activities, "generated");
  const rejectedCounts = uniqueSignalCountByStrategy(activities, "rejected");
  const convertedActivityCounts = uniqueSignalCountByStrategy(activities, "converted");
  const convertedFromTrades = convertedSignalIdsByStrategy(strategyTrades);

  const strategyIds = new Set<string>([
    ...knownStrategyIds,
    ...performanceRows.map((row) => row.strategy),
    ...openByStrategy.keys(),
    ...generatedCounts.keys(),
    ...rejectedCounts.keys(),
    ...convertedActivityCounts.keys(),
    ...convertedFromTrades.keys(),
  ]);

  return Array.from(strategyIds)
    .map((strategy) => {
      const perf = performanceByStrategy.get(strategy);
      const convertedIds = convertedFromTrades.get(strategy) ?? new Set<string>();
      const signalsConverted = Math.max(
        convertedActivityCounts.get(strategy) ?? 0,
        convertedIds.size
      );

      const generatedIds = new Set<string>();
      for (const record of activities) {
        if (record.strategy === strategy && record.kind === "generated") {
          generatedIds.add(record.signalId);
        }
      }
      for (const signalId of convertedIds) {
        generatedIds.add(signalId);
      }
      const signalsGenerated = Math.max(generatedCounts.get(strategy) ?? 0, generatedIds.size);

      const emptyPerformance: StrategyPerformanceBreakdown = {
        strategy,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        netPnl: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        markets: [],
        timeframes: [],
      };

      const base = perf ?? emptyPerformance;
      const overlay = telemetryOverlay[strategy] ?? {};

      const lastSignalAt =
        overlay.lastSignalAt ?? lastActivityTime(activities, strategy, "generated");
      const lastRejectedAt =
        overlay.lastRejectedAt ?? lastActivityTime(activities, strategy, "rejected");
      const lastConvertedAt =
        overlay.lastConvertedAt ??
        lastActivityTime(activities, strategy, "converted") ??
        lastConvertedTradeTime(strategyTrades, strategy);

      return {
        ...base,
        strategy,
        openTrades: openByStrategy.get(strategy) ?? 0,
        closedTrades: base.totalTrades,
        signalsGenerated,
        signalsRejected: rejectedCounts.get(strategy) ?? 0,
        signalsConverted,
        lastSignalAt,
        lastRejectedAt,
        lastConvertedAt,
        totalGeneratedSinceStartup:
          overlay.totalGeneratedSinceStartup ?? signalsGenerated,
        engineActive: overlay.engineActive ?? false,
      };
    })
    .sort((a, b) => a.netPnl - b.netPnl);
}

/** Signal-generated strategy trade — not Alpaca reconciliation. */
export function isAppStrategyTrade(trade: Trade): boolean {
  return !isAccountSyncTrade(trade);
}

/** Reconciliation imports/closes — not signal-generated strategy trades. */
export function isAccountSyncTrade(trade: Trade): boolean {
  if (trade.chartSlot === ALPACA_SYNC_CHART_SLOT) return true;
  if (trade.strategy === ALPACA_SYNC_STRATEGY) return true;
  if (trade.strategy.startsWith("closed:")) return true;
  if (trade.id.startsWith("alpaca-sync-")) return true;
  return false;
}

export interface AccountSyncActivityRow {
  id: string;
  symbol: string;
  side: Trade["side"];
  mode: Trade["mode"];
  status: Trade["status"];
  label: string;
  pnl?: number;
  quantity: number;
  entryTime: number;
  exitTime?: number;
}

export interface AccountSyncActivitySummary {
  totalRecords: number;
  openRecords: number;
  closedRecords: number;
  wins: number;
  losses: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  markets: string[];
}

function getClosedTrades(trades: Trade[]): Trade[] {
  return trades
    .filter((trade) => trade.status === "closed" && trade.pnl !== undefined)
    .sort((a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime));
}

function buildBreakdownRow(strategy: string, strategyTrades: Trade[]): StrategyPerformanceBreakdown {
  const wins = strategyTrades.filter((trade) => (trade.pnl ?? 0) > 0);
  const losses = strategyTrades.filter((trade) => (trade.pnl ?? 0) <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0));
  const netPnl = strategyTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const totalTrades = strategyTrades.length;
  const markets = [...new Set(strategyTrades.map((trade) => trade.symbol))].sort();
  const timeframes = [
    ...new Set(
      strategyTrades
        .map((trade) => trade.timeframe?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].sort();

  return {
    strategy,
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    winRate: totalTrades ? (wins.length / totalTrades) * 100 : 0,
    grossProfit,
    grossLoss,
    netPnl,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    markets,
    timeframes,
  };
}

function formatSyncLabel(trade: Trade): string {
  if (trade.strategy.startsWith("closed:")) {
    return trade.strategy.replace("closed:", "Closed · ");
  }
  if (trade.status === "open") return "Imported position";
  return "Sync record";
}

/** Signal-generated strategies only — excludes Alpaca reconciliation records. */
export function computeStrategyBreakdown(trades: Trade[]): StrategyPerformanceBreakdown[] {
  const closed = getClosedTrades(trades).filter((trade) => !isAccountSyncTrade(trade));
  const byStrategy = new Map<string, Trade[]>();

  for (const trade of closed) {
    const key = trade.strategy.trim() || "unknown";
    const bucket = byStrategy.get(key) ?? [];
    bucket.push(trade);
    byStrategy.set(key, bucket);
  }

  return Array.from(byStrategy.entries())
    .map(([strategy, strategyTrades]) => buildBreakdownRow(strategy, strategyTrades))
    .sort((a, b) => a.netPnl - b.netPnl);
}

export function computeAccountSyncActivity(trades: Trade[]): {
  summary: AccountSyncActivitySummary;
  records: AccountSyncActivityRow[];
} {
  const syncTrades = trades
    .filter((trade) => isAccountSyncTrade(trade))
    .sort((a, b) => (b.exitTime ?? b.entryTime) - (a.exitTime ?? a.entryTime));

  const closed = syncTrades.filter((trade) => trade.status === "closed" && trade.pnl !== undefined);
  const open = syncTrades.filter((trade) => trade.status === "open");
  const wins = closed.filter((trade) => (trade.pnl ?? 0) > 0);
  const losses = closed.filter((trade) => (trade.pnl ?? 0) <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0));
  const netPnl = closed.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);

  return {
    summary: {
      totalRecords: syncTrades.length,
      openRecords: open.length,
      closedRecords: closed.length,
      wins: wins.length,
      losses: losses.length,
      grossProfit,
      grossLoss,
      netPnl,
      markets: [...new Set(syncTrades.map((trade) => trade.symbol))].sort(),
    },
    records: syncTrades.map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      mode: trade.mode,
      status: trade.status,
      label: formatSyncLabel(trade),
      pnl: trade.pnl,
      quantity: trade.quantity,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
    })),
  };
}
