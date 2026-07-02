import type { RiskSettings } from "@wicksense/core";
import { patchEngineSlot } from "@/lib/engine-config";
import { getRiskEngine } from "@/lib/risk-engine-registry";

/** Persist in-memory risk state to engine-config so UI and restarts stay in sync. */
export function persistSlotSafetyStopState(slotId: string, riskSettings: RiskSettings): void {
  const engine = getRiskEngine(slotId, riskSettings);
  patchEngineSlot(slotId, {
    consecutiveLosses: engine.getConsecutiveLosses(),
    safetyStopActive: engine.isSafetyStopActive(),
  });
}
