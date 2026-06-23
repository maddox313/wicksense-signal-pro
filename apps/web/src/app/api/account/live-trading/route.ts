import { NextRequest, NextResponse } from "next/server";
import {
  loadLiveTradingSettings,
  saveLiveTradingSettings,
  computeStopLossPrice,
} from "@/lib/live-trading-config";
import {
  getLivePositions,
  getLiveOpenOrders,
} from "@/lib/alpaca";
import { hasLiveCredentials } from "@/lib/broker-config";

export async function GET() {
  const settings = loadLiveTradingSettings();
  const configured = hasLiveCredentials();

  if (!configured) {
    return NextResponse.json({
      configured: false,
      settings,
      positions: [],
      stopOrders: [],
    });
  }

  try {
    const [positions, orders] = await Promise.all([
      getLivePositions(),
      getLiveOpenOrders(),
    ]);
    const stopOrders = orders.filter(
      (o) => o.side === "sell" && (o.type === "stop" || o.type === "stop_limit")
    );

    return NextResponse.json({
      configured: true,
      settings,
      positions,
      stopOrders,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      settings,
      positions: [],
      stopOrders: [],
      error: err instanceof Error ? err.message : "Failed to load live account data",
    });
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<{ brokerStopLossEnabled: boolean; stopLossPercent: number }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const settings = saveLiveTradingSettings(body);
  return NextResponse.json({
    success: true,
    settings,
    exampleStopOn310: computeStopLossPrice(310, settings.stopLossPercent),
  });
}
