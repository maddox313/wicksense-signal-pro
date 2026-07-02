import type { Trade, TradeSide, TradingStyle } from "./types";

export type AutoExitCloseReason = "TAKE_PROFIT" | "STOP_LOSS" | "SESSION_END";
export type TradeOutcome = "win" | "loss";

/** Verified exit reason persisted on closed trades (fill price is source of truth for TP/SL). */
export type TradeCloseReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "TIME_EXIT"
  | "SIGNAL_SELL"
  | "MANUAL"
  | "ALPACA_SYNC"
  | "SAFETY_EXIT"
  | "MARKET_EXIT";

/** Why a close was initiated before fill-price verification. */
export type ExitTriggerContext =
  | "AUTO_MONITOR"
  | "TIME_EXIT"
  | "SIGNAL_SELL"
  | "MANUAL"
  | "ALPACA_SYNC"
  | "SAFETY_EXIT";

export interface StyleExitPercents {
  stopLossPercent: number;
  takeProfitPercent: number;
}

/** Day = tight scalp (1.5% TP / 1% SL). Swing = wider targets. */
export const EXIT_PERCENTS_BY_TRADING_STYLE: Record<TradingStyle, StyleExitPercents> = {
  day: { takeProfitPercent: 1.5, stopLossPercent: 1 },
  swing: { takeProfitPercent: 3, stopLossPercent: 1.5 },
};

export function getExitPercentsForTradingStyle(tradingStyle: TradingStyle): StyleExitPercents {
  return EXIT_PERCENTS_BY_TRADING_STYLE[tradingStyle];
}

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

/**
 * Classify exit from actual fill price vs configured levels.
 * TP/SL are only returned when the fill price actually reached the level.
 */
export function classifyExitFromFillPrice(
  side: TradeSide,
  exitPrice: number,
  stopLoss: number,
  takeProfit: number
): "TAKE_PROFIT" | "STOP_LOSS" | null {
  return evaluateAutoExit(side, exitPrice, stopLoss, takeProfit);
}

/**
 * Resolve the persisted close reason: fill price wins for TP/SL;
 * otherwise fall back to the trigger context (signal sell, sync, etc.).
 */
export function resolveVerifiedCloseReason(params: {
  side: TradeSide;
  exitPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  trigger: ExitTriggerContext;
}): TradeCloseReason {
  const { side, exitPrice, stopLoss, takeProfit, trigger } = params;

  if (
    typeof stopLoss === "number" &&
    typeof takeProfit === "number" &&
    stopLoss > 0 &&
    takeProfit > 0
  ) {
    const levelHit = classifyExitFromFillPrice(side, exitPrice, stopLoss, takeProfit);
    if (levelHit) return levelHit;
  }

  switch (trigger) {
    case "TIME_EXIT":
      return "TIME_EXIT";
    case "SIGNAL_SELL":
      return "SIGNAL_SELL";
    case "MANUAL":
      return "MANUAL";
    case "ALPACA_SYNC":
      return "ALPACA_SYNC";
    case "SAFETY_EXIT":
      return "SAFETY_EXIT";
    case "AUTO_MONITOR":
    default:
      return "MARKET_EXIT";
  }
}

export function exitTriggerFromAutoExitHint(
  hint?: AutoExitCloseReason | null
): ExitTriggerContext {
  if (hint === "SESSION_END") return "TIME_EXIT";
  return "AUTO_MONITOR";
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
