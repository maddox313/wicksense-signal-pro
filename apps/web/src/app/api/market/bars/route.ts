import { NextRequest, NextResponse } from "next/server";
import { fetchBars } from "@/lib/alpaca";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "AAPL";
  const timeframe = req.nextUrl.searchParams.get("timeframe") ?? "5m";
  const { bars, source, error } = await fetchBars(symbol, timeframe);
  return NextResponse.json({ symbol, timeframe, bars, source, error });
}
