import "server-only";

import type { StrategyPreset, Trade, TradingScheduleSettings } from "@wicksense/core";
import { detectActionableSignal } from "@wicksense/core";
import type { SlotTradeConfig } from "@/lib/autoTradeRunner";
import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { loadEngineConfig, patchEngineSlot } from "@/lib/engine-config";
import {
  findBestExecutableOpportunity,
  type ExecutableCandidate,
} from "@/lib/main-chart-executable";
import {
  applyManualSymbolOverride,
  applyReturnToAuto,
  decideMainChartRouting,
} from "@/lib/main-chart-routing-logic";
import type {
  MainChartRoutingState,
  MainChartSelectedOpportunity,
} from "@/lib/main-chart-routing-types";
import {
  loadMainChartRoutingStateDetailed,
  logMainChartRouterDiagnostic,
  saveMainChartRoutingState,
} from "@/lib/main-chart-routing-state";
import { scanTopOpportunities } from "@/lib/market-opportunity-scanner";
import { fetchServerSlotBars } from "@/lib/server-bars";
import { evaluateSlotEntryGates } from "@/lib/slot-entry-gates";
import { getAllTrades } from "@/lib/trade-store";
import { loadTradingScheduleSettings, primeTradingScheduleCache } from "@/lib/trading-schedule-config";

export { findBestExecutableOpportunity, type ExecutableCandidate };

function toSelected(candidate: ExecutableCandidate | null): MainChartSelectedOpportunity | null {
  if (!candidate) return null;
  return {
    signalId: candidate.signal.id,
    strategy: candidate.signal.strategy,
    confidence: candidate.confidence,
    symbol: candidate.symbol,
  };
}

function maybeLog(prev: MainChartRoutingState, next: MainChartRoutingState, changed: boolean) {
  if (!changed && !next.lastAssignment) return;
  if (
    !changed &&
    prev.mainSymbol === next.mainSymbol &&
    prev.mode === next.mode &&
    prev.activeTradePin?.tradeId === next.activeTradePin?.tradeId
  ) {
    return;
  }
  const last = next.lastAssignment;
  logMainChartRouterDiagnostic({
    mode: next.mode,
    previousSymbol: last?.previousSymbol ?? prev.mainSymbol,
    nextSymbol: next.mainSymbol,
    reason: last?.reason ?? "NO_CHANGE",
    strategy: last?.strategy,
    signalId: last?.signalId,
    confidence: last?.confidence,
    executable: last?.executable,
    activeTradeId: last?.activeTradeId ?? next.activeTradePin?.tradeId,
    manualOverride: next.mode === "MANUAL",
  });
}

export async function syncMainChartRoutingForTick(params: {
  preset: StrategyPreset;
  openTrades?: Trade[];
  tradingSchedule?: TradingScheduleSettings;
}): Promise<MainChartRoutingState> {
  const engine = loadEngineConfig();
  const { state: loaded, missingOrCorrupt } = loadMainChartRoutingStateDetailed();
  const openTrades = params.openTrades ?? (await getAllTrades());
  const tradingSchedule =
    params.tradingSchedule ??
    (await (async () => {
      await primeTradingScheduleCache();
      return loadTradingScheduleSettings();
    })());
  const autoTradeEnabled = true; // caller only runs when main auto-trade path is active

  const mainBase: SlotTradeConfig = {
    slotId: MAIN_CHART_SLOT,
    symbol: engine.main.symbol,
    timeframe: engine.main.timeframe,
    tradingStyle: engine.main.tradingStyle,
    mode: engine.main.mode,
    autoTradeEnabled,
    safetyStopActive: engine.main.safetyStopActive,
  };

  let bestExecutable: MainChartSelectedOpportunity | null = null;

  // MANUAL: only check whether the manual symbol itself is executable (for diagnostics / wait).
  // AUTO: pick best executable across the watchlist scan.
  if (loaded.mode === "MANUAL") {
    const manualSymbol = (loaded.manualOverrideSymbol ?? loaded.mainSymbol).toUpperCase();
    const { bars } = await fetchServerSlotBars(manualSymbol, engine.main.timeframe);
    const signal = detectActionableSignal(
      manualSymbol,
      bars,
      params.preset.strategies,
      engine.main.tradingStyle,
      engine.main.timeframe || params.preset.timeframe
    );
    if (signal) {
      const gate = await evaluateSlotEntryGates({
        config: { ...mainBase, symbol: manualSymbol, autoTradeEnabled: true },
        signal,
        bars,
        trades: openTrades,
        tradingSchedule,
      });
      if (gate.executable) {
        bestExecutable = {
          signalId: signal.id,
          strategy: signal.strategy,
          confidence: signal.confidence,
          symbol: manualSymbol,
        };
      }
    }
  } else if (!findMainPin(openTrades)) {
    const timeframe = engine.main.timeframe || params.preset.timeframe;
    const opportunities = await scanTopOpportunities({
      preset: params.preset,
      timeframe,
    });
    const candidate = await findBestExecutableOpportunity({
      opportunities,
      fetchBars: fetchServerSlotBars,
      mainConfig: { ...mainBase, autoTradeEnabled: true },
      trades: openTrades,
      tradingSchedule,
      strategyIds: params.preset.strategies,
      tradingStyle: engine.main.tradingStyle,
      timeframe,
    });
    bestExecutable = toSelected(candidate);
  }

  const decision = decideMainChartRouting({
    current: loaded,
    stateMissingOrCorrupt: missingOrCorrupt,
    openTrades,
    bestExecutable,
  });

  saveMainChartRoutingState(decision.state);
  if (decision.state.mainSymbol !== engine.main.symbol) {
    patchEngineSlot(MAIN_CHART_SLOT, { symbol: decision.state.mainSymbol });
  } else if (missingOrCorrupt) {
    // Ensure engine mirrors restored/initialized routing even if symbol string matched.
    patchEngineSlot(MAIN_CHART_SLOT, { symbol: decision.state.mainSymbol });
  }

  maybeLog(loaded, decision.state, decision.changed);
  return decision.state;
}

function findMainPin(trades: Trade[]): Trade | undefined {
  return trades.find(
    (t) =>
      t.chartSlot === "main" &&
      (t.status === "open" || t.status === "needs_manual_close") &&
      (t.mode === "paper" || t.mode === "live")
  );
}

export function setMainChartManualSymbol(symbol: string): MainChartRoutingState {
  const { state } = loadMainChartRoutingStateDetailed();
  const next = applyManualSymbolOverride(state, symbol);
  saveMainChartRoutingState(next);
  patchEngineSlot(MAIN_CHART_SLOT, { symbol: next.mainSymbol });
  logMainChartRouterDiagnostic({
    mode: next.mode,
    previousSymbol: state.mainSymbol,
    nextSymbol: next.mainSymbol,
    reason: "MANUAL_USER_OVERRIDE",
    manualOverride: true,
    executable: false,
    activeTradeId: next.activeTradePin?.tradeId ?? null,
  });
  return next;
}

export async function setMainChartReturnToAuto(params: {
  preset: StrategyPreset;
  openTrades?: Trade[];
}): Promise<MainChartRoutingState> {
  const engine = loadEngineConfig();
  const { state } = loadMainChartRoutingStateDetailed();
  const openTrades = params.openTrades ?? (await getAllTrades());
  const tradingSchedule = await (async () => {
    await primeTradingScheduleCache();
    return loadTradingScheduleSettings();
  })();
  const timeframe = engine.main.timeframe || params.preset.timeframe;

  let bestExecutable: MainChartSelectedOpportunity | null = null;
  if (!findMainPin(openTrades)) {
    const opportunities = await scanTopOpportunities({
      preset: params.preset,
      timeframe,
    });
    const candidate = await findBestExecutableOpportunity({
      opportunities,
      fetchBars: fetchServerSlotBars,
      mainConfig: {
        slotId: MAIN_CHART_SLOT,
        symbol: engine.main.symbol,
        timeframe: engine.main.timeframe,
        tradingStyle: engine.main.tradingStyle,
        mode: engine.main.mode,
        autoTradeEnabled: true,
        safetyStopActive: engine.main.safetyStopActive,
      },
      trades: openTrades,
      tradingSchedule,
      strategyIds: params.preset.strategies,
      tradingStyle: engine.main.tradingStyle,
      timeframe,
    });
    bestExecutable = toSelected(candidate);
  }

  const decision = applyReturnToAuto(state, bestExecutable, openTrades);
  saveMainChartRoutingState(decision.state);
  patchEngineSlot(MAIN_CHART_SLOT, { symbol: decision.state.mainSymbol });
  maybeLog(state, decision.state, true);
  return decision.state;
}

export function getMainChartRoutingSnapshot(): MainChartRoutingState {
  return loadMainChartRoutingStateDetailed().state;
}
