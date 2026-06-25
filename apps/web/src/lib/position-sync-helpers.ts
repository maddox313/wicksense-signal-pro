import type { Trade, TradeSide } from "@wicksense/core";
import type { AlpacaPosition } from "@/lib/alpaca";

/** Grace period while waiting for Alpaca fills / position API to update. */
export const APP_TRADE_FILL_GRACE_MS = 5 * 60 * 1000;

export function alpacaPositionSide(pos: AlpacaPosition): TradeSide {
  const qty = parseFloat(pos.qty);
  if (pos.side === "short" || qty < 0) return "sell";
  return "buy";
}

export function alpacaPositionQty(pos: AlpacaPosition): number {
  return Math.abs(parseFloat(pos.qty));
}

export function positionKey(symbol: string, side: TradeSide): string {
  return `${symbol}:${side}`;
}

export function alpacaSyncTradeId(
  mode: "paper" | "live",
  symbol: string,
  side: TradeSide
): string {
  return `alpaca-sync-${mode}-${symbol}-${side}`;
}

export function computeClosePnl(trade: Trade, exitPrice: number): number {
  if (trade.side === "sell") {
    return (trade.entryPrice - exitPrice) * trade.quantity;
  }
  return (exitPrice - trade.entryPrice) * trade.quantity;
}

export function computeClosePnlPercent(trade: Trade, pnl: number): number {
  const basis = trade.entryPrice * trade.quantity;
  return basis > 0 ? (pnl / basis) * 100 : 0;
}

export function shouldPreserveOpenAppTrade(trade: Trade, now = Date.now()): boolean {
  const ageMs = now - trade.entryTime;
  if (ageMs > APP_TRADE_FILL_GRACE_MS) return false;
  return Boolean(trade.signalId || trade.alpacaOrderId || trade.chartSlot);
}

export function tradesMatchingPosition(
  trades: Trade[],
  symbol: string,
  side: TradeSide
): Trade[] {
  return trades.filter((trade) => trade.symbol === symbol && trade.side === side);
}
