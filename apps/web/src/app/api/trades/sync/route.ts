import { NextResponse } from "next/server";
import { computePerformanceStats } from "@wicksense/core";
import { syncAllAlpacaPositions } from "@/lib/position-sync";
import { getAllTrades } from "@/lib/trade-store";

export async function GET() {
  const sync = await syncAllAlpacaPositions();
  const trades = getAllTrades();
  const performance = computePerformanceStats(trades);

  return NextResponse.json({
    trades,
    performance,
    sync,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST() {
  return GET();
}
