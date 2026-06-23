import { useAppStore, type PositionSyncModeStatus } from "@/lib/store";

export interface ClientSyncResponse {
  trades: ReturnType<typeof useAppStore.getState>["trades"];
  performance: ReturnType<typeof useAppStore.getState>["performance"];
  sync?: {
    paper: PositionSyncModeStatus;
    live: PositionSyncModeStatus;
  };
  updatedAt?: string;
}

function collectSyncErrors(sync?: ClientSyncResponse["sync"]): string | null {
  if (!sync) return null;
  const errors = [sync.paper.error, sync.live.error].filter(Boolean) as string[];
  return errors.length > 0 ? errors.join(" · ") : null;
}

/** Pull Alpaca positions into the server trade store and refresh client state. */
export async function syncTradesWithAlpaca(): Promise<ClientSyncResponse | null> {
  const store = useAppStore.getState();
  store.setSyncStatus({ loading: true, error: null });

  try {
    const res = await fetch("/api/trades/sync", { method: "POST" });
    if (!res.ok) {
      const message = `Sync failed (${res.status})`;
      store.setSyncStatus({ loading: false, error: message });
      return null;
    }

    const data = (await res.json()) as ClientSyncResponse;
    store.setTrades(data.trades ?? []);
    if (data.performance) store.setPerformance(data.performance);

    store.setSyncStatus({
      loading: false,
      lastSyncTime: data.updatedAt ?? new Date().toISOString(),
      paper: data.sync?.paper ?? null,
      live: data.sync?.live ?? null,
      error: collectSyncErrors(data.sync),
    });

    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync request failed";
    store.setSyncStatus({ loading: false, error: message });
    return null;
  }
}
