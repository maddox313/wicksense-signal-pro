"use client";

import { useEffect } from "react";
import { AutoTradeEngine } from "@/components/AutoTradeEngine";
import { ChartDataBootstrap } from "@/components/ChartDataBootstrap";
import { useAppStore } from "@/lib/store";
import { syncTradesWithAlpaca } from "@/lib/sync-client";
import { loadAutoTradeSettingsIntoStore } from "@/lib/auto-trade-client";
import { loadTradingScheduleIntoStore } from "@/lib/trading-schedule-client";
import { bootstrapGeneratedFromSignals } from "@/lib/signal-activity-store";
import { loadPresetsIntoStore } from "@/lib/presets-client";
import { loadProfileIntoStore } from "@/lib/profile-client";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void loadTradingScheduleIntoStore();
    void loadAutoTradeSettingsIntoStore();
    void loadProfileIntoStore();
    void syncTradesWithAlpaca();
    void loadPresetsIntoStore();
    bootstrapGeneratedFromSignals(useAppStore.getState().signals);
  }, []);

  return (
    <>
      <ChartDataBootstrap />
      <AutoTradeEngine />
      {children}
    </>
  );
}
