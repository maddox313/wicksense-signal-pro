import type { Trade, PerformanceStats } from "./types";
import { computePerformanceStats } from "./risk";
import { filterTradesClosedOnDay } from "./trade-calendar";

export {
  TRADING_CALENDAR_TIMEZONE,
  getCalendarDayKey,
  getTradeCloseTimestamp,
  filterTradesClosedOnDay,
  getTradeArchiveDayKey,
  filterArchivedTradesOnDay,
  getArchivedTradeDayKeys,
} from "./trade-calendar";

export type SystemProfitability = "profitable" | "not_profitable" | "break_even" | "insufficient_data";

export interface EquityPoint {
  time: number;
  equity: number;
  label: string;
}

export interface TradePnLPoint {
  id: string;
  pnl: number;
  symbol: string;
  mode: string;
}

export function getClosedTrades(trades: Trade[]): Trade[] {
  return trades
    .filter((t) => t.status === "closed" && t.pnl !== undefined)
    .sort((a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime));
}

export function computeTodayPerformanceStats(
  trades: Trade[],
  date: Date = new Date(),
  timeZone?: string
): PerformanceStats {
  return computePerformanceStats(filterTradesClosedOnDay(trades, date, timeZone));
}

export function lossRate(stats: PerformanceStats): number {
  return stats.totalTrades ? (stats.losingTrades / stats.totalTrades) * 100 : 0;
}

export function evaluateSystemProfitability(stats: PerformanceStats): {
  status: SystemProfitability;
  label: string;
  detail: string;
} {
  const loss = lossRate(stats);

  if (stats.totalTrades === 0) {
    return {
      status: "insufficient_data",
      label: "Insufficient Data",
      detail: "Close at least one trade to evaluate system profitability.",
    };
  }

  const winLossSummary = `Win ${stats.winRate.toFixed(1)}% · Loss ${loss.toFixed(1)}% · P&L $${stats.totalPnl.toFixed(2)}`;

  if (stats.totalPnl > 0) {
    return { status: "profitable", label: "Profitable", detail: winLossSummary };
  }
  if (stats.totalPnl < 0) {
    return { status: "not_profitable", label: "Not Profitable", detail: winLossSummary };
  }
  return { status: "break_even", label: "Break Even", detail: winLossSummary };
}

export function buildEquityCurve(trades: Trade[]): EquityPoint[] {
  const closed = getClosedTrades(trades);
  let equity = 0;
  const points: EquityPoint[] = [{ time: 0, equity: 0, label: "Start" }];

  closed.forEach((trade, index) => {
    equity += trade.pnl ?? 0;
    points.push({
      time: trade.exitTime ?? trade.entryTime ?? index + 1,
      equity,
      label: trade.symbol,
    });
  });

  return points;
}

export function buildTradePnLSeries(trades: Trade[], limit = 30): TradePnLPoint[] {
  return getClosedTrades(trades)
    .slice(-limit)
    .map((t) => ({
      id: t.id,
      pnl: t.pnl ?? 0,
      symbol: t.symbol,
      mode: t.mode,
    }));
}

export function statsForTrades(trades: Trade[]): PerformanceStats {
  return computePerformanceStats(trades);
}

/** Trade Analysis cards: count every row in the table (open + closed). */
export function computeTradeAnalysisStats(trades: Trade[]): PerformanceStats {
  const closed = computePerformanceStats(trades);
  return { ...closed, totalTrades: trades.length };
}

export type {
  StrategyPerformanceBreakdown,
  AccountSyncActivityRow,
  AccountSyncActivitySummary,
  SignalActivityRecord,
  SignalActivityKind,
  StrategyExtendedBreakdown,
  StrategyTelemetryOverlay,
} from "./strategy-breakdown";
export {
  computeStrategyBreakdown,
  computeAccountSyncActivity,
  computeStrategyExtendedBreakdown,
  buildOpenTradesByStrategy,
  extractSignalIdFromTrade,
  isAccountSyncTrade,
  isAppStrategyTrade,
  ALPACA_SYNC_STRATEGY,
  ALPACA_SYNC_CHART_SLOT,
} from "./strategy-breakdown";
