import { NextRequest, NextResponse } from "next/server";
import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { loadEngineConfig } from "@/lib/engine-config";
import { resetSafetyStopOnServer } from "@/lib/reset-safety-stop";

export async function POST(req: NextRequest) {
  let slotId: string | undefined;
  try {
    const body = await req.json();
    slotId = typeof body?.slotId === "string" ? body.slotId : undefined;
  } catch {
    /* reset all when body omitted */
  }

  try {
    resetSafetyStopOnServer(slotId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const config = loadEngineConfig();
  return NextResponse.json({
    ok: true,
    slotId: slotId ?? "all",
    main: config.main,
    multi: config.multi,
    mainChartSlot: MAIN_CHART_SLOT,
  });
}
