import { evaluateTradingSchedule } from "@wicksense/core";
import { loadAutoTradeSettings } from "@/lib/auto-trade-config";
import { runAutoExitMonitor } from "@/lib/auto-exit-runner";
import type { SlotTradeConfig } from "@/lib/autoTradeRunner";
import { AUTO_TRADE_POLL_MS } from "@/lib/autoTradeRunner";
import { MAIN_CHART_SLOT, MULTI_CHART_SLOT_IDS } from "@/lib/chart-slots";
import { loadEngineConfig } from "@/lib/engine-config";
import { resolveServerActivePreset } from "@/lib/presets-server";
import { fetchServerSlotBars } from "@/lib/server-bars";
import { executeServerSlotTrade } from "@/lib/server-execute-trade";
import { runSlotCycleWithContext } from "@/lib/slot-cycle-core";
import { syncAllAlpacaPositions } from "@/lib/position-sync";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import { checkServerTradingScheduleAlerts } from "@/lib/server-trading-schedule-alerts";
import { loadUserProfile } from "@/lib/user-config";
import { getAllTrades } from "@/lib/trade-store";
import {
  createServerSlotCycleTelemetryHooks,
  markServerEngineCycleComplete,
  markServerEngineCycleStart,
} from "@/lib/server-engine-telemetry";

export { AUTO_TRADE_POLL_MS };

let tickInFlight = false;

export function isAnyServerAutoTradeEnabled(): boolean {
  const slots = loadAutoTradeSettings();
  return Object.values(slots).some(Boolean);
}

function buildServerSlotConfigs(): SlotTradeConfig[] {
  const engine = loadEngineConfig();
  const autoTrade = loadAutoTradeSettings();
  const configs: SlotTradeConfig[] = [
    {
      slotId: MAIN_CHART_SLOT,
      symbol: engine.main.symbol,
      timeframe: engine.main.timeframe,
      tradingStyle: engine.main.tradingStyle,
      mode: engine.main.mode,
      autoTradeEnabled: Boolean(autoTrade[MAIN_CHART_SLOT]),
      safetyStopActive: engine.main.safetyStopActive,
    },
  ];

  for (const slotId of MULTI_CHART_SLOT_IDS) {
    const slot = engine.multi[slotId];
    configs.push({
      slotId,
      symbol: slot.symbol,
      timeframe: slot.timeframe,
      tradingStyle: slot.tradingStyle,
      mode: slot.mode,
      autoTradeEnabled: Boolean(autoTrade[slotId]),
      safetyStopActive: slot.safetyStopActive,
    });
  }

  return configs;
}

export interface TradeEngineTickResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  durationMs: number;
  slotsScanned: number;
  autoExitClosed?: number;
}

export async function runTradeEngineTick(): Promise<TradeEngineTickResult> {
  const started = Date.now();

  if (tickInFlight) {
    return {
      ok: true,
      skipped: true,
      reason: "Previous tick still running",
      durationMs: Date.now() - started,
      slotsScanned: 0,
    };
  }

  tickInFlight = true;
  markServerEngineCycleStart();
  try {
    await syncAllAlpacaPositions();

    const engine = loadEngineConfig();
    const profile = loadUserProfile();
    const tradingSchedule = loadTradingScheduleSettings();
    const activePreset = resolveServerActivePreset(engine.activePresetId);

    if (isAnyServerAutoTradeEnabled()) {
      const exitResult = await runAutoExitMonitor(engine.riskSettings);
      if (exitResult.closedCount > 0) {
        console.log(`[trade-engine] Auto-exit closed ${exitResult.closedCount} trade(s)`);
      }
      await checkServerTradingScheduleAlerts();
    }

    if (!activePreset) {
      return {
        ok: false,
        reason: "No strategy preset available",
        durationMs: Date.now() - started,
        slotsScanned: 0,
      };
    }

    const slotConfigs = buildServerSlotConfigs();
    const enabledSlots = slotConfigs.filter((c) => c.autoTradeEnabled).map((c) => c.slotId);
    if (enabledSlots.length > 0 && process.env.NODE_ENV === "development") {
      // Log once per process — avoid flooding the dev console every 30s.
      const g = globalThis as typeof globalThis & { __wicksenseLoggedAutoTradeSlots?: boolean };
      if (!g.__wicksenseLoggedAutoTradeSlots) {
        console.log(`[trade-engine] Auto-trade enabled for: ${enabledSlots.join(", ")}`);
        g.__wicksenseLoggedAutoTradeSlots = true;
      }
    } else if (enabledSlots.length > 0) {
      console.log(`[trade-engine] Auto-trade enabled for: ${enabledSlots.join(", ")}`);
    }

    let slotsScanned = 0;

    const telemetryHooks = createServerSlotCycleTelemetryHooks();

    for (const config of slotConfigs) {
      await runSlotCycleWithContext(config, {
        getTrades: getAllTrades,
        tradingSchedule,
        riskSettings: engine.riskSettings,
        alertSettings: profile.alertSettings,
        resolveActivePreset: () => activePreset,
        fetchBars: fetchServerSlotBars,
        executeTrade: (params) =>
          executeServerSlotTrade({
            ...params,
            riskSettings: engine.riskSettings,
            alertSettings: profile.alertSettings,
          }),
        ...telemetryHooks,
      });
      slotsScanned += 1;
    }

    return {
      ok: true,
      durationMs: Date.now() - started,
      slotsScanned,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[trade-engine] Tick failed:", message);
    return {
      ok: false,
      reason: message,
      durationMs: Date.now() - started,
      slotsScanned: 0,
    };
  } finally {
    tickInFlight = false;
    markServerEngineCycleComplete();
  }
}

export function isTradeEngineEnabled(): boolean {
  if (process.env.TRADE_ENGINE_ENABLED === "false") return false;
  return true;
}
