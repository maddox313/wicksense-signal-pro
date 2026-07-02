import {
  deriveTradeOutcome,
  resolveVerifiedCloseReason,
  type ExitTriggerContext,
  type Trade,
  type TradeCloseReason,
} from "@wicksense/core";

export interface VerifiedCloseFields {
  closeReason: TradeCloseReason;
  outcome: ReturnType<typeof deriveTradeOutcome>;
}

/** Apply fill-price verification so TP/SL labels match actual exit price. */
export function verifyCloseReasonFromFill(params: {
  trade: Trade;
  exitPrice: number;
  trigger: ExitTriggerContext;
}): VerifiedCloseFields {
  const { trade, exitPrice, trigger } = params;
  const closeReason = resolveVerifiedCloseReason({
    side: trade.side,
    exitPrice,
    stopLoss: trade.stopLossPrice,
    takeProfit: trade.takeProfitPrice,
    trigger,
  });
  const pnl =
    trade.side === "sell"
      ? (trade.entryPrice - exitPrice) * trade.quantity
      : (exitPrice - trade.entryPrice) * trade.quantity;

  return {
    closeReason,
    outcome: deriveTradeOutcome(pnl),
  };
}

export function logCloseReasonCorrection(params: {
  tradeId: string;
  symbol: string;
  proposedHint?: string;
  verified: TradeCloseReason;
  exitPrice: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}): void {
  if (params.proposedHint && params.proposedHint === params.verified) return;
  if (
    params.proposedHint === "TAKE_PROFIT" &&
    params.verified !== "TAKE_PROFIT"
  ) {
    console.warn("[exit-verify] Quote/hint said TP but fill did not reach TP", {
      tradeId: params.tradeId,
      symbol: params.symbol,
      proposed: params.proposedHint,
      verified: params.verified,
      entryPrice: params.entryPrice,
      exitPrice: params.exitPrice,
      configuredTp: params.takeProfit,
      configuredSl: params.stopLoss,
    });
  } else if (
    params.proposedHint === "STOP_LOSS" &&
    params.verified !== "STOP_LOSS"
  ) {
    console.warn("[exit-verify] Quote/hint said SL but fill did not reach SL", {
      tradeId: params.tradeId,
      symbol: params.symbol,
      proposed: params.proposedHint,
      verified: params.verified,
      entryPrice: params.entryPrice,
      exitPrice: params.exitPrice,
      configuredTp: params.takeProfit,
      configuredSl: params.stopLoss,
    });
  }
}
