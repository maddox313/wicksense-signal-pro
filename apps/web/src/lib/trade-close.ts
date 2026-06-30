import type { Trade } from "@wicksense/core";
import {
  cancelOpenExitOrdersForSymbol,
  CLOSE_ORDER_FILL_OPTIONS,
  liquidatePositionWithFill,
  placeOrderWithFill,
} from "@/lib/alpaca";

export interface BrokerCloseResult {
  exitPrice: number;
  closedQty: number;
  orderId?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isInsufficientQtyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("insufficient qty") || message.includes("40310000");
}

function isPendingFillError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("not filled after") ||
    message.includes("still ") ||
    message.includes("market may be closed")
  );
}

async function sellToCloseLong(
  trade: Trade,
  paper: boolean
): Promise<{ exitPrice: number; closedQty: number; orderId?: string }> {
  await cancelOpenExitOrdersForSymbol(trade.symbol, "sell", paper);
  await sleep(400);

  const runLiquidation = async () => {
    const fill = await liquidatePositionWithFill({
      symbol: trade.symbol,
      qty: trade.quantity,
      paper,
    });
    return {
      exitPrice: fill.filledAvgPrice,
      closedQty: fill.filledQty,
      orderId: fill.orderId,
    };
  };

  const runMarketSell = async () => {
    const fill = await placeOrderWithFill({
      symbol: trade.symbol,
      qty: trade.quantity,
      side: "sell",
      paper,
      extended_hours: true,
      fillOptions: CLOSE_ORDER_FILL_OPTIONS,
    });
    return {
      exitPrice: fill.filledAvgPrice,
      closedQty: fill.filledQty,
      orderId: fill.orderId,
    };
  };

  try {
    return await runLiquidation();
  } catch (err) {
    if (isInsufficientQtyError(err)) {
      await cancelOpenExitOrdersForSymbol(trade.symbol, "sell", paper);
      await sleep(800);
      try {
        return await runLiquidation();
      } catch (retryErr) {
        if (!isInsufficientQtyError(retryErr)) {
          return runMarketSell();
        }
        throw retryErr;
      }
    }
    return runMarketSell();
  }
}

async function buyToCoverShort(
  trade: Trade,
  paper: boolean
): Promise<{ exitPrice: number; closedQty: number; orderId?: string }> {
  await cancelOpenExitOrdersForSymbol(trade.symbol, "buy", paper);
  await sleep(400);

  const placeCover = () =>
    placeOrderWithFill({
      symbol: trade.symbol,
      qty: trade.quantity,
      side: "buy",
      paper,
      extended_hours: true,
      fillOptions: CLOSE_ORDER_FILL_OPTIONS,
    });

  try {
    const fill = await placeCover();
    return {
      exitPrice: fill.filledAvgPrice,
      closedQty: fill.filledQty,
      orderId: fill.orderId,
    };
  } catch (err) {
    if (!isInsufficientQtyError(err) && !isPendingFillError(err)) throw err;

    await cancelOpenExitOrdersForSymbol(trade.symbol, "buy", paper);
    await sleep(800);
    const fill = await placeCover();
    return {
      exitPrice: fill.filledAvgPrice,
      closedQty: fill.filledQty,
      orderId: fill.orderId,
    };
  }
}

/** Place a broker order to close an open long (sell) or short (buy-to-cover). */
export async function executeBrokerClose(
  trade: Trade,
  mode: "paper" | "live"
): Promise<BrokerCloseResult> {
  const paper = mode === "paper";

  if (trade.side === "buy") {
    return sellToCloseLong(trade, paper);
  }
  return buyToCoverShort(trade, paper);
}
