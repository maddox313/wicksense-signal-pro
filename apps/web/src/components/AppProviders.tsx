"use client";

import { useEffect } from "react";
import { AutoTradeEngine } from "@/components/AutoTradeEngine";
import { useAppStore } from "@/lib/store";
import { syncTradesWithAlpaca } from "@/lib/sync-client";
import { loadAutoTradeSettingsIntoStore } from "@/lib/auto-trade-client";
import { loadTradingScheduleIntoStore } from "@/lib/trading-schedule-client";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void loadTradingScheduleIntoStore();
    void loadAutoTradeSettingsIntoStore();
    void syncTradesWithAlpaca();
    fetch("/api/presets")
      .then((r) => r.json())
      .then((d) => {
        const loaded = d.presets ?? [];
        const store = useAppStore.getState();
        store.setPresets(loaded);
        if (loaded[0] && !store.activePresetId) {
          store.setActivePresetId(loaded[0].id);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <AutoTradeEngine />
      {children}
    </>
  );
}
