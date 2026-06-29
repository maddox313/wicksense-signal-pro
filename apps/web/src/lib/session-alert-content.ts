import type { Trade, TradeMode, TradingScheduleSettings } from "@wicksense/core";
import {
  computeTodayPerformanceStats,
  formatTradingScheduleSummary,
  getCalendarDayKey,
  TRADING_CALENDAR_TIMEZONE,
} from "@wicksense/core";

export interface TradingSessionClientContext {
  mode: TradeMode;
  autoTradeEnabled: boolean;
  enabledMarkets: string[];
  enabledStrategies: string[];
  presetName?: string;
  stopReason?: string;
}

export interface SessionStopRecap {
  tradesOpenedToday: number;
  tradesClosedToday: number;
  winsToday: number;
  lossesToday: number;
  todayPnl: number;
  openPositionsRemaining: number;
}

export function formatEasternTimestamp(date: Date = new Date()): string {
  return date.toLocaleString("en-US", {
    timeZone: TRADING_CALENDAR_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export function formatModeLabel(mode: TradeMode): string {
  if (mode === "paper") return "Paper";
  if (mode === "live") return "Live";
  if (mode === "manual") return "Manual";
  return "Auto";
}

function filterTradesOpenedOnDay(trades: Trade[], date: Date = new Date()): Trade[] {
  const dayKey = getCalendarDayKey(date.getTime(), TRADING_CALENDAR_TIMEZONE);
  return trades.filter((trade) => getCalendarDayKey(trade.entryTime, TRADING_CALENDAR_TIMEZONE) === dayKey);
}

export function buildSessionStopRecap(trades: Trade[], date: Date = new Date()): SessionStopRecap {
  const todayStats = computeTodayPerformanceStats(trades, date, TRADING_CALENDAR_TIMEZONE);
  const openedToday = filterTradesOpenedOnDay(trades, date);
  const openPositionsRemaining = trades.filter((t) => t.status === "open").length;

  return {
    tradesOpenedToday: openedToday.length,
    tradesClosedToday: todayStats.totalTrades,
    winsToday: todayStats.winningTrades,
    lossesToday: todayStats.losingTrades,
    todayPnl: todayStats.totalPnl,
    openPositionsRemaining,
  };
}

export function buildTradingStartedMessage(
  schedule: TradingScheduleSettings,
  context: TradingSessionClientContext
): string {
  return "WickSense is now monitoring for valid trade setups.";
}

export function buildTradingStoppedMessage(
  schedule: TradingScheduleSettings,
  context: TradingSessionClientContext,
  recap: SessionStopRecap
): string {
  return "WickSense has stopped trading for the day.";
}

export function buildScheduleStopReason(
  schedule: TradingScheduleSettings,
  context: TradingSessionClientContext
): string {
  return (
    context.stopReason?.trim() ||
    "Outside your allowed trading hours (per your user settings)"
  );
}

export function listSummary(items: string[], max = 8): string {
  if (items.length === 0) return "None configured";
  const shown = items.slice(0, max);
  const suffix = items.length > max ? ` (+${items.length - max} more)` : "";
  return `${shown.join(", ")}${suffix}`;
}

export { formatTradingScheduleSummary };
