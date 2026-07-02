import { NextResponse } from "next/server";
import { loadAutoTradeSettings } from "@/lib/auto-trade-config";
import { selectCanonicalOpenTrades } from "@/lib/auto-exit-levels";
import { getDataDir } from "@/lib/data-paths";
import { loadEngineConfig } from "@/lib/engine-config";
import { loadServerEngineTelemetry } from "@/lib/server-engine-telemetry";
import { getOpenTrades } from "@/lib/trade-store";
import { getTradingScheduleStatus } from "@/lib/trading-schedule-guard";
import {
  isAnyServerAutoTradeEnabled,
  isTradeEngineEnabled,
} from "@/lib/server-trade-engine";

export async function GET() {
  const autoTradeEnabled = isAnyServerAutoTradeEnabled();
  const autoTradeSlots = loadAutoTradeSettings();
  const engineConfig = loadEngineConfig();
  const telemetry = loadServerEngineTelemetry();
  const schedule = getTradingScheduleStatus();
  const openTrades = await getOpenTrades();
  const monitoredCount = selectCanonicalOpenTrades(openTrades).length;

  const blockers: string[] = [];
  if (!isTradeEngineEnabled()) blockers.push("TRADE_ENGINE_ENABLED=false");
  if (!autoTradeEnabled) blockers.push("No auto-trade slots enabled in auto-trade.local.json");
  if (!schedule.allowed) blockers.push(schedule.reason ?? "Outside trading schedule");
  if (engineConfig.main.safetyStopActive) blockers.push("Main chart safety stop active");
  for (const [slotId, slot] of Object.entries(engineConfig.multi)) {
    if (slot.safetyStopActive) blockers.push(`${slotId} safety stop active`);
  }
  if (engineConfig.main.mode === "manual") blockers.push("Main chart is in manual mode");

  return NextResponse.json({
    autoTradeSlots,
    autoTradeEnabled,
    workerEnabled: isTradeEngineEnabled(),
    engineRunning: telemetry.cycleInProgress || telemetry.totalCycles > 0,
    totalCycles: telemetry.totalCycles,
    lastCycleAt: telemetry.lastCycleCompletedAt,
    scheduleAllowed: schedule.allowed,
    scheduleReason: schedule.reason,
    dataDir: getDataDir(),
    blockers,
    autoExitStatus: {
      enabled: autoTradeEnabled,
      monitoredCount,
      lastCheckAt: telemetry.lastCycleCompletedAt ?? Date.now(),
      lastError: telemetry.lastDetectError,
    },
    worker: {
      pollIntervalMs: 30_000,
      runsServerSide: true,
    },
  });
}
