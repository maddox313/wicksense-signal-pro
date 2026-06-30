"use client";

import { useEffect } from "react";
import { syncTradesWithAlpaca } from "@/lib/sync-client";
import { useAppStore } from "@/lib/store";

/** Light UI refresh only — trading runs server-side. */
const SYNC_MS = 90_000;
const STATUS_MS = 60_000;

export function AutoTradeEngine() {
  useEffect(() => {
    const refresh = () => void syncTradesWithAlpaca();
    refresh();
    const interval = setInterval(refresh, SYNC_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);
        const res = await fetch("/api/trades/engine-status", { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return;
        const data = await res.json();
        if (data.autoExitStatus) {
          useAppStore.getState().setAutoExitStatus(data.autoExitStatus);
        }
      } catch {
        /* non-blocking UI refresh */
      }
    };
    void pollStatus();
    const interval = setInterval(() => void pollStatus(), STATUS_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
