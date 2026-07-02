import { NextResponse } from "next/server";
import {
  isServerEngineCurrentlyRunning,
  loadServerEngineTelemetry,
} from "@/lib/server-engine-telemetry";
import { getTradingScheduleStatusAsync } from "@/lib/trading-schedule-guard";
import { loadTradingScheduleSettings, primeTradingScheduleCache } from "@/lib/trading-schedule-config";
import { isTradeEngineEnabled } from "@/lib/server-trade-engine";

export async function GET() {
  await primeTradingScheduleCache();
  const telemetry = loadServerEngineTelemetry();
  const schedule = await getTradingScheduleStatusAsync();
  const settings = loadTradingScheduleSettings();
  return NextResponse.json({
    telemetry,
    workerEnabled: isTradeEngineEnabled(),
    engineRunning: isServerEngineCurrentlyRunning(),
    scheduleAllowed: schedule.allowed,
    scheduleReason: schedule.reason ?? null,
    scheduleUnrestricted: settings.unrestricted,
    source: "server",
  });
}
