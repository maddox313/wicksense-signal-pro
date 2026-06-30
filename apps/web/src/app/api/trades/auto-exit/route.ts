import { NextRequest, NextResponse } from "next/server";
import { runAutoExitMonitor } from "@/lib/auto-exit-runner";
import type { RiskSettings } from "@wicksense/core";

export async function POST(req: NextRequest) {
  let riskSettings: RiskSettings | undefined;
  try {
    const body = await req.json();
    riskSettings = body?.riskSettings;
  } catch {
    /* optional body */
  }

  const result = await runAutoExitMonitor(riskSettings);
  return NextResponse.json(result);
}
