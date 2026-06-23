import { useAppStore } from "@/lib/store";

export interface ClientSyncResponse {
  trades: ReturnType<typeof useAppStore.getState>["trades"];
  performance: ReturnType<typeof useAppStore.getState>["performance"];
  sync?: {
    paper: { imported: number; closed: number; quantityUpdated: number; alpacaSymbols: string[] };
    live: { imported: number; closed: number; quantityUpdated: number; alpacaSymbols: string[] };
  };
  updatedAt?: string;
}

/** Pull Alpaca positions into the server trade store and refresh client state. */
export async function syncTradesWithAlpaca(): Promise<ClientSyncResponse | null> {
  try {
    const res = await fetch("/api/trades/sync", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as ClientSyncResponse;
    const store = useAppStore.getState();
    store.setTrades(data.trades ?? []);
    if (data.performance) store.setPerformance(data.performance);
    return data;
  } catch {
    return null;
  }
}
