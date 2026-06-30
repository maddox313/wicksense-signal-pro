import { MAIN_CHART_SLOT, MULTI_CHART_SLOT_IDS } from "@/lib/chart-slots";
import { loadEngineConfig, patchEngineSlot, saveEngineConfig } from "@/lib/engine-config";
import { resetAllRiskEngines, resetRiskEngine } from "@/lib/risk-engine-registry";

export function resetEngineSafetyStop(slotId: string): void {
  patchEngineSlot(slotId, { safetyStopActive: false, consecutiveLosses: 0 });
  resetRiskEngine(slotId);
}

export function resetAllEngineSafetyStops(): void {
  const current = loadEngineConfig();
  saveEngineConfig({
    main: { ...current.main, safetyStopActive: false, consecutiveLosses: 0 },
    multi: Object.fromEntries(
      MULTI_CHART_SLOT_IDS.map((id) => [
        id,
        { ...current.multi[id], safetyStopActive: false, consecutiveLosses: 0 },
      ])
    ),
  });
  resetAllRiskEngines();
}

export function resetSafetyStopOnServer(slotId?: string): void {
  if (!slotId || slotId === "all") {
    resetAllEngineSafetyStops();
    return;
  }
  if (slotId === MAIN_CHART_SLOT || MULTI_CHART_SLOT_IDS.includes(slotId as (typeof MULTI_CHART_SLOT_IDS)[number])) {
    resetEngineSafetyStop(slotId);
    return;
  }
  throw new Error(`Unknown chart slot: ${slotId}`);
}
