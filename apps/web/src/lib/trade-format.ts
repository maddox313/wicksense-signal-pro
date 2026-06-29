import { TRADING_CALENDAR_TIMEZONE } from "@wicksense/core";

const ET = TRADING_CALENDAR_TIMEZONE;

export function formatTradeDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    timeZone: ET,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTradeTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTradeDateTime(timestamp: number): string {
  return `${formatTradeDate(timestamp)} ${formatTradeTime(timestamp)}`;
}
