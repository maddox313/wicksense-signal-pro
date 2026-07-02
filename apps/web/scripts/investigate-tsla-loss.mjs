import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "fs";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const metaFile = JSON.parse(fs.readFileSync("auto-exit-meta.local.json", "utf8"));
const meta = metaFile.trades ?? {};

const trade = await prisma.trade.findFirst({
  where: { symbol: "TSLA", pnlPercent: { lt: -5 } },
  orderBy: { exitTime: "desc" },
});

if (!trade) {
  console.log("No TSLA large loss found");
} else {
  const entry = trade.entryTime?.getTime?.() ?? trade.entryTime;
  const exit = trade.exitTime?.getTime?.() ?? trade.exitTime;
  const holdMs = exit && entry ? exit - entry : null;
  const sl = trade.stopLossPrice;
  const expectedSlPct =
    trade.side === "buy" && sl
      ? ((trade.entryPrice - sl) / trade.entryPrice) * 100
      : null;
  const actualLossPct = trade.pnlPercent;
  const slMiss =
    trade.side === "buy" && sl && trade.exitPrice
      ? trade.exitPrice < sl
        ? trade.exitPrice - sl
        : 0
      : null;

  console.log(
    JSON.stringify(
      {
        id: trade.id,
        symbol: trade.symbol,
        strategy: trade.strategy,
        chartSlot: trade.chartSlot,
        mode: trade.mode,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        stopLossPrice: sl,
        pnl: trade.pnl,
        pnlPercent: actualLossPct,
        expectedSlPercent: expectedSlPct,
        slMissDollars: slMiss,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        holdHours: holdMs ? (holdMs / 3600000).toFixed(1) : null,
        meta: meta[trade.id] ?? null,
        diagnosis: {
          configuredSl: sl,
          exitBelowSl: slMiss != null && slMiss < 0,
          overnightHold: holdMs != null && holdMs > 16 * 3600000,
        },
      },
      null,
      2
    )
  );
}

await prisma.$disconnect();
