import type { StrategyPreset } from "@wicksense/core";
import { useAppStore } from "@/lib/store";

let loadPromise: Promise<void> | null = null;

export function resolveActivePreset(): StrategyPreset | null {
  const { presets, activePresetId } = useAppStore.getState();
  if (presets.length === 0) return null;
  return presets.find((preset) => preset.id === activePresetId) ?? presets[0] ?? null;
}

export async function loadPresetsIntoStore(): Promise<void> {
  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    const res = await fetch("/api/presets");
    if (!res.ok) {
      throw new Error(`Failed to load presets (${res.status})`);
    }

    const data = (await res.json()) as { presets?: StrategyPreset[] };
    const loaded = data.presets ?? [];
    if (loaded.length === 0) {
      throw new Error("Presets API returned an empty list");
    }

    const store = useAppStore.getState();
    store.setPresets(loaded);

    const activePreset =
      loaded.find((preset) => preset.id === store.activePresetId) ?? loaded[0];
    if (activePreset) {
      store.setActivePresetId(activePreset.id);
    }
  })();

  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    console.error("[presets] Failed to load strategy presets", err);
    throw err;
  }
}

/** Resolves when presets are in the store — retries load until the API succeeds. */
export async function ensurePresetsLoaded(): Promise<boolean> {
  if (useAppStore.getState().presets.length > 0) {
    return true;
  }

  try {
    await loadPresetsIntoStore();
    return useAppStore.getState().presets.length > 0;
  } catch {
    return false;
  }
}
