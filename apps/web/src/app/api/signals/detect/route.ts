import { NextRequest, NextResponse } from "next/server";
import { detectRecentSignal } from "@wicksense/core";
import type { OHLCV, TradingStyle } from "@wicksense/core";

export async function POST(req: NextRequest) {
  let body: {
    symbol?: string;
    bars?: OHLCV[];
    strategyIds?: string[];
    style?: TradingStyle;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { symbol, bars, strategyIds, style } = body;
  if (!symbol || !bars?.length || !strategyIds?.length || !style) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const signal = detectRecentSignal(symbol, bars, strategyIds, style);
  return NextResponse.json({ signal });
}
