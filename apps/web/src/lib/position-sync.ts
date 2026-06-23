import type { Trade } from "@wicksense/core";
import { DEFAULT_RISK_SETTINGS } from "@wicksense/core";
import {
  getPositions,
  fetchQuote,
  type AlpacaPosition,
} from "@/lib/alpaca";
import { hasPaperCredentials, hasLiveCredentials } from "@/lib/broker-config";
import { ALPACA_SYNC_SLOT } from "@/lib/chart-slots";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import {
  getAllTrades,
  getOpenTrades,
  upsertTrade,
} from "@/lib/trade-store";

export interface PositionSyncResult {
  mode: "paper" | "live";
  skipped: boolean;
  imported: number;
  closed: number;
  quantityUpdated: number;
  alpacaSymbols: string[];
  error?: string;
}

function parseQty(position: AlpacaPosition): number {
  return Math.abs(parseFloat(position.qty));
}

function closeTradeAtPrice(trade: Trade, exitPrice: number, reason: string) {
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity;
  const slot = trade.chartSlot ?? ALPACA_SYNC_SLOT;
  getRiskEngine(slot, DEFAULT_RISK_SETTINGS).recordTradeResult(pnl);

  upsertTrade({
    ...trade,
    exitPrice,
    exitTime: Date.now(),
    pnl,
    pnlPercent:
      trade.entryPrice > 0 ? (pnl / (trade.entryPrice * trade.quantity)) * 100 : 0,
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

  const alpacaBySymbol = new Map<string, AlpacaPosition>();
  for (const p of positions) {
    const qty = parseQty(p);
    if (qty > 0) alpacaBySymbol.set(p.symbol, p);
  }

  const alpacaSymbols = [...alpacaBySymbol.keys()];
  let imported = 0;
  let closed = 0;
  let quantityUpdated = 0;

  const openForMode = getOpenTrades(mode);

  for (const trade of openForMode) {
    const alpacaPos = alpacaBySymbol.get(trade.symbol);
    if (!alpacaPos) {
      const exitPrice = await resolveExitPrice(trade.symbol, trade.entryPrice);
      closeTradeAtPrice(trade, exitPrice, "alpaca-flat");
      closed++;
      continue;
    }

    const alpacaQty = parseQty(alpacaPos);
    if (alpacaQty !== trade.quantity) {
      upsertTrade({
        ...trade,
        quantity: alpacaQty,
        entryPrice: parseFloat(alpacaPos.avg_entry_price) || trade.entryPrice,
      });
      quantityUpdated++;
    }
    alpacaBySymbol.delete(trade.symbol);
  }

  for (const [symbol, pos] of alpacaBySymbol) {
    const qty = parseQty(pos);
    const entry = parseFloat(pos.avg_entry_price);

    upsertTrade({
      id: `alpaca-sync-${mode}-${symbol}`,
      symbol,
      side: "buy",
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
