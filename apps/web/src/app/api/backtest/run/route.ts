import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@wicksense/core";
import type { StrategyPreset } from "@wicksense/core";
import { fetchBars } from "@/lib/alpaca";

export async function POST(req: NextRequest) {
  const { symbol, preset } = (await req.json()) as {
    symbol: string;
    preset: StrategyPreset;
  };

  const { bars } = await fetchBars(symbol, preset.timeframe, 500);
  const result = runBacktest(symbol, bars, preset);
  return NextResponse.json({ result });
}
