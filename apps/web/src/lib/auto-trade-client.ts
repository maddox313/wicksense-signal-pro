import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { useAppStore } from "@/lib/store";

export async function loadAutoTradeSettingsIntoStore(): Promise<void> {
  try {
    const res = await fetch("/api/settings/auto-trade");
    if (!res.ok) return;

    const data = (await res.json()) as { slots?: Record<string, boolean> };
    const slots = data.slots ?? {};
    const store = useAppStore.getState();

    if (typeof slots[MAIN_CHART_SLOT] === "boolean") {
      store.setAutoTradeEnabled(slots[MAIN_CHART_SLOT]);
    }

    for (const slot of store.multiChartSlots) {
      if (typeof slots[slot.id] === "boolean") {
        store.updateMultiChartSlot(slot.id, { autoTradeEnabled: slots[slot.id] });
      }
    }
  } catch {
    /* keep in-memory defaults on load failure */
  }
}

export async function persistAutoTradeSlot(slotId: string, enabled: boolean): Promise<void> {
  try {
    await fetch("/api/settings/auto-trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, enabled }),
    });
  } catch {
    /* non-blocking — UI state already updated */
  }
}
