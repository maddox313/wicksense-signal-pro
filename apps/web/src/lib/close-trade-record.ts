import {
  DEFAULT_RISK_SETTINGS,
  exitTriggerFromAutoExitHint,
  type AutoExitCloseReason,
  type ExitTriggerContext,
  type RiskSettings,
  type Trade,
} from "@wicksense/core";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import { persistSlotSafetyStopState } from "@/lib/safety-stop-sync";
import {
  computeClosePnl,
  computeClosePnlPercent,
} from "@/lib/position-sync-helpers";
import { syncAlpacaPositions } from "@/lib/position-sync";
import { upsertTrade } from "@/lib/trade-store";
import { executeBrokerClose } from "@/lib/trade-close";
import { logCloseReasonCorrection, verifyCloseReasonFromFill } from "@/lib/trade-close-reason";

function isAlpacaTradeMode(mode: Trade["mode"]): mode is "paper" | "live" {
  return mode === "paper" || mode === "live";
}

/** Close an open trade on the broker and persist the closed record. */
export async function closeTradeRecord(params: {
  trade: Trade;
  riskSettings?: RiskSettings;
  /** @deprecated Use closeTrigger — kept for auto-exit quote hints */
  closeReason?: AutoExitCloseReason;
  closeTrigger?: ExitTriggerContext;
}): Promise<Trade> {
  const { trade, closeReason, closeTrigger, riskSettings = DEFAULT_RISK_SETTINGS } = params;

  if (trade.status !== "open") {
    throw new Error("Trade is not open");
  }
  if (!isAlpacaTradeMode(trade.mode)) {
    throw new Error(`Cannot close trade in mode: ${trade.mode}`);
  }

  const trigger = closeTrigger ?? exitTriggerFromAutoExitHint(closeReason);

  const { exitPrice, closedQty } = await executeBrokerClose(trade, trade.mode);
  const closedBasis = { ...trade, quantity: closedQty };
  const pnl = computeClosePnl(closedBasis, exitPrice);
  const slot = trade.chartSlot ?? "main";

  const { closeReason: verifiedReason, outcome } = verifyCloseReasonFromFill({
    trade,
    exitPrice,
    trigger,
  });

  logCloseReasonCorrection({
    tradeId: trade.id,
    symbol: trade.symbol,
    proposedHint: closeReason ?? undefined,
    verified: verifiedReason,
    exitPrice,
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLossPrice,
    takeProfit: trade.takeProfitPrice,
  });

  if (
    trade.side === "buy" &&
    typeof trade.stopLossPrice === "number" &&
    exitPrice < trade.stopLossPrice - 0.01
  ) {
    const slipPct =
      ((trade.stopLossPrice - exitPrice) / trade.entryPrice) * 100;
    console.error("[close] Stop-loss slippage — fill worse than configured SL", {
      tradeId: trade.id,
      symbol: trade.symbol,
      configuredSl: trade.stopLossPrice,
      exitPrice,
      slippagePercent: slipPct.toFixed(2),
      trigger,
    });
  }

  const closed: Trade = {
    ...trade,
    quantity: closedQty,
    exitPrice,
    exitTime: Date.now(),
    pnl,
    pnlPercent: computeClosePnlPercent(closedBasis, pnl),
    status: "closed",
    closeReason: verifiedReason,
    outcome,
  };

  await upsertTrade(closed);
  getRiskEngine(slot, riskSettings).recordTradeResult(pnl);
  persistSlotSafetyStopState(slot, riskSettings);
  await syncAlpacaPositions(trade.mode);

  return closed;
}
