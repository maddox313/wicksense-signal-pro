import { NextRequest, NextResponse } from "next/server";
import { runAutoExitMonitor } from "@/lib/auto-exit-runner";
import type { RiskSettings } from "@wicksense/core";
import { getTradingScheduleStatus } from "@/lib/trading-schedule-guard";

export async function POST(req: NextRequest) {
  const schedule = getTradingScheduleStatus();
  if (!schedule.allowed) {
    return NextResponse.json({
      monitored: 0,
      checked: 0,
      closedCount: 0,
      closed: [],
      failures: [],
      skipped: true,
      reason: schedule.reason ?? "Outside allowed trading hours",
    });
  }

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
