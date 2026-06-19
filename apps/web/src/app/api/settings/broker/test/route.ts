import { NextResponse } from "next/server";
import { hasPaperCredentials } from "@/lib/alpaca";
import { getPaperCredentials } from "@/lib/broker-config";

export async function GET() {
  if (!hasPaperCredentials()) {
    return NextResponse.json({ ok: false, error: "No paper Alpaca credentials saved" });
  }

  const end = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const start = new Date(Date.now() - 7 * 86400000).toISOString();
  const { apiKey, secretKey } = getPaperCredentials();

  const url = `https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=1Day&start=${start}&end=${end}&limit=5&feed=iex`;

  try {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": secretKey,
      },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: (data as { message?: string }).message || "Alpaca rejected the request",
      });
    }
    const count = ((data as { bars?: unknown[] }).bars ?? []).length;
    return NextResponse.json({
      ok: count > 0,
      status: res.status,
      barCount: count,
      message: count > 0 ? "Alpaca connection working" : "Connected but no bars returned",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    });
  }
}
