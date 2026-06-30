import { NextRequest } from "next/server";
import { evaluateTradingSchedule } from "@wicksense/core";
import { POST as sendTradingScheduleAlert } from "@/app/api/alerts/trading-schedule/route";
import { loadAutoTradeSettings } from "@/lib/auto-trade-config";
import { MAIN_CHART_SLOT, MULTI_CHART_SLOT_IDS } from "@/lib/chart-slots";
import { loadEngineConfig } from "@/lib/engine-config";
import { resolveServerActivePreset } from "@/lib/presets-server";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import { loadUserProfile } from "@/lib/user-config";

let lastAllowed: boolean | null = null;

function isAnyAutoTradeEnabled(): boolean {
  const slots = loadAutoTradeSettings();
  return Object.values(slots).some(Boolean);
}

function sessionAlertsEnabled(
  event: "started" | "stopped",
  alertSettings: ReturnType<typeof loadUserProfile>["alertSettings"]
): boolean {
  const typeEnabled =
    (event === "started" && alertSettings.onTradingStart) ||
    (event === "stopped" && alertSettings.onTradingStop);
  const channelEnabled =
    alertSettings.emailEnabled || alertSettings.smsEnabled || alertSettings.pushEnabled;
  return typeEnabled && channelEnabled;
}

export async function checkServerTradingScheduleAlerts(): Promise<void> {
  const tradingSchedule = loadTradingScheduleSettings();
  const evaluation = evaluateTradingSchedule(tradingSchedule);
  const allowed = evaluation.allowed;
  const profile = loadUserProfile();

  if (tradingSchedule.unrestricted) {
    lastAllowed = true;
    return;
  }

  if (lastAllowed === null) {
    lastAllowed = allowed;
    return;
  }

  if (lastAllowed === allowed) {
    return;
  }

  lastAllowed = allowed;

  if (!isAnyAutoTradeEnabled()) {
    return;
  }

  const event = allowed ? "started" : "stopped";
  if (!sessionAlertsEnabled(event, profile.alertSettings)) {
    return;
  }

  const engine = loadEngineConfig();
  const autoTrade = loadAutoTradeSettings();
  const preset = resolveServerActivePreset(engine.activePresetId);
  const enabledMarkets: string[] = [];

  if (autoTrade[MAIN_CHART_SLOT]) {
    enabledMarkets.push(`${engine.main.symbol} (${engine.main.timeframe})`);
  }
  for (const slotId of MULTI_CHART_SLOT_IDS) {
    if (autoTrade[slotId]) {
      const slot = engine.multi[slotId];
      enabledMarkets.push(`${slot.symbol} (${slot.timeframe})`);
    }
  }

  const context = {
    mode: engine.main.mode,
    autoTradeEnabled: isAnyAutoTradeEnabled(),
    enabledMarkets,
    enabledStrategies: preset?.strategies ?? [],
    presetName: preset?.name,
    stopReason: allowed ? undefined : evaluation.reason ?? "Outside allowed trading hours",
  };

  try {
    const req = new NextRequest("http://internal/api/alerts/trading-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, context }),
    });
    const res = await sendTradingScheduleAlert(req);
    const data = (await res.json()) as { ok?: boolean; skipped?: boolean };
    if (data.ok) {
      console.log(`[trade-engine] Schedule alert sent: ${event}`);
    }
  } catch (err) {
    console.warn(
      "[trade-engine] Schedule alert failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
