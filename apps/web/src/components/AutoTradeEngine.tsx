"use client";

import { useEffect, useRef } from "react";
import {
  AUTO_TRADE_POLL_MS,
  buildMainSlotConfig,
  buildMultiSlotConfig,
  runSlotCycle,
} from "@/lib/autoTradeRunner";
import { syncTradesWithAlpaca } from "@/lib/sync-client";
import { useAppStore } from "@/lib/store";

/**
 * Persistent auto-trade engine — mounted in the app shell so polling, signal
 * detection, and execution continue while the user navigates to other pages.
 */
export function AutoTradeEngine() {
  const runningRef = useRef(false);
  const lastSignalBySlot = useRef(new Map<string, string>());
  const symbolTfBySlot = useRef(new Map<string, string>());

  useEffect(() => {
    const tick = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await syncTradesWithAlpaca();
        const { multiChartSlots } = useAppStore.getState();
        await runSlotCycle(
          buildMainSlotConfig(),
          lastSignalBySlot.current,
          symbolTfBySlot.current
        );
        for (const slot of multiChartSlots) {
          await runSlotCycle(
            buildMultiSlotConfig(slot),
            lastSignalBySlot.current,
            symbolTfBySlot.current
          );
        }
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), AUTO_TRADE_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
