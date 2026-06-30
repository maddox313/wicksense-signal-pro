import type { Trade, TradeSide } from "@wicksense/core";
import { DEFAULT_RISK_SETTINGS, isAccountSyncTrade, isAppStrategyTrade } from "@wicksense/core";
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
  shouldPreserveOpenAppTrade,
  tradesMatchingPosition,
} from "@/lib/position-sync-helpers";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import {
  applyAttributionToOpenTrade,
  loadStrategyAttribution,
} from "@/lib/strategy-attribution";
import {
  deleteTrade,
  findLatestStrategyAttribution,
  getOpenTrades,
  upsertTrade,
} from "@/lib/trade-store";
import { isLegacyPaperBlockSymbol } from "@/lib/legacy-paper-cleanup";

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
    strategy: isAccountSyncTrade(trade) ? `closed:${reason}` : trade.strategy,
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

function positionChanged(
  trade: Trade,
  alpacaQty: number,
  alpacaSide: TradeSide,
  entry: number
): boolean {
  return (
    alpacaQty !== trade.quantity || alpacaSide !== trade.side || entry !== trade.entryPrice
  );
}

async function updateAppTradeFromAlpaca(
  trade: Trade,
  alpacaQty: number,
  alpacaSide: TradeSide,
  entry: number
): Promise<boolean> {
  if (!positionChanged(trade, alpacaQty, alpacaSide, entry)) return false;
  await upsertTrade({
    ...trade,
    side: alpacaSide,
    quantity: alpacaQty,
    entryPrice: entry,
    strategy: trade.strategy,
    chartSlot: trade.chartSlot,
    signalId: trade.signalId,
    timeframe: trade.timeframe,
    alpacaOrderId: trade.alpacaOrderId,
    status: "open",
  });
  return true;
}

async function removeSyncDuplicates(cohort: Trade[], keep: Trade): Promise<number> {
  let removed = 0;
  for (const trade of cohort) {
    if (trade.id === keep.id) continue;
    if (isAccountSyncTrade(trade) && (await deleteTrade(trade.id))) {
      removed++;
    }
  }
  return removed;
}

async function resolveStrategyAttribution(
  symbol: string,
  side: TradeSide,
  mode: "paper" | "live"
) {
  return (
    loadStrategyAttribution(symbol, side, mode) ??
    (await findLatestStrategyAttribution(symbol, side, mode))
  );
}

async function repairOpenSyncAttributions(mode: "paper" | "live"): Promise<number> {
  let repaired = 0;
  const openForMode = await getOpenTrades(mode);
  for (const trade of openForMode) {
    if (!isAccountSyncTrade(trade)) continue;
    const attribution = await resolveStrategyAttribution(trade.symbol, trade.side, mode);
    if (!attribution) continue;
    await upsertTrade(applyAttributionToOpenTrade(trade, attribution));
    repaired++;
  }
  return repaired;
}

async function upsertAttributedOpenTrade(params: {
  mode: "paper" | "live";
  symbol: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  attribution: NonNullable<Awaited<ReturnType<typeof resolveStrategyAttribution>>>;
}): Promise<Trade> {
  const { mode, symbol, side, quantity, entryPrice, attribution } = params;
  const base: Trade = {
    id: attribution.signalId
      ? `trade-${attribution.chartSlot}-${attribution.signalId}`
      : alpacaSyncTradeId(mode, symbol, side),
    symbol,
    side,
    quantity,
    entryPrice,
    entryTime: attribution.entryTime,
    mode,
    strategy: attribution.strategy,
    status: "open",
    chartSlot: attribution.chartSlot,
    timeframe: attribution.timeframe,
    signalId: attribution.signalId,
  };
  return upsertTrade(applyAttributionToOpenTrade(base, attribution));
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

  await repairOpenSyncAttributions(mode);

  const openForMode = await getOpenTrades(mode);
  const processedKeys = new Set<string>();

  for (const trade of openForMode) {
    const key = positionKey(trade.symbol, trade.side);
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);

    const cohort = tradesMatchingPosition(openForMode, trade.symbol, trade.side);
    const appTrade = cohort.find(isAppStrategyTrade);
    const alpacaPos = alpacaByKey.get(key);

    if (alpacaPos) {
      const alpacaQty = alpacaPositionQty(alpacaPos);
      const alpacaSide = alpacaPositionSide(alpacaPos);
      const entry = parseFloat(alpacaPos.avg_entry_price) || appTrade?.entryPrice || 0;

      if (appTrade) {
        if (await updateAppTradeFromAlpaca(appTrade, alpacaQty, alpacaSide, entry)) {
          quantityUpdated++;
        }
        await removeSyncDuplicates(cohort, appTrade);
      } else {
        const syncTrade = cohort.find(isAccountSyncTrade) ?? cohort[0];
        if (syncTrade && (await updateAppTradeFromAlpaca(syncTrade, alpacaQty, alpacaSide, entry))) {
          quantityUpdated++;
        }
      }

      alpacaByKey.delete(key);
      continue;
    }

    if (appTrade && shouldPreserveOpenAppTrade(appTrade)) {
      await removeSyncDuplicates(cohort, appTrade);
      continue;
    }

    for (const openTrade of cohort) {
      const exitPrice = await resolveExitPrice(openTrade.symbol, openTrade.entryPrice);
      await closeTradeAtPrice(openTrade, exitPrice, "alpaca-flat");
      closed++;
    }
  }

  for (const [, pos] of alpacaByKey) {
    const side = alpacaPositionSide(pos);
    const symbol = pos.symbol;
    if (mode === "paper" && isLegacyPaperBlockSymbol(symbol)) {
      continue;
    }
    const key = positionKey(symbol, side);

    const stillOpen = await getOpenTrades(mode);
    const appMatch = stillOpen.find(
      (trade) =>
        trade.symbol === symbol &&
        trade.side === side &&
        isAppStrategyTrade(trade)
    );
    if (appMatch) {
      continue;
    }

    const syncMatch = stillOpen.find(
      (trade) =>
        trade.symbol === symbol &&
        trade.side === side &&
        isAccountSyncTrade(trade)
    );
    if (syncMatch) {
      const qty = alpacaPositionQty(pos);
      const entry = parseFloat(pos.avg_entry_price);
      if (await updateAppTradeFromAlpaca(syncMatch, qty, side, entry)) {
        quantityUpdated++;
      }
      void key;
      continue;
    }

    const qty = alpacaPositionQty(pos);
    const entry = parseFloat(pos.avg_entry_price);
    const attribution = await resolveStrategyAttribution(symbol, side, mode);

    if (attribution) {
      await upsertAttributedOpenTrade({
        mode,
        symbol,
        side,
        quantity: qty,
        entryPrice: entry,
        attribution,
      });
      imported++;
      continue;
    }

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
