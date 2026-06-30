import fs from "fs";
import path from "path";
import type { Trade } from "@wicksense/core";
import { evaluateTradingSchedule } from "@wicksense/core";
import {
  cancelAllOpenOrders,
  cancelOpenExitOrdersForSymbol,
  getPositions,
  hasPaperCredentials,
  LEGACY_CLEANUP_FILL_OPTIONS,
  liquidatePositionWithFill,
} from "@/lib/alpaca";
import { deleteAutoExitMetaForTrades } from "@/lib/auto-exit-meta";
import {
  alpacaPositionQty,
  alpacaPositionSide,
  computeClosePnl,
  computeClosePnlPercent,
} from "@/lib/position-sync-helpers";
import { syncAlpacaPositions } from "@/lib/position-sync";
import { resetAllRiskEngines } from "@/lib/risk-engine-registry";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import {
  getAllTrades,
  getArchivedTrades,
  getOpenTrades,
  upsertTrade,
} from "@/lib/trade-store";

const LEGACY_BLOCK_PATH = path.join(process.cwd(), "legacy-paper-block.local.json");

interface LegacyPaperBlockFile {
  blockedSymbols: string[];
  updatedAt: string;
  reason: string;
}

export function loadLegacyPaperBlockSymbols(): Set<string> {
  try {
    if (!fs.existsSync(LEGACY_BLOCK_PATH)) return new Set();
    const raw = fs.readFileSync(LEGACY_BLOCK_PATH, "utf8");
    const data = JSON.parse(raw) as LegacyPaperBlockFile;
    return new Set(data.blockedSymbols ?? []);
  } catch {
    return new Set();
  }
}

export function isLegacyPaperBlockSymbol(symbol: string): boolean {
  return loadLegacyPaperBlockSymbols().has(symbol);
}

function saveLegacyPaperBlockSymbols(symbols: string[], reason: string): void {
  const file: LegacyPaperBlockFile = {
    blockedSymbols: [...new Set(symbols)],
    updatedAt: new Date().toISOString(),
    reason,
  };
  fs.writeFileSync(LEGACY_BLOCK_PATH, JSON.stringify(file, null, 2), "utf8");
}

export function clearLegacyPaperBlockSymbols(): void {
  if (fs.existsSync(LEGACY_BLOCK_PATH)) {
    fs.unlinkSync(LEGACY_BLOCK_PATH);
  }
}

/** Drop stale legacy block entries when broker no longer holds those symbols. */
export async function refreshLegacyPaperBlockFromAlpaca(): Promise<{
  cleared: boolean;
  alpacaSymbols: string[];
}> {
  if (!hasPaperCredentials()) {
    clearLegacyPaperBlockSymbols();
    return { cleared: true, alpacaSymbols: [] };
  }

  const positions = await getPositions(true);
  const alpacaSymbols = positions.map((p) => p.symbol);
  const hadBlock = fs.existsSync(LEGACY_BLOCK_PATH);
  clearLegacyPaperBlockSymbols();

  return { cleared: hadBlock, alpacaSymbols };
}

export interface LegacyPaperCleanupResult {
  ordersCancelled: number;
  symbolsAttempted: number;
  brokerClosed: string[];
  needsManualClose: string[];
  orphanedDbOnly: string[];
  closedTradeIds: string[];
  archivedTradeIds: string[];
  openPaperRemaining: number;
  marketOpen: boolean;
  skippedBrokerLiquidation: boolean;
  sync: Awaited<ReturnType<typeof syncAlpacaPositions>>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closePaperTradesAtPrice(
  trades: Trade[],
  exitPrice: number,
  exitTime: number
): Promise<string[]> {
  const closedIds: string[] = [];
  for (const trade of trades) {
    const pnl = computeClosePnl(trade, exitPrice);
    await upsertTrade({
      ...trade,
      exitPrice,
      exitTime,
      pnl,
      pnlPercent: computeClosePnlPercent(trade, pnl),
      status: "closed",
    });
    closedIds.push(trade.id);
  }
  return closedIds;
}

async function archiveNeedsManualClose(trades: Trade[]): Promise<string[]> {
  const now = Date.now();
  const archivedIds: string[] = [];
  for (const trade of trades) {
    await upsertTrade({
      ...trade,
      status: "needs_manual_close",
      archived: true,
      archivedAt: now,
    });
    archivedIds.push(trade.id);
  }
  return archivedIds;
}

async function archiveAllOpenPaperTrades(trades: Trade[]): Promise<string[]> {
  if (trades.length === 0) return [];
  return archiveNeedsManualClose(trades);
}

async function liquidatePaperSymbol(symbol: string, qty: number): Promise<number> {
  await cancelOpenExitOrdersForSymbol(symbol, "sell", true);
  await cancelOpenExitOrdersForSymbol(symbol, "buy", true);
  await sleep(400);

  const fill = await liquidatePositionWithFill({
    symbol,
    qty,
    paper: true,
    fillOptions: LEGACY_CLEANUP_FILL_OPTIONS,
  });
  return fill.filledAvgPrice;
}

async function finalizeAfterSync(
  needsManualClose: string[],
  archivedTradeIds: string[]
): Promise<{ needsManualClose: string[]; archivedTradeIds: string[] }> {
  const postSyncOpen = await getOpenTrades("paper");
  if (postSyncOpen.length === 0) {
    return { needsManualClose, archivedTradeIds };
  }

  for (const symbol of new Set(postSyncOpen.map((t) => t.symbol))) {
    if (!needsManualClose.includes(symbol)) {
      needsManualClose.push(symbol);
    }
  }
  const ids = await archiveNeedsManualClose(postSyncOpen);
  archivedTradeIds.push(...ids);
  deleteAutoExitMetaForTrades(ids);
  return { needsManualClose, archivedTradeIds };
}

/** One-time cleanup for legacy open paper trades (pre auto-exit TP/SL). */
export async function cleanupLegacyPaperTrades(): Promise<LegacyPaperCleanupResult> {
  if (!hasPaperCredentials()) {
    throw new Error("Paper Alpaca credentials are not configured");
  }

  const schedule = evaluateTradingSchedule(loadTradingScheduleSettings());
  const marketOpen = schedule.allowed;

  const openPaperBefore = await getOpenTrades("paper");
  const ordersCancelled = await cancelAllOpenOrders(true);
  await sleep(500);

  const brokerClosed: string[] = [];
  const needsManualClose: string[] = [];
  const orphanedDbOnly: string[] = [];
  const closedTradeIds: string[] = [];
  let archivedTradeIds: string[] = [];

  if (!marketOpen) {
    console.log("[legacy-paper-cleanup] Market closed — archiving open paper trades as needs_manual_close");
    const ids = await archiveAllOpenPaperTrades(openPaperBefore);
    archivedTradeIds.push(...ids);
    for (const symbol of new Set(openPaperBefore.map((t) => t.symbol))) {
      needsManualClose.push(symbol);
    }
    deleteAutoExitMetaForTrades(archivedTradeIds);

    const remainingPositions = await getPositions(true);
    saveLegacyPaperBlockSymbols(
      remainingPositions.map((p) => p.symbol),
      "Market closed — close paper positions manually in Alpaca"
    );

    const sync = await syncAlpacaPositions("paper");
    const finalized = await finalizeAfterSync(needsManualClose, archivedTradeIds);
    resetAllRiskEngines();

    return {
      ordersCancelled,
      symbolsAttempted: 0,
      brokerClosed,
      needsManualClose: [...new Set(finalized.needsManualClose)],
      orphanedDbOnly,
      closedTradeIds,
      archivedTradeIds: [...new Set(finalized.archivedTradeIds)],
      openPaperRemaining: (await getOpenTrades("paper")).length,
      marketOpen: false,
      skippedBrokerLiquidation: true,
      sync,
    };
  }

  const positions = await getPositions(true);
  const tradesBySymbol = new Map<string, Trade[]>();
  for (const trade of openPaperBefore) {
    const list = tradesBySymbol.get(trade.symbol) ?? [];
    list.push(trade);
    tradesBySymbol.set(trade.symbol, list);
  }

  const positionSymbols = new Set(positions.map((p) => p.symbol));

  for (const position of positions) {
    const symbol = position.symbol;
    const qty = alpacaPositionQty(position);
    const side = alpacaPositionSide(position);
    if (qty <= 0) continue;

    const dbTrades = tradesBySymbol.get(symbol) ?? [];

    try {
      if (side !== "buy") {
        throw new Error("Short paper positions require manual close in Alpaca");
      }

      const exitPrice = await liquidatePaperSymbol(symbol, qty);
      brokerClosed.push(symbol);
      if (dbTrades.length > 0) {
        const ids = await closePaperTradesAtPrice(dbTrades, exitPrice, Date.now());
        closedTradeIds.push(...ids);
        tradesBySymbol.delete(symbol);
      }
    } catch (err) {
      console.error("[legacy-paper-cleanup] Could not liquidate", symbol, err);
      needsManualClose.push(symbol);
      if (dbTrades.length > 0) {
        const ids = await archiveNeedsManualClose(dbTrades);
        archivedTradeIds.push(...ids);
        tradesBySymbol.delete(symbol);
      }
    }
  }

  for (const [symbol, trades] of tradesBySymbol) {
    if (positionSymbols.has(symbol)) continue;
    orphanedDbOnly.push(symbol);
    const ids = await archiveNeedsManualClose(trades);
    archivedTradeIds.push(...ids);
  }

  deleteAutoExitMetaForTrades([...closedTradeIds, ...archivedTradeIds]);

  const remainingPositions = await getPositions(true);
  const blockSymbols = remainingPositions.map((p) => p.symbol);
  if (blockSymbols.length > 0) {
    saveLegacyPaperBlockSymbols(blockSymbols, "Alpaca paper positions need manual close at broker");
  } else {
    clearLegacyPaperBlockSymbols();
  }

  const sync = await syncAlpacaPositions("paper");
  const finalized = await finalizeAfterSync(needsManualClose, archivedTradeIds);
  resetAllRiskEngines();

  return {
    ordersCancelled,
    symbolsAttempted: positions.length,
    brokerClosed,
    needsManualClose: [...new Set(finalized.needsManualClose)],
    orphanedDbOnly,
    closedTradeIds,
    archivedTradeIds: [...new Set(finalized.archivedTradeIds)],
    openPaperRemaining: (await getOpenTrades("paper")).length,
    marketOpen: true,
    skippedBrokerLiquidation: false,
    sync,
  };
}

export async function getLegacyCleanupSummary() {
  const trades = await getAllTrades();
  const archived = await getArchivedTrades();
  const openPaper = trades.filter((t) => t.mode === "paper" && t.status === "open");
  const closedPaper = trades.filter((t) => t.mode === "paper" && t.status === "closed");
  const manualClose = archived.filter(
    (t) => t.mode === "paper" && t.status === "needs_manual_close"
  );
  return {
    openPaperCount: openPaper.length,
    closedPaperCount: closedPaper.length,
    needsManualCloseCount: manualClose.length,
    autoExitReady: openPaper.length === 0,
  };
}

export interface CloseArchivedLegacyResult {
  brokerClosed: string[];
  brokerFailed: string[];
  dbClosed: string[];
  dbFlat: string[];
  dbMarkedToMarket: string[];
  remainingPositions: string[];
}

/** Liquidate Alpaca paper positions and mark archived needs_manual_close trades as closed. */
export async function closeArchivedLegacyPaperTrades(options?: {
  markToMarketOnBrokerFailure?: boolean;
}): Promise<CloseArchivedLegacyResult> {
  const markToMarketOnBrokerFailure = options?.markToMarketOnBrokerFailure ?? true;
  if (!hasPaperCredentials()) {
    throw new Error("Paper Alpaca credentials are not configured");
  }

  const archived = await getArchivedTrades();
  const pending = archived.filter(
    (t) => t.mode === "paper" && t.status === "needs_manual_close"
  );
  if (pending.length === 0) {
    return {
      brokerClosed: [],
      brokerFailed: [],
      dbClosed: [],
      dbFlat: [],
      dbMarkedToMarket: [],
      remainingPositions: [],
    };
  }

  await cancelAllOpenOrders(true);
  await sleep(500);

  const schedule = evaluateTradingSchedule(loadTradingScheduleSettings());
  const tryBrokerLiquidation = schedule.allowed;

  const tradesBySymbol = new Map<string, Trade[]>();
  for (const trade of pending) {
    const list = tradesBySymbol.get(trade.symbol) ?? [];
    list.push(trade);
    tradesBySymbol.set(trade.symbol, list);
  }

  const positions = await getPositions(true);
  const positionBySymbol = new Map(
    positions.map((p) => [p.symbol, p] as const)
  );

  const brokerClosed: string[] = [];
  const brokerFailed: string[] = [];
  const dbClosed: string[] = [];
  const dbFlat: string[] = [];
  const dbMarkedToMarket: string[] = [];
  const exitTime = Date.now();

  for (const [symbol, trades] of tradesBySymbol) {
    const position = positionBySymbol.get(symbol);
    const qty = position ? alpacaPositionQty(position) : 0;
    const side = position ? alpacaPositionSide(position) : null;

    let exitPrice: number | null = null;
    let brokerFilled = false;

    if (position && qty > 0 && side === "buy") {
      if (tryBrokerLiquidation) {
        try {
          await cancelOpenExitOrdersForSymbol(symbol, "sell", true);
          await cancelOpenExitOrdersForSymbol(symbol, "buy", true);
          await sleep(400);
          const fill = await liquidatePositionWithFill({
            symbol,
            qty,
            paper: true,
            fillOptions: LEGACY_CLEANUP_FILL_OPTIONS,
          });
          exitPrice = fill.filledAvgPrice;
          brokerFilled = true;
          brokerClosed.push(symbol);
          positionBySymbol.delete(symbol);
        } catch (err) {
          console.error("[close-archived-legacy] Could not liquidate", symbol, err);
          if (markToMarketOnBrokerFailure) {
            exitPrice = parseFloat(position.current_price) || trades[0]?.entryPrice || 0;
            dbMarkedToMarket.push(symbol);
          } else {
            brokerFailed.push(symbol);
            continue;
          }
        }
      } else if (markToMarketOnBrokerFailure) {
        exitPrice = parseFloat(position.current_price) || trades[0]?.entryPrice || 0;
        dbMarkedToMarket.push(symbol);
      } else {
        brokerFailed.push(symbol);
        continue;
      }
    } else if (position && qty > 0 && side !== "buy") {
      brokerFailed.push(symbol);
      continue;
    } else {
      exitPrice = trades[0]?.entryPrice ?? 0;
      dbFlat.push(symbol);
    }

    if (exitPrice == null) continue;

    for (const trade of trades) {
      const pnl = computeClosePnl(trade, exitPrice);
      await upsertTrade({
        ...trade,
        exitPrice,
        exitTime,
        pnl,
        pnlPercent: computeClosePnlPercent(trade, pnl),
        status: "closed",
        archived: true,
      });
      dbClosed.push(trade.id);
    }

    if (brokerFilled) {
      await sleep(300);
    }
  }

  const remainingPositions = (await getPositions(true)).map((p) => p.symbol);
  if (remainingPositions.length === 0) {
    clearLegacyPaperBlockSymbols();
  } else {
    saveLegacyPaperBlockSymbols(
      remainingPositions,
      "Alpaca paper positions still open after archive close attempt"
    );
  }

  await syncAlpacaPositions("paper");
  deleteAutoExitMetaForTrades(dbClosed);

  return {
    brokerClosed,
    brokerFailed,
    dbClosed,
    dbFlat,
    dbMarkedToMarket,
    remainingPositions,
  };
}
