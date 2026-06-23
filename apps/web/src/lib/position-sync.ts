import type { Trade, TradeSide } from "@wicksense/core";
import { DEFAULT_RISK_SETTINGS } from "@wicksense/core";
import {
  getPositions,
  fetchQuote,
  type AlpacaPosition,
} from "@/lib/alpaca";
import { hasPaperCredentials, hasLiveCredentials } from "@/lib/broker-config";
import { ALPACA_SYNC_SLOT } from "@/lib/chart-slots";
import {
  alpacaPositionQty,
  alpacaPositionSide,
  alpacaSyncTradeId,
  computeClosePnl,
  computeClosePnlPercent,
  positionKey,
} from "@/lib/position-sync-helpers";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import { getOpenTrades, upsertTrade } from "@/lib/trade-store";

export interface PositionSyncResult {
  mode: "paper" | "live";
  skipped: boolean;
  imported: number;
  closed: number;
  quantityUpdated: number;
  alpacaSymbols: string[];
  error?: string;
}

async function closeTradeAtPrice(trade: Trade, exitPrice: number, reason: string) {
  const pnl = computeClosePnl(trade, exitPrice);
  const slot = trade.chartSlot ?? ALPACA_SYNC_SLOT;
  getRiskEngine(slot, DEFAULT_RISK_SETTINGS).recordTradeResult(pnl);

  await upsertTrade({
    ...trade,
    exitPrice,
    exitTime: Date.now(),
    pnl,
    pnlPercent: computeClosePnlPercent(trade, pnl),
    status: "closed",
    strategy: trade.strategy === "alpaca-sync" ? `closed:${reason}` : trade.strategy,
  });
}

async function resolveExitPrice(symbol: string, fallback: number): Promise<number> {
  try {
    const q = await fetchQuote(symbol);
    const raw = (q as { quote?: { ap?: number; bp?: number } })?.quote;
    const price = raw?.ap ?? raw?.bp;
    if (typeof price === "number" && price > 0) return price;
  } catch {
    /* use fallback */
  }
  return fallback;
}

function indexAlpacaPositions(positions: AlpacaPosition[]) {
  const byKey = new Map<string, AlpacaPosition>();
  for (const p of positions) {
    const qty = alpacaPositionQty(p);
    if (qty <= 0) continue;
    byKey.set(positionKey(p.symbol, alpacaPositionSide(p)), p);
  }
  return byKey;
}

export async function syncAlpacaPositions(
  mode: "paper" | "live"
): Promise<PositionSyncResult> {
  const empty: PositionSyncResult = {
    mode,
    skipped: true,
    imported: 0,
    closed: 0,
    quantityUpdated: 0,
    alpacaSymbols: [],
  };

  if (mode === "paper" && !hasPaperCredentials()) return empty;
  if (mode === "live" && !hasLiveCredentials()) return empty;

  let positions: AlpacaPosition[];
  try {
    positions = await getPositions(mode === "paper");
  } catch (err) {
    return {
      ...empty,
      skipped: false,
      error: err instanceof Error ? err.message : "Failed to fetch Alpaca positions",
    };
  }

  const alpacaByKey = indexAlpacaPositions(positions);
  const alpacaSymbols = [...new Set([...alpacaByKey.values()].map((p) => p.symbol))];
  let imported = 0;
  let closed = 0;
  let quantityUpdated = 0;

  const openForMode = await getOpenTrades(mode);

  for (const trade of openForMode) {
    const key = positionKey(trade.symbol, trade.side);
    const alpacaPos = alpacaByKey.get(key);
    if (!alpacaPos) {
      const exitPrice = await resolveExitPrice(trade.symbol, trade.entryPrice);
      await closeTradeAtPrice(trade, exitPrice, "alpaca-flat");
      closed++;
      continue;
    }

    const alpacaQty = alpacaPositionQty(alpacaPos);
    const alpacaSide = alpacaPositionSide(alpacaPos);
    const entry = parseFloat(alpacaPos.avg_entry_price) || trade.entryPrice;
    if (alpacaQty !== trade.quantity || alpacaSide !== trade.side || entry !== trade.entryPrice) {
      await upsertTrade({
        ...trade,
        side: alpacaSide,
        quantity: alpacaQty,
        entryPrice: entry,
      });
      quantityUpdated++;
    }
    alpacaByKey.delete(key);
  }

  for (const [key, pos] of alpacaByKey) {
    const side = alpacaPositionSide(pos);
    const qty = alpacaPositionQty(pos);
    const entry = parseFloat(pos.avg_entry_price);
    const symbol = pos.symbol;

    await upsertTrade({
      id: alpacaSyncTradeId(mode, symbol, side),
      symbol,
      side,
      quantity: qty,
      entryPrice: entry,
      entryTime: Date.now(),
      mode,
      strategy: "alpaca-sync",
      status: "open",
      chartSlot: ALPACA_SYNC_SLOT,
      stopLossPrice: undefined,
    });
    imported++;
    void key;
  }

  return {
    mode,
    skipped: false,
    imported,
    closed,
    quantityUpdated,
    alpacaSymbols,
  };
}

export async function syncAllAlpacaPositions(): Promise<{
  paper: PositionSyncResult;
  live: PositionSyncResult;
}> {
  const [paper, live] = await Promise.all([
    syncAlpacaPositions("paper"),
    syncAlpacaPositions("live"),
  ]);
  return { paper, live };
}

export { alpacaPositionSide, alpacaPositionQty, positionKey, computeClosePnl };
