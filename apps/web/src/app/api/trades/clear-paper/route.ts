import { NextResponse } from "next/server";
import { computePerformanceStats } from "@wicksense/core";
import { resetAllRiskEngines } from "@/lib/risk-engine-registry";
import { deleteTradesByMode, getAllTrades } from "@/lib/trade-store";

export async function POST() {
  const deleted = await deleteTradesByMode("paper");
  resetAllRiskEngines();

  const trades = await getAllTrades();
  const performance = computePerformanceStats(trades);

  return NextResponse.json({
    deleted,
    trades,
    performance,
    updatedAt: new Date().toISOString(),
  });
}
