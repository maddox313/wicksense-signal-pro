import { loadAutoTradeSettings } from "@/lib/auto-trade-config";
import { runAutoExitMonitor } from "@/lib/auto-exit-runner";
import type { SlotTradeConfig } from "@/lib/autoTradeRunner";
import { AUTO_TRADE_POLL_MS } from "@/lib/autoTradeRunner";
import { AUTO_TRADE_SLOT_IDS, MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { loadEngineConfig } from "@/lib/engine-config";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import { resolveServerActivePreset } from "@/lib/presets-server";
import { fetchServerSlotBars } from "@/lib/server-bars";
import { executeServerSlotTrade } from "@/lib/server-execute-trade";
import { runSlotCycleWithContext } from "@/lib/slot-cycle-core";
import { syncAllAlpacaPositions } from "@/lib/position-sync";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import { getTradingScheduleStatus } from "@/lib/trading-schedule-guard";
import { checkServerTradingScheduleAlerts } from "@/lib/server-trading-schedule-alerts";
import { runDailyTradeArchiveIfDue } from "@/lib/daily-trade-archive";
import { loadUserProfile } from "@/lib/user-config";
import { getAllTrades, getOpenTrades } from "@/lib/trade-store";
import { routeOpportunitiesToSlots } from "@/lib/slot-opportunity-router";
import { syncRiskEnginesFromConfig } from "@/lib/risk-engine-registry";
import {
  createServerSlotCycleTelemetryHooks,
  markServerEngineCycleComplete,
  markServerEngineCycleStart,
  recordServerScheduleBlocked,
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
  const configs: SlotTradeConfig[] = [];

  for (const slotId of AUTO_TRADE_SLOT_IDS) {
    const slot = slotId === MAIN_CHART_SLOT ? engine.main : engine.multi[slotId];
    configs.push({
      slotId,
      symbol: slot.symbol,
      timeframe: slot.timeframe,
      tradingStyle: slot.tradingStyle,
      mode: slot.mode,
      autoTradeEnabled: Boolean(autoTrade[slotId]),
      safetyStopActive:
        slot.safetyStopActive ||
        getRiskEngine(slotId, engine.riskSettings).isSafetyStopActive(),
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
  archivedClosed?: number;
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

    const archiveResult = await runDailyTradeArchiveIfDue();

    const engine = loadEngineConfig();
    const profile = loadUserProfile();
    const tradingSchedule = loadTradingScheduleSettings();
    const scheduleEval = getTradingScheduleStatus();

    syncRiskEnginesFromConfig(engine.riskSettings);

    const openTrades = await getOpenTrades();
    const hasOpenTrades = openTrades.some(
      (t) => t.status === "open" && (t.mode === "paper" || t.mode === "live")
    );

    // Auto-exit runs whenever positions are open — even outside trading hours (prevents overnight bleed).
    if (hasOpenTrades || isAnyServerAutoTradeEnabled()) {
      const exitResult = await runAutoExitMonitor(engine.riskSettings);
      if (exitResult.closedCount > 0) {
        console.log(`[trade-engine] Auto-exit closed ${exitResult.closedCount} trade(s)`);
      }
    }

    if (isAnyServerAutoTradeEnabled()) {
      await checkServerTradingScheduleAlerts();
    }

    const activePreset = resolveServerActivePreset(engine.activePresetId);

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

    if (scheduleEval.allowed) {
      const g = globalThis as typeof globalThis & { __wicksenseLoggedScheduleBlock?: string };
      g.__wicksenseLoggedScheduleBlock = undefined;

      if (enabledSlots.length > 0) {
        const scanTimeframe = engine.main.timeframe || activePreset.timeframe;
        const assignments = await routeOpportunitiesToSlots({
          preset: activePreset,
          timeframe: scanTimeframe,
          openTrades,
        });
        const changed = assignments.filter((a) => a.changed);
        if (changed.length > 0) {
          console.log(
            `[trade-engine] Routed opportunities: ${changed
              .map((a) => `${a.slotId}→${a.symbol}`)
              .join(", ")}`
          );
        }
      }
    } else {
      const g = globalThis as typeof globalThis & { __wicksenseLoggedScheduleBlock?: string };
      const blockKey = scheduleEval.reason ?? "blocked";
      if (g.__wicksenseLoggedScheduleBlock !== blockKey) {
        console.log(`[trade-engine] Trading paused: ${scheduleEval.reason ?? "Outside trading schedule"}`);
        g.__wicksenseLoggedScheduleBlock = blockKey;
      }
      recordServerScheduleBlocked(enabledSlots, scheduleEval.reason);
    }

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

    if (scheduleEval.allowed) {
      const activeSlotConfigs = buildServerSlotConfigs();
      for (const config of activeSlotConfigs) {
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
    }

    return {
      ok: true,
      durationMs: Date.now() - started,
      slotsScanned,
      archivedClosed: archiveResult.archived,
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
