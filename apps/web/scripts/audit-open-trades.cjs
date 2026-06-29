const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const ET = "America/New_York";

function et(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString("en-US", { timeZone: ET });
}

function dayKey(ts) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

async function main() {
  const todayKey = dayKey(Date.now());
  const all = await prisma.trade.findMany({ orderBy: { entryTime: "desc" } });
  const open = all.filter((t) => t.status === "open");
  const closed = all.filter((t) => t.status === "closed" && t.pnl != null);

  const closedToday = closed.filter((t) => t.exitTime && dayKey(t.exitTime.getTime()) === todayKey);
  const todayPnl = closedToday.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const byStrategy = {};
  for (const t of open) {
    const key = t.strategy.slice(0, 40);
    byStrategy[key] = (byStrategy[key] ?? 0) + 1;
  }

  const staleOpen = open.filter((t) => {
    const ageHours = (Date.now() - t.entryTime.getTime()) / 3600000;
    return ageHours > 8;
  });

  console.log(
    JSON.stringify(
      {
        todayKey,
        totals: {
          all: all.length,
          open: open.length,
          closed: closed.length,
          closedToday: closedToday.length,
          todayPnl: +todayPnl.toFixed(2),
          allTimePnl: +closed.reduce((s, t) => s + t.pnl, 0).toFixed(2),
          winsAllTime: closed.filter((t) => t.pnl > 0).length,
          lossesAllTime: closed.filter((t) => t.pnl <= 0).length,
        },
        openByStrategy: byStrategy,
        staleOpenOver8h: staleOpen.map((t) => ({
          id: t.id.slice(0, 40),
          symbol: t.symbol,
          side: t.side,
          qty: t.quantity,
          entry: t.entryPrice,
          mode: t.mode,
          strategy: t.strategy.slice(0, 35),
          chartSlot: t.chartSlot,
          entryET: et(t.entryTime.getTime()),
          ageHours: +((Date.now() - t.entryTime.getTime()) / 3600000).toFixed(1),
        })),
        openTrades: open.map((t) => ({
          symbol: t.symbol,
          side: t.side,
          qty: t.quantity,
          entry: t.entryPrice,
          mode: t.mode,
          strategy: t.strategy.slice(0, 35),
          chartSlot: t.chartSlot,
          entryET: et(t.entryTime.getTime()),
          signalId: t.signalId ? "yes" : "no",
          alpacaOrderId: t.alpacaOrderId ? "yes" : "no",
        })),
        lastClosedToday: closedToday.slice(0, 8).map((t) => ({
          symbol: t.symbol,
          pnl: t.pnl,
          exitET: et(t.exitTime?.getTime()),
          strategy: t.strategy.slice(0, 35),
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
