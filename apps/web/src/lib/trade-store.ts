import fs from "fs";
import path from "path";
import type { Trade as PrismaTrade } from "@prisma/client";
import type { Trade, TradeMode } from "@wicksense/core";
import { isAccountSyncTrade } from "@wicksense/core";
import { prisma } from "@/lib/db";
import { ensureDefaultUserId } from "@/lib/default-user";

const LEGACY_TRADES_PATH = path.join(process.cwd(), "trades.local.json");
const LEGACY_BACKUP_PATH = path.join(process.cwd(), "trades.local.json.bak");

let storeReady: Promise<void> | null = null;

function rowToTrade(row: PrismaTrade): Trade {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side as Trade["side"],
    quantity: row.quantity,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice ?? undefined,
    entryTime: row.entryTime.getTime(),
    exitTime: row.exitTime?.getTime(),
    pnl: row.pnl ?? undefined,
    pnlPercent: row.pnlPercent ?? undefined,
    mode: row.mode as Trade["mode"],
    strategy: row.strategy,
    status: row.status as Trade["status"],
    chartSlot: row.chartSlot ?? undefined,
    timeframe: row.timeframe ?? undefined,
    signalId: row.signalId ?? undefined,
    stopLossPrice: row.stopLossPrice ?? undefined,
    alpacaOrderId: row.alpacaOrderId ?? undefined,
    alpacaStopOrderId: row.alpacaStopOrderId ?? undefined,
    archived: row.archived ?? undefined,
    archivedAt: row.archivedAt?.getTime(),
  };
}

function tradeToRow(trade: Trade, userId: string) {
  return {
    id: trade.id,
    userId,
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice ?? null,
    entryTime: new Date(trade.entryTime),
    exitTime: trade.exitTime ? new Date(trade.exitTime) : null,
    pnl: trade.pnl ?? null,
    pnlPercent: trade.pnlPercent ?? null,
    mode: trade.mode,
    strategy: trade.strategy,
    status: trade.status,
    chartSlot: trade.chartSlot ?? null,
    timeframe: trade.timeframe ?? null,
    signalId: trade.signalId ?? null,
    stopLossPrice: trade.stopLossPrice ?? null,
    alpacaOrderId: trade.alpacaOrderId ?? null,
    alpacaStopOrderId: trade.alpacaStopOrderId ?? null,
    archived: trade.archived ?? false,
    archivedAt: trade.archivedAt ? new Date(trade.archivedAt) : null,
  };
}

async function migrateLegacyTrades(userId: string): Promise<number> {
  if (!fs.existsSync(LEGACY_TRADES_PATH)) return 0;

  let legacy: Trade[] = [];
  try {
    const raw = fs.readFileSync(LEGACY_TRADES_PATH, "utf8");
    const data = JSON.parse(raw) as Trade[];
    legacy = Array.isArray(data) ? data : [];
  } catch {
    return 0;
  }

  if (legacy.length === 0) {
    fs.renameSync(LEGACY_TRADES_PATH, LEGACY_BACKUP_PATH);
    return 0;
  }

  const existing = await prisma.trade.count({ where: { userId } });
  if (existing > 0) {
    fs.renameSync(LEGACY_TRADES_PATH, LEGACY_BACKUP_PATH);
    return 0;
  }

  for (const trade of legacy) {
    await prisma.trade.create({ data: tradeToRow(trade, userId) });
  }

  fs.renameSync(LEGACY_TRADES_PATH, LEGACY_BACKUP_PATH);
  return legacy.length;
}

export async function ensureTradeStoreReady(): Promise<string> {
  if (!storeReady) {
    storeReady = (async () => {
      const userId = await ensureDefaultUserId();
      await migrateLegacyTrades(userId);
    })();
  }
  await storeReady;
  return ensureDefaultUserId();
}

export async function getAllTrades(): Promise<Trade[]> {
  const userId = await ensureTradeStoreReady();
  const rows = await prisma.trade.findMany({
    where: { userId, archived: false },
    orderBy: { entryTime: "desc" },
  });
  return rows.map(rowToTrade);
}

export async function getArchivedTrades(): Promise<Trade[]> {
  const userId = await ensureTradeStoreReady();
  const rows = await prisma.trade.findMany({
    where: { userId, archived: true },
    orderBy: { entryTime: "desc" },
  });
  return rows.map(rowToTrade);
}

export async function archiveTrades(params: {
  tradeIds?: string[];
  archiveAllClosed?: boolean;
  mode?: TradeMode;
}): Promise<{ archived: number; trades: Trade[] }> {
  const userId = await ensureTradeStoreReady();
  const now = new Date();

  let toArchive: Trade[] = [];
  if (params.tradeIds?.length) {
    const rows = await prisma.trade.findMany({
      where: { userId, id: { in: params.tradeIds }, archived: false },
    });
    toArchive = rows.map(rowToTrade).filter((t) => t.status === "closed");
  } else if (params.archiveAllClosed) {
    const rows = await prisma.trade.findMany({
      where: {
        userId,
        archived: false,
        status: "closed",
        ...(params.mode ? { mode: params.mode } : {}),
      },
    });
    toArchive = rows.map(rowToTrade);
  }

  if (toArchive.length === 0) {
    return { archived: 0, trades: await getAllTrades() };
  }

  await prisma.trade.updateMany({
    where: { userId, id: { in: toArchive.map((t) => t.id) } },
    data: { archived: true, archivedAt: now },
  });

  return { archived: toArchive.length, trades: await getAllTrades() };
}

export async function setAllTrades(next: Trade[]): Promise<void> {
  const userId = await ensureTradeStoreReady();
  await prisma.$transaction([
    prisma.trade.deleteMany({ where: { userId } }),
    ...next.map((trade) => prisma.trade.create({ data: tradeToRow(trade, userId) })),
  ]);
}

export async function getOpenTrades(mode?: TradeMode): Promise<Trade[]> {
  const userId = await ensureTradeStoreReady();
  const rows = await prisma.trade.findMany({
    where: {
      userId,
      status: "open",
      archived: false,
      ...(mode ? { mode } : {}),
    },
    orderBy: { entryTime: "desc" },
  });
  return rows.map(rowToTrade);
}

export async function findOpenTrade(
  symbol: string,
  mode: TradeMode,
  chartSlot?: string,
  side: Trade["side"] = "buy"
): Promise<Trade | undefined> {
  const open = (await getOpenTrades(mode)).filter(
    (t) => t.symbol === symbol && t.side === side
  );
  if (chartSlot) {
    return open.find((t) => t.chartSlot === chartSlot) ?? open[0];
  }
  return open[0];
}

export async function hasOpenAlpacaPosition(
  symbol: string,
  mode: "paper" | "live",
  side: Trade["side"] = "buy"
): Promise<boolean> {
  return (await getOpenTrades(mode)).some((t) => t.symbol === symbol && t.side === side);
}

export async function deleteTrade(id: string): Promise<boolean> {
  await ensureTradeStoreReady();
  try {
    await prisma.trade.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** Remove alpaca-sync imports superseded by an app-created trade for the same position. */
export async function deleteSyncImportsForPosition(
  symbol: string,
  side: Trade["side"],
  mode: TradeMode
): Promise<number> {
  const open = await getOpenTrades(mode);
  let removed = 0;
  for (const trade of open) {
    if (
      trade.symbol === symbol &&
      trade.side === side &&
      isAccountSyncTrade(trade)
    ) {
      if (await deleteTrade(trade.id)) removed++;
    }
  }
  return removed;
}

export async function findLatestStrategyAttribution(
  symbol: string,
  side: Trade["side"],
  mode: TradeMode
): Promise<{
  strategy: string;
  chartSlot: string;
  signalId?: string;
  timeframe?: string;
  entryTime: number;
} | null> {
  const userId = await ensureTradeStoreReady();
  const rows = await prisma.trade.findMany({
    where: {
      userId,
      symbol,
      side,
      mode,
      NOT: {
        OR: [{ strategy: "alpaca-sync" }, { strategy: { startsWith: "closed:" } }],
      },
    },
    orderBy: { entryTime: "desc" },
    take: 5,
  });

  for (const row of rows) {
    const trade = rowToTrade(row);
    if (isAccountSyncTrade(trade)) continue;
    const strategy = trade.strategy.trim();
    if (!strategy) continue;
    return {
      strategy,
      chartSlot: trade.chartSlot ?? "main",
      signalId: trade.signalId,
      timeframe: trade.timeframe,
      entryTime: trade.entryTime,
    };
  }

  return null;
}

export async function upsertTrade(trade: Trade): Promise<Trade> {
  const userId = await ensureTradeStoreReady();
  const row = await prisma.trade.upsert({
    where: { id: trade.id },
    create: tradeToRow(trade, userId),
    update: tradeToRow(trade, userId),
  });
  return rowToTrade(row);
}

export async function deleteTradesByMode(mode: TradeMode): Promise<number> {
  const userId = await ensureTradeStoreReady();
  const result = await prisma.trade.deleteMany({ where: { userId, mode, archived: false } });
  return result.count;
}

export async function updateTrade(
  id: string,
  updates: Partial<Trade>
): Promise<Trade | undefined> {
  await ensureTradeStoreReady();
  const existing = await prisma.trade.findUnique({ where: { id } });
  if (!existing) return undefined;

  const current = rowToTrade(existing);
  return upsertTrade({ ...current, ...updates });
}
