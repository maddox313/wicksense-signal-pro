import { NextRequest, NextResponse } from "next/server";
import { runTradeEngineTick } from "@/lib/server-trade-engine";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = req.headers.get("x-cron-secret");
  return headerSecret === secret;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTradeEngineTick();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
