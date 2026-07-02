import { RiskEngine } from "@wicksense/core";
import type { RiskSettings } from "@wicksense/core";
import { loadEngineConfig } from "@/lib/engine-config";
import { MAIN_CHART_SLOT, MULTI_CHART_SLOT_IDS } from "@/lib/chart-slots";

const riskEngines = new Map<string, RiskEngine>();

function slotPersistedState(chartSlot: string): { consecutiveLosses: number; safetyStopActive: boolean } {
  const engine = loadEngineConfig();
  if (chartSlot === MAIN_CHART_SLOT) {
    return {
      consecutiveLosses: engine.main.consecutiveLosses,
      safetyStopActive: engine.main.safetyStopActive,
    };
  }
  const slot = engine.multi[chartSlot];
  return {
    consecutiveLosses: slot?.consecutiveLosses ?? 0,
    safetyStopActive: Boolean(slot?.safetyStopActive),
  };
}

export function getRiskEngine(chartSlot: string, settings: RiskSettings): RiskEngine {
  if (!riskEngines.has(chartSlot)) {
    const instance = new RiskEngine(settings);
    const persisted = slotPersistedState(chartSlot);
    instance.hydratePersistedState(persisted.consecutiveLosses, persisted.safetyStopActive);
    riskEngines.set(chartSlot, instance);
  } else {
    riskEngines.get(chartSlot)!.updateSettings(settings);
  }
  return riskEngines.get(chartSlot)!;
}

/** Re-hydrate all slot risk engines from persisted engine-config (call each engine tick). */
export function syncRiskEnginesFromConfig(settings: RiskSettings): void {
  syncSlotRiskEngine(MAIN_CHART_SLOT, settings);
  for (const slotId of MULTI_CHART_SLOT_IDS) {
    syncSlotRiskEngine(slotId, settings);
  }
}

function syncSlotRiskEngine(slotId: string, settings: RiskSettings): void {
  const persisted = slotPersistedState(slotId);
  const engine = getRiskEngine(slotId, settings);
  engine.hydratePersistedState(persisted.consecutiveLosses, persisted.safetyStopActive);
}

export function resetAllRiskEngines(): void {
  for (const engine of riskEngines.values()) {
    engine.resetSafetyStop();
  }
}

export function resetRiskEngine(chartSlot: string): void {
  riskEngines.get(chartSlot)?.resetSafetyStop();
}
