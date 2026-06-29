import { NextRequest, NextResponse } from "next/server";
import { computePerformanceStats, filterArchivedTradesOnDay, getArchivedTradeDayKeys } from "@wicksense/core";
import { archiveTrades, getAllTrades, getArchivedTrades } from "@/lib/trade-store";
import type { TradeMode } from "@wicksense/core";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const archived = await getArchivedTrades();

  if (!date) {
    return NextResponse.json({
      dates: getArchivedTradeDayKeys(archived),
      totalArchived: archived.length,
    });
  }

  const trades = filterArchivedTradesOnDay(archived, date);
  return NextResponse.json({
    date,
    trades,
    count: trades.length,
  });
}

export async function POST(req: NextRequest) {
  let body: {
    tradeIds?: string[];
    archiveAllClosed?: boolean;
    mode?: TradeMode;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await archiveTrades({
    tradeIds: body.tradeIds,
    archiveAllClosed: body.archiveAllClosed,
    mode: body.mode,
  });

  const performance = computePerformanceStats(result.trades);

  return NextResponse.json({
    archived: result.archived,
    trades: result.trades,
    performance,
  });
}
