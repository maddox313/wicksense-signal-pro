import { useAppStore } from "@/lib/store";

export interface AutoExitMonitorStatus {
  enabled: boolean;
  monitoredCount: number;
  lastCheckAt: number | null;
  lastError: string | null;
}

export function isAnyAutoTradeEnabled(): boolean {
  const { autoTradeEnabled, multiChartSlots } = useAppStore.getState();
  return autoTradeEnabled || multiChartSlots.some((slot) => slot.autoTradeEnabled);
}

export async function runAutoExitMonitor(): Promise<void> {
  const store = useAppStore.getState();

  if (!isAnyAutoTradeEnabled()) {
    store.setAutoExitStatus({
      enabled: false,
      monitoredCount: 0,
      lastCheckAt: Date.now(),
      lastError: null,
    });
    return;
  }

  try {
    const res = await fetch("/api/trades/auto-exit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskSettings: store.riskSettings }),
    });
    const data = await res.json();

    if (!res.ok) {
      const error = data.error ?? "Auto-exit monitor request failed";
      console.error("[auto-exit-client]", error);
      store.setAutoExitStatus({
        enabled: true,
        monitoredCount: 0,
        lastCheckAt: Date.now(),
        lastError: error,
      });
      return;
    }

    store.setAutoExitStatus({
      enabled: true,
      monitoredCount: data.monitored ?? 0,
      lastCheckAt: Date.now(),
      lastError:
        data.failures?.length > 0
          ? `${data.failures.length} auto-exit failure(s) — see console`
          : null,
    });

    if (data.trades) store.setTrades(data.trades);
    if (data.performance) store.setPerformance(data.performance);

    if (data.failures?.length > 0) {
      for (const failure of data.failures) {
        console.error("[auto-exit-client] failure", failure);
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Auto-exit monitor failed";
    console.error("[auto-exit-client]", error);
    store.setAutoExitStatus({
      enabled: true,
      monitoredCount: 0,
      lastCheckAt: Date.now(),
      lastError: error,
    });
  }
}
