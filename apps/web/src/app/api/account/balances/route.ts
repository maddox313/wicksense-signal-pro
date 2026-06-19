import { NextResponse } from "next/server";
import { fetchAlpacaAccount, hasLiveCredentials, hasPaperCredentials } from "@/lib/alpaca";

export const dynamic = "force-dynamic";

export async function GET() {
  const [paperResult, liveResult] = await Promise.all([
    hasPaperCredentials()
      ? fetchAlpacaAccount(true)
      : Promise.resolve({ account: null, error: "No paper keys configured" }),
    hasLiveCredentials()
      ? fetchAlpacaAccount(false)
      : Promise.resolve({ account: null, error: "No live keys configured" }),
  ]);

  return NextResponse.json({
    paper: {
      configured: hasPaperCredentials(),
      connected: Boolean(paperResult.account),
      account: paperResult.account,
      error: paperResult.error ?? null,
    },
    live: {
      configured: hasLiveCredentials(),
      connected: Boolean(liveResult.account),
      account: liveResult.account,
      error: liveResult.error ?? null,
    },
    updatedAt: new Date().toISOString(),
  });
}
