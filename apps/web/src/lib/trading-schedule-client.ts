import type { TradingScheduleSettings } from "@wicksense/core";
import { useAppStore } from "@/lib/store";

export async function loadTradingScheduleIntoStore(): Promise<void> {
  try {
    const res = await fetch("/api/settings/trading-schedule");
    if (!res.ok) return;
    const data = (await res.json()) as { settings?: TradingScheduleSettings };
    if (data.settings) {
      useAppStore.getState().setTradingSchedule(data.settings);
    }
  } catch {
    /* keep defaults */
  }
}

export async function saveTradingSchedule(
  settings: TradingScheduleSettings
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/settings/trading-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Failed to save trading schedule" };
    }
    if (data.settings) {
      useAppStore.getState().setTradingSchedule(data.settings);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save trading schedule" };
  }
}
