import { NextResponse } from "next/server";
import { computePerformanceStats } from "@wicksense/core";
import { fetchAllUnrealizedPnl } from "@/lib/alpaca-unrealized-pnl";
import { hasLiveCredentials, hasPaperCredentials } from "@/lib/broker-config";
import { syncAllAlpacaPositions } from "@/lib/position-sync";
import { getAllTrades } from "@/lib/trade-store";

const ROUTE_NAME = "/api/trades/sync";

export async function GET() {
  const paperKeysFound = hasPaperCredentials();
  const liveKeysFound = hasLiveCredentials();
  const databaseUrlSet = Boolean(process.env.DATABASE_URL);

  console.log(`[${ROUTE_NAME}] sync request`, {
    route: ROUTE_NAME,
    paperKeysFound,
    liveKeysFound,
    databaseUrlSet,
  });

  try {
    const sync = await syncAllAlpacaPositions();
    const trades = await getAllTrades();
    const performance = computePerformanceStats(trades);
    const unrealizedPnl = await fetchAllUnrealizedPnl(trades);

    console.log(`[${ROUTE_NAME}] sync completed`, {
      paper: {
        skipped: sync.paper.skipped,
        imported: sync.paper.imported,
        closed: sync.paper.closed,
        error: sync.paper.error,
      },
      live: {
        skipped: sync.live.skipped,
        imported: sync.live.imported,
        closed: sync.live.closed,
        error: sync.live.error,
      },
      tradeCount: trades.length,
      unrealizedPnl: {
        paperPositions: unrealizedPnl.paper.positionCount,
        paperMatchedSymbols: unrealizedPnl.paper.matchedSymbols,
        paperTotalUnrealizedPl: unrealizedPnl.paper.totalUnrealizedPl,
        livePositions: unrealizedPnl.live.positionCount,
        liveMatchedSymbols: unrealizedPnl.live.matchedSymbols,
        liveTotalUnrealizedPl: unrealizedPnl.live.totalUnrealizedPl,
      },
    });

    return NextResponse.json({
      trades,
      performance,
      sync,
      unrealizedPnl,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[${ROUTE_NAME}] sync failed`, { message, stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
