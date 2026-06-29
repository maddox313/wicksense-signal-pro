import { loadEngineTelemetry } from "@/lib/strategy-engine-telemetry";
import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { useAppStore } from "@/lib/store";

export interface ActionRequiredPayload {
  reasonCode: string;
  problemReason: string;
  recommendedStep?: string;
  symbol?: string;
  strategy?: string;
  mode?: string;
}

let lastSafetyStopActive = false;
const sentIssueKeys = new Set<string>();
let alertInFlight = false;

function isAutoTradeActive(): boolean {
  const { autoTradeEnabled, multiChartSlots } = useAppStore.getState();
  return autoTradeEnabled || multiChartSlots.some((slot) => slot.autoTradeEnabled);
}

function alertsChannelEnabled(): boolean {
  const { alertSettings } = useAppStore.getState();
  return (
    alertSettings.onActionRequired &&
    (alertSettings.emailEnabled || alertSettings.smsEnabled || alertSettings.pushEnabled)
  );
}

function activeAutoTradeSlots() {
  const { autoTradeEnabled, multiChartSlots, symbol, timeframe } = useAppStore.getState();
  const slots: { slotId: string; symbol: string; timeframe: string }[] = [];
  if (autoTradeEnabled) {
    slots.push({ slotId: MAIN_CHART_SLOT, symbol, timeframe });
  }
  for (const slot of multiChartSlots) {
    if (slot.autoTradeEnabled) {
      slots.push({ slotId: slot.id, symbol: slot.symbol, timeframe: slot.timeframe });
    }
  }
  return slots;
}

function collectIssues(): ActionRequiredPayload[] {
  const state = useAppStore.getState();
  const issues: ActionRequiredPayload[] = [];
  const modeLabel = state.mode === "live" ? "Live" : state.mode === "paper" ? "Paper" : state.mode;

  if (state.safetyStopActive && !lastSafetyStopActive) {
    issues.push({
      reasonCode: "max_consecutive_losses",
      problemReason: "Max consecutive losses reached — safety stop is active.",
      recommendedStep: "Review recent trades on the Performance page, then reset the safety stop when ready.",
      mode: modeLabel,
    });
  }

  if (state.syncStatus.error) {
    issues.push({
      reasonCode: "alpaca_sync",
      problemReason: `Alpaca sync error: ${state.syncStatus.error}`,
      recommendedStep: "Verify broker API keys in Settings and confirm Alpaca is reachable.",
      mode: modeLabel,
    });
  }

  const activeMode = state.mode === "live" ? state.syncStatus.live : state.syncStatus.paper;
  if (activeMode?.error) {
    issues.push({
      reasonCode: "alpaca_disconnected",
      problemReason: `Alpaca ${state.mode} connection issue: ${activeMode.error}`,
      recommendedStep: "Check Settings → Broker API and refresh the Account page.",
      mode: modeLabel,
    });
  }

  for (const slot of activeAutoTradeSlots()) {
    const market = state.slotMarketData[slot.slotId];
    if (!market) continue;

    if (market.dataSource === "mock") {
      issues.push({
        reasonCode: `market_data_mock_${slot.symbol}`,
        problemReason: `Market data unavailable for ${slot.symbol} — using mock data.${market.fetchError ? ` ${market.fetchError}` : ""}`,
        recommendedStep: "Confirm Alpaca data credentials and symbol availability.",
        symbol: slot.symbol,
        mode: modeLabel,
      });
    } else if (market.fetchError) {
      issues.push({
        reasonCode: `market_data_error_${slot.symbol}`,
        problemReason: `Market data error for ${slot.symbol}: ${market.fetchError}`,
        recommendedStep: "Wait for the feed to recover or check your network and Alpaca status.",
        symbol: slot.symbol,
        mode: modeLabel,
      });
    }
  }

  const telemetry = loadEngineTelemetry();
  if (telemetry.lastDetectError) {
    issues.push({
      reasonCode: "signal_detect_error",
      problemReason: `Signal detection error: ${telemetry.lastDetectError}`,
      recommendedStep: "Refresh the app and confirm presets and chart data are loaded.",
      mode: modeLabel,
    });
  }

  for (const scan of telemetry.lastSlotScans) {
    const detail = scan.detail ?? "";
    const tradeFailure =
      /order failed|not filled|fill timeout|broker fill|database save failed/i.test(detail);
    if (tradeFailure) {
      issues.push({
        reasonCode: "order_failure",
        problemReason: detail,
        recommendedStep: "Check Alpaca order status and broker connectivity.",
        symbol: scan.symbol,
        strategy: scan.pickedStrategy ?? undefined,
        mode: modeLabel,
      });
    }
  }

  if (state.presets.length === 0 || !state.activePresetId) {
    issues.push({
      reasonCode: "preset_unavailable",
      problemReason: "Strategy preset not loaded — auto-trading cannot run strategies.",
      recommendedStep: "Open the chart page and confirm presets load, then refresh.",
      mode: modeLabel,
    });
  }

  return issues;
}

async function sendActionRequiredAlert(payload: ActionRequiredPayload): Promise<void> {
  const dedupeKey = `${payload.reasonCode}:${payload.symbol ?? "all"}:${payload.strategy ?? "all"}`;
  if (sentIssueKeys.has(dedupeKey)) {
    console.log("[Alert] alert_skipped_duplicate: action_required", dedupeKey);
    return;
  }

  alertInFlight = true;
  try {
    const res = await fetch("/api/alerts/action-required", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { skipped?: boolean; ok?: boolean };
    if (data.skipped) {
      console.log("[Alert] alert_skipped_duplicate: action_required", dedupeKey);
      sentIssueKeys.add(dedupeKey);
      return;
    }
    if (data.ok) {
      console.log("[Alert] alert_sent: action_required", payload.reasonCode);
      sentIssueKeys.add(dedupeKey);
    }
  } catch (err) {
    console.warn("[Action required alert]", err instanceof Error ? err.message : "Request failed");
  } finally {
    alertInFlight = false;
  }
}

export async function checkActionRequiredAlerts(): Promise<void> {
  if (!isAutoTradeActive() || !alertsChannelEnabled() || alertInFlight) {
    lastSafetyStopActive = useAppStore.getState().safetyStopActive;
    return;
  }

  const issues = collectIssues();
  lastSafetyStopActive = useAppStore.getState().safetyStopActive;

  for (const issue of issues) {
    await sendActionRequiredAlert(issue);
  }
}
