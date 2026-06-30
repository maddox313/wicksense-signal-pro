import type { Trade, TradeSide } from "./types";

export type AutoExitCloseReason = "TAKE_PROFIT" | "STOP_LOSS";
export type TradeOutcome = "win" | "loss";

export function roundPrice(raw: number, entryPrice: number): number {
  return entryPrice >= 1 ? Math.round(raw * 100) / 100 : Math.round(raw * 10000) / 10000;
}

/** Take-profit price for a long or short position. */
export function computeTakeProfitPrice(
  entryPrice: number,
  side: TradeSide,
  takeProfitPercent: number
): number {
  const factor = takeProfitPercent / 100;
  const raw = side === "buy" ? entryPrice * (1 + factor) : entryPrice * (1 - factor);
  return roundPrice(raw, entryPrice);
}

/** Stop-loss price for a long or short position. */
export function computeStopLossPriceForSide(
  entryPrice: number,
  side: TradeSide,
  stopLossPercent: number
): number {
  const factor = stopLossPercent / 100;
  const raw = side === "buy" ? entryPrice * (1 - factor) : entryPrice * (1 + factor);
  return roundPrice(raw, entryPrice);
}

/**
 * Returns TAKE_PROFIT or STOP_LOSS when price hits a level, otherwise null.
 * Long: TP when price >= takeProfit, SL when price <= stopLoss.
 * Short: TP when price <= takeProfit, SL when price >= stopLoss.
 */
export function evaluateAutoExit(
  side: TradeSide,
  currentPrice: number,
  stopLoss: number,
  takeProfit: number
): AutoExitCloseReason | null {
  if (side === "buy") {
    if (currentPrice >= takeProfit) return "TAKE_PROFIT";
    if (currentPrice <= stopLoss) return "STOP_LOSS";
    return null;
  }
  if (currentPrice <= takeProfit) return "TAKE_PROFIT";
  if (currentPrice >= stopLoss) return "STOP_LOSS";
  return null;
}

export function deriveTradeOutcome(pnl: number): TradeOutcome {
  return pnl >= 0 ? "win" : "loss";
}

export function isAutoExitMonitoredTrade(trade: Trade): boolean {
  return (
    trade.status === "open" &&
    (trade.mode === "paper" || trade.mode === "live") &&
    typeof trade.stopLossPrice === "number" &&
    typeof trade.takeProfitPrice === "number" &&
    trade.stopLossPrice > 0 &&
    trade.takeProfitPrice > 0
  );
}
