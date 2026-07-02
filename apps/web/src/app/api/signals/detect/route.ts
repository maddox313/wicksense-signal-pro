import { NextRequest, NextResponse } from "next/server";
import { detectCurrentBarSignals, detectFreshBarSignal } from "@wicksense/core";
import type { OHLCV, TradingStyle } from "@wicksense/core";

export async function POST(req: NextRequest) {
  let body: {
    symbol?: string;
    bars?: OHLCV[];
    strategyIds?: string[];
    style?: TradingStyle;
    timeframe?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { symbol, bars, strategyIds, style, timeframe } = body;
  if (!symbol || !bars?.length || !strategyIds?.length || !style) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const tf = timeframe || (style === "day" ? "15m" : "1d");
  const signal = detectFreshBarSignal(symbol, bars, strategyIds, style, tf);
  const barSignals = detectCurrentBarSignals(symbol, bars, strategyIds, style, tf);
  return NextResponse.json({ signal, barSignals });
}
