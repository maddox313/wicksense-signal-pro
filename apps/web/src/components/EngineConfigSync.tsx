"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import {
  mainTradingSignature,
  slotTradingSignature,
} from "@/lib/engine-config-sync-utils";
import { fetchMainChartRouting } from "@/lib/main-chart-routing-client";

function buildEngineConfigPayload(state: ReturnType<typeof useAppStore.getState>) {
  return {
    activePresetId: state.activePresetId,
    riskSettings: state.riskSettings,
    main: {
      // In AUTO the server ignores symbol; still send for MANUAL mirror.
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

async function hydrateFromServer() {
  const [engineRes, routing] = await Promise.all([
    fetch("/api/settings/engine-config"),
    fetchMainChartRouting(),
  ]);
  if (!engineRes.ok) return;
  const data = await engineRes.json();
  const store = useAppStore.getState();

  if (data.activePresetId) store.setActivePresetId(data.activePresetId);
  if (data.riskSettings) store.setRiskSettings(data.riskSettings);

  // Main Chart symbol always mirrors authoritative engine/routing state.
  if (data.main) {
    if (data.main.symbol) store.applyServerMainSymbol(data.main.symbol);
    if (data.main.timeframe) store.setTimeframe(data.main.timeframe);
    if (data.main.tradingStyle) store.setTradingStyle(data.main.tradingStyle);
    if (data.main.mode) store.setMode(data.main.mode);
    store.setSafetyStopActive(Boolean(data.main.safetyStopActive));
    if (typeof data.main.consecutiveLosses === "number") {
      store.setConsecutiveLosses(data.main.consecutiveLosses);
    }
  }

  if (routing) {
    store.setMainChartRoutingMeta({
      mode: routing.mode,
      reason: routing.lastAssignment?.reason ?? null,
    });
    if (routing.mainSymbol) {
      store.applyServerMainSymbol(routing.mainSymbol);
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
}

/** Keeps UI in sync with server engine + Main Chart routing. Engine does not need the UI. */
export function EngineConfigSync() {
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSigRef = useRef("");

  useEffect(() => {
    void (async () => {
      try {
        await hydrateFromServer();
        const after = useAppStore.getState();
        lastSavedSigRef.current = `${mainTradingSignature(after)}|${slotTradingSignature(after.multiChartSlots)}`;

        // Push non-symbol settings (timeframe/style/mode/risk) — server protects AUTO symbol.
        void fetch("/api/settings/engine-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildEngineConfigPayload(after)),
        });
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  // Re-sync when UI reconnects / stays open so chart mirrors engine routing.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!hydratedRef.current) return;
      void hydrateFromServer().then(() => {
        const after = useAppStore.getState();
        lastSavedSigRef.current = `${mainTradingSignature(after)}|${slotTradingSignature(after.multiChartSlots)}`;
      });
    }, 5000);
    return () => window.clearInterval(id);
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
