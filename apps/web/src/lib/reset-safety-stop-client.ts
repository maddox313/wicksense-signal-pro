import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { useAppStore } from "@/lib/store";

export async function resetSafetyStopClient(slotId: string = "all"): Promise<boolean> {
  try {
    const res = await fetch("/api/settings/reset-safety-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId }),
    });
    if (!res.ok) return false;

    const store = useAppStore.getState();
    if (!slotId || slotId === "all") {
      store.resetSafetyStop();
      for (const slot of store.multiChartSlots) {
        store.updateMultiChartSlot(slot.id, {
          safetyStopActive: false,
          consecutiveLosses: 0,
        });
      }
      return true;
    }

    if (slotId === MAIN_CHART_SLOT) {
      store.resetSafetyStop();
      return true;
    }

    store.updateMultiChartSlot(slotId, {
      safetyStopActive: false,
      consecutiveLosses: 0,
    });
    return true;
  } catch {
    return false;
  }
}
