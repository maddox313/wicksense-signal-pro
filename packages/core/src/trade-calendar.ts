import type { Trade } from "./types";

export const TRADING_CALENDAR_TIMEZONE = "America/New_York";

export function getCalendarDayKey(
  timestamp: number,
  timeZone: string = TRADING_CALENDAR_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function getTradeCloseTimestamp(trade: Trade): number | null {
  if (trade.status !== "closed" || trade.pnl === undefined) return null;
  return trade.exitTime ?? trade.entryTime;
}

export function filterTradesClosedOnDay(
  trades: Trade[],
  date: Date = new Date(),
  timeZone: string = TRADING_CALENDAR_TIMEZONE
): Trade[] {
  const dayKey = getCalendarDayKey(date.getTime(), timeZone);
  return trades.filter((trade) => {
    const closeTs = getTradeCloseTimestamp(trade);
    if (closeTs === null) return false;
    return getCalendarDayKey(closeTs, timeZone) === dayKey;
  });
}

/** Day bucket for archived trade lookup (close date, else entry date). */
export function getTradeArchiveDayKey(
  trade: Trade,
  timeZone: string = TRADING_CALENDAR_TIMEZONE
): string {
  const ts = trade.exitTime ?? trade.entryTime;
  return getCalendarDayKey(ts, timeZone);
}

export function filterArchivedTradesOnDay(
  trades: Trade[],
  dayKey: string,
  timeZone: string = TRADING_CALENDAR_TIMEZONE
): Trade[] {
  return trades.filter(
    (trade) => trade.archived && getTradeArchiveDayKey(trade, timeZone) === dayKey
  );
}

export function getArchivedTradeDayKeys(
  trades: Trade[],
  timeZone: string = TRADING_CALENDAR_TIMEZONE
): string[] {
  const keys = new Set<string>();
  for (const trade of trades) {
    if (!trade.archived) continue;
    keys.add(getTradeArchiveDayKey(trade, timeZone));
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}
