import { RiskEngine } from "@wicksense/core";
import type { RiskSettings } from "@wicksense/core";

const riskEngines = new Map<string, RiskEngine>();

export function getRiskEngine(chartSlot: string, settings: RiskSettings): RiskEngine {
  if (!riskEngines.has(chartSlot)) {
    riskEngines.set(chartSlot, new RiskEngine(settings));
  } else {
    riskEngines.get(chartSlot)!.updateSettings(settings);
  }
  return riskEngines.get(chartSlot)!;
}

export function resetAllRiskEngines(): void {
  for (const engine of riskEngines.values()) {
    engine.resetSafetyStop();
  }
}

export function resetRiskEngine(chartSlot: string): void {
  riskEngines.get(chartSlot)?.resetSafetyStop();
}
