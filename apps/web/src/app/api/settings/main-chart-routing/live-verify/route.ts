import { NextRequest, NextResponse } from "next/server";
import { runMainChartLiveVerification } from "@/lib/main-chart-live-verify";

/**
 * Dev-only live verification of Main Chart routing against the running app.
 * POST { "confirm": "LIVE_VERIFY" }
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (body.confirm !== "LIVE_VERIFY") {
    return NextResponse.json(
      { error: 'Pass { "confirm": "LIVE_VERIFY" } to run' },
      { status: 400 }
    );
  }

  try {
    const report = await runMainChartLiveVerification();
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[live-verify] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
