import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

const DAY_TP = 1.5;
const DAY_SL = 1.0;
const SWING_TP = 3.0;
const SWING_SL = 1.5;

function readMeta() {
  const p = path.join(webRoot, "auto-exit-meta.local.json");
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return raw.trades ?? {};
  } catch {
    return {};
  }
}

function inferStyle(trade) {
  const tf = trade.timeframe ?? "";
  if (tf === "1d" || tf === "4h" || tf === "1w") return "swing";
  return "day";
}

function configuredLevels(trade) {
  const style = inferStyle(trade);
  const tpPct = style === "swing" ? SWING_TP : DAY_TP;
  const slPct = style === "swing" ? SWING_SL : DAY_SL;
  const entry = trade.entryPrice;
  const isLong = trade.side === "buy";
  const tp = isLong ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100);
  const sl = isLong ? entry * (1 - slPct / 100) : entry * (1 + slPct / 100);
  return {
    style,
    tpPct,
    slPct,
    configuredTp: Math.round(tp * 100) / 100,
    configuredSl: Math.round(sl * 100) / 100,
  };
}

function classifyExit(trade, meta) {
  const strategy = trade.strategy ?? "";
  const closeReason = meta?.closeReason ?? null;

  if (strategy.startsWith("closed:")) {
    const reason = strategy.slice("closed:".length);
    if (reason === "alpaca-flat") return "Alpaca Sync (alpaca-flat)";
    return `Alpaca Sync (${reason})`;
  }
  if (closeReason === "TAKE_PROFIT") return "Take Profit";
  if (closeReason === "STOP_LOSS") return "Stop Loss";
  if (closeReason === "SESSION_END") return "Time Exit (SESSION_END flatten)";
  if (strategy === "alpaca-sync") return "Alpaca Sync (imported, closed elsewhere)";
  // Signal sell / manual without closeReason
  if (trade.chartSlot && trade.signalId) return "Signal Sell (strategy exit, no closeReason)";
  if (trade.mode === "manual") return "Manual";
  return "Unknown / Manual (no closeReason recorded)";
}

function evaluateWouldHaveHit(trade, levels, exitPrice) {
  if (!exitPrice) return { tpHit: false, slHit: false };
  const isLong = trade.side === "buy";
  if (isLong) {
    return {
      tpHit: exitPrice >= levels.configuredTp,
      slHit: exitPrice <= levels.configuredSl,
    };
  }
  return {
    tpHit: exitPrice <= levels.configuredTp,
    slHit: exitPrice >= levels.configuredSl,
  };
}

const metaById = readMeta();
const trades = await prisma.trade.findMany({
  where: { status: "closed" },
  orderBy: { exitTime: "desc" },
});

const rows = trades.map((t) => {
  const meta = metaById[t.id];
  const levels = configuredLevels(t);
  const exitType = classifyExit(t, meta);
  const exitPrice = t.exitPrice ?? null;
  const hit = evaluateWouldHaveHit(t, levels, exitPrice);
  return {
    id: t.id,
    symbol: t.symbol,
    chartSlot: t.chartSlot,
    strategy: t.strategy,
    mode: t.mode,
    timeframe: t.timeframe,
    entryPrice: t.entryPrice,
    exitPrice,
    pnl: t.pnl,
    pnlPercent: t.pnlPercent,
    configuredTp: levels.configuredTp,
    configuredSl: levels.configuredSl,
    tpPct: levels.tpPct,
    slPct: levels.slPct,
    dbStopLoss: t.stopLossPrice,
    metaTakeProfit: meta?.takeProfitPrice ?? null,
    metaCloseReason: meta?.closeReason ?? null,
    metaOutcome: meta?.outcome ?? null,
    exitType,
    wouldHitTpAtExit: hit.tpHit,
    wouldHitSlAtExit: hit.slHit,
    entryTime: t.entryTime?.toISOString?.() ?? t.entryTime,
    exitTime: t.exitTime?.toISOString?.() ?? t.exitTime,
  };
});

const byExit = {};
for (const r of rows) {
  byExit[r.exitType] = (byExit[r.exitType] ?? 0) + 1;
}

const alpacaFlat = rows.filter((r) => r.exitType.includes("alpaca-flat"));
const smallWins = rows.filter((r) => (r.pnl ?? 0) > 0 && (r.pnl ?? 0) < 50);
const smallWinPct = rows.filter(
  (r) => (r.pnlPercent ?? 0) > 0 && (r.pnlPercent ?? 0) < 1.5
);

console.log(
  JSON.stringify(
    {
      summary: {
        totalClosed: rows.length,
        byExitType: byExit,
        alpacaFlatCount: alpacaFlat.length,
        withMetaCloseReason: rows.filter((r) => r.metaCloseReason).length,
        takeProfitMeta: rows.filter((r) => r.metaCloseReason === "TAKE_PROFIT").length,
        stopLossMeta: rows.filter((r) => r.metaCloseReason === "STOP_LOSS").length,
        sessionEndMeta: rows.filter((r) => r.metaCloseReason === "SESSION_END").length,
        smallDollarWinsUnder50: smallWins.length,
        smallPctWinsUnder1_5: smallWinPct.length,
      },
      alpacaFlatTrades: alpacaFlat,
      allTrades: rows,
    },
    null,
    2
  )
);

await prisma.$disconnect();
