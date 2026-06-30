"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import {
  mainTradingSignature,
  slotTradingSignature,
} from "@/lib/engine-config-sync-utils";

function buildEngineConfigPayload(state: ReturnType<typeof useAppStore.getState>) {
  return {
    activePresetId: state.activePresetId,
    riskSettings: state.riskSettings,
    main: {
      symbol: state.symbol,
      timeframe: state.timeframe,
      tradingStyle: state.tradingStyle,
      mode: state.mode,
      safetyStopActive: state.safetyStopActive,
      consecutiveLosses: state.consecutiveLosses,
    },
    multi: Object.fromEntries(
      state.multiChartSlots.map((slot) => [
        slot.id,
        {
          symbol: slot.symbol,
          timeframe: slot.timeframe,
          tradingStyle: slot.tradingStyle,
          mode: slot.mode,
          safetyStopActive: slot.safetyStopActive,
          consecutiveLosses: slot.consecutiveLosses,
        },
      ])
    ),
  };
}

/** Keeps server-side engine config in sync with UI settings for headless trading. */
export function EngineConfigSync() {
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSigRef = useRef("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/engine-config");
        if (!res.ok) return;
        const data = await res.json();
        const store = useAppStore.getState();

        if (data.activePresetId) store.setActivePresetId(data.activePresetId);
        if (data.riskSettings) store.setRiskSettings(data.riskSettings);
        if (data.main) {
          if (data.main.symbol) store.setSymbol(data.main.symbol);
          if (data.main.timeframe) store.setTimeframe(data.main.timeframe);
          if (data.main.tradingStyle) store.setTradingStyle(data.main.tradingStyle);
          if (data.main.mode) store.setMode(data.main.mode);
          store.setSafetyStopActive(Boolean(data.main.safetyStopActive));
          if (typeof data.main.consecutiveLosses === "number") {
            store.setConsecutiveLosses(data.main.consecutiveLosses);
          }
        }
        if (data.multi) {
          for (const slot of store.multiChartSlots) {
            const remote = data.multi[slot.id];
            if (remote) {
              store.updateMultiChartSlot(slot.id, {
                symbol: remote.symbol ?? slot.symbol,
                timeframe: remote.timeframe ?? slot.timeframe,
                tradingStyle: remote.tradingStyle ?? slot.tradingStyle,
                mode: remote.mode ?? slot.mode,
                safetyStopActive: Boolean(remote.safetyStopActive),
                consecutiveLosses:
                  typeof remote.consecutiveLosses === "number"
                    ? remote.consecutiveLosses
                    : slot.consecutiveLosses,
              });
            }
          }
        }

        const after = useAppStore.getState();
        lastSavedSigRef.current = `${mainTradingSignature(after)}|${slotTradingSignature(after.multiChartSlots)}`;
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      if (!hydratedRef.current) return;

      const sig = `${mainTradingSignature(state)}|${slotTradingSignature(state.multiChartSlots)}`;
      if (sig === lastSavedSigRef.current) return;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const current = useAppStore.getState();
        const nextSig = `${mainTradingSignature(current)}|${slotTradingSignature(current.multiChartSlots)}`;
        if (nextSig === lastSavedSigRef.current) return;
        lastSavedSigRef.current = nextSig;
        void fetch("/api/settings/engine-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildEngineConfigPayload(current)),
        });
      }, 1000);
    });

    return () => {
      unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return null;
}
