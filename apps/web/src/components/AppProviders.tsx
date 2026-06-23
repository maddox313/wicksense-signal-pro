"use client";

import { useEffect } from "react";
import { AutoTradeEngine } from "@/components/AutoTradeEngine";
import { useAppStore } from "@/lib/store";
import { syncTradesWithAlpaca } from "@/lib/sync-client";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
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
