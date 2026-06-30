const { createPrismaClient } = require("./prisma-client.cjs");
const prisma = createPrismaClient();
const ET = { timeZone: "America/New_York" };

async function main() {
  const closed = await prisma.trade.findMany({
    where: { status: "closed", pnl: { not: null } },
    orderBy: { exitTime: "desc" },
    take: 20,
  });
  console.log("=== Last 20 closed trades ===");
  for (const t of closed) {
    console.log(
      `${new Date(t.exitTime).toLocaleString("en-US", ET)} | ${t.symbol.padEnd(5)} | ${t.strategy.slice(0, 30).padEnd(30)} | pnl $${t.pnl.toFixed(2)} | slot ${t.chartSlot}`
    );
  }

  const open = await prisma.trade.findMany({ where: { status: "open" } });
  console.log("\n=== Open trades (real vs sync) ===");
  for (const t of open) {
    const isSync = t.strategy === "alpaca-sync" || t.chartSlot === "alpaca-sync";
    const ageH = ((Date.now() - t.entryTime.getTime()) / 3600000).toFixed(1);
    console.log(
      `${isSync ? "SYNC" : "APP "} | ${t.symbol.padEnd(5)} | ${t.strategy.slice(0, 25).padEnd(25)} | entry ${new Date(t.entryTime).toLocaleString("en-US", ET)} | ${ageH}h | slot ${t.chartSlot}`
    );
  }
}

main().finally(() => prisma.$disconnect());
