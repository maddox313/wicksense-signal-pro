"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { refreshSlotBarsOnly } from "@/lib/autoTradeRunner";

/**
 * Loads chart market data immediately on app start and when symbol/timeframe
 * changes — not tied to the 30s auto-trade polling loop.
 */
export function ChartDataBootstrap() {
  const symbol = useAppStore((s) => s.symbol);
  const timeframe = useAppStore((s) => s.timeframe);
  const multiChartSlots = useAppStore((s) => s.multiChartSlots);
  const prevMainRef = useRef({ symbol, timeframe });

  useEffect(() => {
    const prev = prevMainRef.current;
    const changed = prev.symbol !== symbol || prev.timeframe !== timeframe;
    prevMainRef.current = { symbol, timeframe };

    if (changed) {
      const store = useAppStore.getState();
      const slotData = store.slotMarketData[MAIN_CHART_SLOT];
      if (slotData?.bars.length) {
        store.patchSlotMarketData(MAIN_CHART_SLOT, {
          bars: [],
          loading: true,
          refreshing: false,
          fetchError: null,
        });
      }
    }

    void refreshSlotBarsOnly(MAIN_CHART_SLOT, symbol, timeframe);
  }, [symbol, timeframe]);

  const multiSig = multiChartSlots
    .map((slot) => `${slot.id}:${slot.symbol}:${slot.timeframe}`)
    .join("|");
  const prevMultiSigRef = useRef(multiSig);

  useEffect(() => {
    const prevSig = prevMultiSigRef.current;
    prevMultiSigRef.current = multiSig;
    const store = useAppStore.getState();

    for (const slot of multiChartSlots) {
      const slotKey = `${slot.id}:${slot.symbol}:${slot.timeframe}`;
      if (prevSig !== multiSig && prevSig.includes(slot.id)) {
        const prevPart = prevSig.split("|").find((part) => part.startsWith(`${slot.id}:`));
        if (prevPart && prevPart !== slotKey) {
          store.patchSlotMarketData(slot.id, {
            bars: [],
            loading: true,
            refreshing: false,
            fetchError: null,
          });
        }
      }
      void refreshSlotBarsOnly(slot.id, slot.symbol, slot.timeframe);
    }
  }, [multiSig, multiChartSlots]);

  return null;
}
