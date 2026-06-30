const { createPrismaClient } = require("./prisma-client.cjs");
const prisma = createPrismaClient();

async function main() {
  const all = await prisma.trade.count();
  const archived = await prisma.trade.count({ where: { archived: true } });
  const closed = await prisma.trade.count({ where: { status: "closed" } });
  const withPnl = await prisma.trade.findMany({
    where: { pnl: { not: null } },
    take: 20,
    orderBy: { entryTime: "desc" },
  });
  const closedOrArchived = await prisma.trade.findMany({
    where: { OR: [{ status: "closed" }, { archived: true }] },
    take: 20,
  });
  console.log(
    JSON.stringify(
      {
        all,
        archived,
        closed,
        withPnlCount: withPnl.length,
        withPnlSample: withPnl.map((r) => ({
          symbol: r.symbol,
          status: r.status,
          pnl: r.pnl,
          strategy: r.strategy,
        })),
        closedOrArchived,
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect());
