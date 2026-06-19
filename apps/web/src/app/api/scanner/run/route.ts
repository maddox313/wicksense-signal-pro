import { NextRequest, NextResponse } from "next/server";
import { scanMarket } from "@wicksense/core";
import { fetchBars, WATCHLIST } from "@/lib/alpaca";
import type { TradingStyle } from "@wicksense/core";

export async function POST(req: NextRequest) {
  const { strategyIds, style } = (await req.json()) as {
    strategyIds: string[];
    style: TradingStyle;
  };

  const data = await Promise.all(
    WATCHLIST.map(async (symbol) => {
      const { bars } = await fetchBars(symbol, style === "day" ? "5m" : "1d", 100);
      const changePercent =
        bars.length >= 2
          ? ((bars[bars.length - 1].close - bars[bars.length - 2].close) / bars[bars.length - 2].close) * 100
          : 0;
      return { symbol, bars, changePercent };
    })
  );

  const withBars = data.filter((d) => d.bars.length >= 30);
  const results = scanMarket(withBars, strategyIds, style);
  return NextResponse.json({
    results,
    meta: {
      scanned: WATCHLIST.length,
      withData: withBars.length,
      matches: results.length,
      style,
      strategies: strategyIds,
    },
  });
}
