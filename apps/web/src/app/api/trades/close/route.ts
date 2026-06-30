import { NextRequest, NextResponse } from "next/server";
import { computePerformanceStats, DEFAULT_RISK_SETTINGS, type RiskSettings } from "@wicksense/core";
import { closeTradeRecord } from "@/lib/close-trade-record";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import { getAllTrades, getTradeById } from "@/lib/trade-store";

export async function POST(req: NextRequest) {
  let body: { tradeId?: string; riskSettings?: RiskSettings };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tradeId = body.tradeId?.trim();
  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required" }, { status: 400 });
  }

  const trade = await getTradeById(tradeId);
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (trade.status !== "open") {
    return NextResponse.json({ skipped: true, reason: "Trade is already closed" });
  }

  if (trade.mode !== "paper" && trade.mode !== "live") {
    return NextResponse.json({ error: `Cannot close trade in mode: ${trade.mode}` }, { status: 400 });
  }

  const riskSettings = body.riskSettings ?? DEFAULT_RISK_SETTINGS;
  const slot = trade.chartSlot ?? "main";

  try {
    console.log("[close-trade] Manual close requested", {
      tradeId: trade.id,
      symbol: trade.symbol,
      mode: trade.mode,
      chartSlot: trade.chartSlot,
      quantity: trade.quantity,
    });

    const closed = await closeTradeRecord({ trade, riskSettings });
    const trades = await getAllTrades();
    const engine = getRiskEngine(slot, riskSettings);

    return NextResponse.json({
      ok: true,
      trade: closed,
      trades,
      performance: computePerformanceStats(trades),
      consecutiveLosses: engine.getConsecutiveLosses(),
      safetyStopTriggered: engine.isSafetyStopActive(),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[close-trade] Broker close failed — trade left open", {
      tradeId: trade.id,
      symbol: trade.symbol,
      mode: trade.mode,
      error,
    });
    return NextResponse.json({ error }, { status: 500 });
  }
}
