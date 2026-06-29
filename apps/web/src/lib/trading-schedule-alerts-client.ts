import { evaluateTradingSchedule } from "@wicksense/core";
import { resolveActivePreset } from "@/lib/presets-client";
import { useAppStore } from "@/lib/store";

let lastAllowed: boolean | null = null;
let alertInFlight = false;

function isAutoTradeActive(): boolean {
  const { autoTradeEnabled, multiChartSlots } = useAppStore.getState();
  return autoTradeEnabled || multiChartSlots.some((slot) => slot.autoTradeEnabled);
}

function sessionAlertsEnabled(
  event: "started" | "stopped",
  alertSettings: ReturnType<typeof useAppStore.getState>["alertSettings"]
): boolean {
  const typeEnabled =
    (event === "started" && alertSettings.onTradingStart) ||
    (event === "stopped" && alertSettings.onTradingStop);
  const channelEnabled =
    alertSettings.emailEnabled || alertSettings.smsEnabled || alertSettings.pushEnabled;
  return typeEnabled && channelEnabled;
}

function buildSessionContext(stopReason?: string) {
  const state = useAppStore.getState();
  const preset = resolveActivePreset();
  const enabledMarkets: string[] = [];

  if (state.autoTradeEnabled) {
    enabledMarkets.push(`${state.symbol} (${state.timeframe})`);
  }
  for (const slot of state.multiChartSlots) {
    if (slot.autoTradeEnabled) {
      enabledMarkets.push(`${slot.symbol} (${slot.timeframe})`);
    }
  }

  return {
    mode: state.mode,
    autoTradeEnabled: isAutoTradeActive(),
    enabledMarkets,
    enabledStrategies: preset?.strategies ?? [],
    presetName: preset?.name,
    stopReason,
  };
}

/**
 * Detects schedule window transitions while the app tab is open and requests
 * trading started/stopped alerts (email, SMS, or push per Settings).
 */
export async function checkTradingScheduleAlerts(): Promise<void> {
  const { tradingSchedule, alertSettings } = useAppStore.getState();
  const evaluation = evaluateTradingSchedule(tradingSchedule);
  const allowed = evaluation.allowed;

  if (tradingSchedule.unrestricted) {
    lastAllowed = true;
    return;
  }

  if (lastAllowed === null) {
    lastAllowed = allowed;
    return;
  }

  if (lastAllowed === allowed || alertInFlight) {
    return;
  }

  lastAllowed = allowed;

  if (!isAutoTradeActive()) {
    return;
  }

  const event = allowed ? "started" : "stopped";
  if (!sessionAlertsEnabled(event, alertSettings)) {
    return;
  }

  const context = buildSessionContext(
    allowed ? undefined : evaluation.reason ?? "Outside allowed trading hours"
  );

  alertInFlight = true;
  try {
    const res = await fetch("/api/alerts/trading-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, context }),
    });
    const data = (await res.json()) as { skipped?: boolean; ok?: boolean };
    if (data.skipped) {
      console.log(`[Alert] alert_skipped_duplicate: ${event === "started" ? "trading_started" : "trading_stopped"}`);
    } else if (data.ok) {
      console.log(`[Alert] alert_sent: ${event === "started" ? "trading_started" : "trading_stopped"}`);
    }
  } catch (err) {
    console.warn("[Schedule alert]", err instanceof Error ? err.message : "Request failed");
  } finally {
    alertInFlight = false;
  }
}
