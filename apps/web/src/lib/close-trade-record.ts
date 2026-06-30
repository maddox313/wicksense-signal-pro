import {
  DEFAULT_RISK_SETTINGS,
  deriveTradeOutcome,
  type AutoExitCloseReason,
  type RiskSettings,
  type Trade,
} from "@wicksense/core";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import {
  computeClosePnl,
  computeClosePnlPercent,
} from "@/lib/position-sync-helpers";
import { syncAlpacaPositions } from "@/lib/position-sync";
import { upsertTrade } from "@/lib/trade-store";
import { executeBrokerClose } from "@/lib/trade-close";

function isAlpacaTradeMode(mode: Trade["mode"]): mode is "paper" | "live" {
  return mode === "paper" || mode === "live";
}

/** Close an open trade on the broker and persist the closed record. */
export async function closeTradeRecord(params: {
  trade: Trade;
  riskSettings?: RiskSettings;
  closeReason?: AutoExitCloseReason;
}): Promise<Trade> {
  const { trade, closeReason, riskSettings = DEFAULT_RISK_SETTINGS } = params;

  if (trade.status !== "open") {
    throw new Error("Trade is not open");
  }
  if (!isAlpacaTradeMode(trade.mode)) {
    throw new Error(`Cannot close trade in mode: ${trade.mode}`);
  }

  const { exitPrice, closedQty } = await executeBrokerClose(trade, trade.mode);
  const closedBasis = { ...trade, quantity: closedQty };
  const pnl = computeClosePnl(closedBasis, exitPrice);
  const outcome = deriveTradeOutcome(pnl);
  const slot = trade.chartSlot ?? "main";

  const closed: Trade = {
    ...trade,
    quantity: closedQty,
    exitPrice,
    exitTime: Date.now(),
    pnl,
    pnlPercent: computeClosePnlPercent(closedBasis, pnl),
    status: "closed",
    ...(closeReason ? { closeReason, outcome } : { outcome }),
  };

  await upsertTrade(closed);
  getRiskEngine(slot, riskSettings).recordTradeResult(pnl);
  await syncAlpacaPositions(trade.mode);

  return closed;
}
