import { NextRequest, NextResponse } from "next/server";
import {
  AUTO_TRADE_CONFIG_PATH,
  loadAutoTradeSettings,
  saveAutoTradeSlot,
} from "@/lib/auto-trade-config";

export async function GET() {
  const slots = loadAutoTradeSettings();
  return NextResponse.json({
    slots,
    storagePath: AUTO_TRADE_CONFIG_PATH,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slotId, enabled } = body as { slotId?: string; enabled?: boolean };

  if (!slotId || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "slotId and enabled are required" }, { status: 400 });
  }

  try {
    const slots = saveAutoTradeSlot(slotId, enabled);
    return NextResponse.json({
      slots,
      storagePath: AUTO_TRADE_CONFIG_PATH,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save Auto Trade settings" },
      { status: 400 }
    );
  }
}
