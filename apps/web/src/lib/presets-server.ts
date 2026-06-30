import type { StrategyPreset } from "@wicksense/core";
import { DEFAULT_PRESETS } from "@/lib/presets-data";

export function loadStrategyPresets(): StrategyPreset[] {
  return DEFAULT_PRESETS;
}

export function resolveServerActivePreset(activePresetId?: string): StrategyPreset | null {
  const presets = loadStrategyPresets();
  if (presets.length === 0) return null;
  if (activePresetId) {
    return presets.find((preset) => preset.id === activePresetId) ?? presets[0] ?? null;
  }
  return presets[0] ?? null;
}
