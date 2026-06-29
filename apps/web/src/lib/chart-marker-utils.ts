import type { ChartMarker, Signal, Trade } from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { MAIN_CHART_SLOT, MULTI_CHART_SLOT_IDS } from "@/lib/chart-slots";

export function signalToChartMarker(signal: Signal): ChartMarker {
  return {
    id: signal.id,
    time: signal.time,
    price: signal.price,
    side: signal.side,
    label: signal.side === "buy" ? "BUY" : "SELL",
    strategy: signal.strategy,
    symbol: signal.symbol,
  };
}

export function tradeToChartMarker(trade: Trade): ChartMarker {
  return {
    id: `trade-${trade.id}`,
    time: Math.floor(trade.entryTime / 1000),
    price: trade.entryPrice,
    side: trade.side,
    label: trade.side === "buy" ? "BUY" : "SELL",
    strategy: trade.strategy,
    symbol: trade.symbol,
  };
}

/** Snap marker time to the nearest loaded bar when there is no exact match. */
export function snapMarkerTimeToBars(markerTime: number, barTimes: number[]): number | null {
  if (barTimes.length === 0) return null;
  if (barTimes.includes(markerTime)) return markerTime;

  let nearest = barTimes[0];
  let minDist = Math.abs(markerTime - nearest);
  for (const t of barTimes) {
    const dist = Math.abs(markerTime - t);
    if (dist < minDist) {
      minDist = dist;
      nearest = t;
    }
  }

  // Reject if the nearest bar is more than one day away (stale / wrong symbol).
  if (minDist > 86_400) return null;
  return nearest;
}

export function filterMarkersForSymbol(markers: ChartMarker[], symbol: string): ChartMarker[] {
  return markers.filter((m) => !m.symbol || m.symbol === symbol);
}

export function addChartMarkerForSlot(slotId: string, marker: ChartMarker): void {
  const store = useAppStore.getState();
  if (slotId === MAIN_CHART_SLOT) {
    store.addMarker(marker);
    return;
  }
  if ((MULTI_CHART_SLOT_IDS as readonly string[]).includes(slotId)) {
    store.addMultiChartMarker(slotId, marker);
  }
}

export function addSignalChartMarker(slotId: string, signal: Signal): void {
  addChartMarkerForSlot(slotId, signalToChartMarker(signal));
}

/** Add buy markers for open trades that do not already have a chart marker. */
export function mergeTradeEntryMarkers(trades: Trade[]): void {
  const store = useAppStore.getState();
  const existingIds = new Set([
    ...store.markers.map((m) => m.id),
    ...store.multiChartSlots.flatMap((slot) => slot.markers.map((m) => m.id)),
  ]);

  for (const trade of trades) {
    if (trade.status !== "open" || trade.side !== "buy") continue;

    const marker = tradeToChartMarker(trade);
    if (existingIds.has(marker.id)) continue;

    const slotId =
      trade.chartSlot && (MULTI_CHART_SLOT_IDS as readonly string[]).includes(trade.chartSlot)
        ? trade.chartSlot
        : MAIN_CHART_SLOT;

    addChartMarkerForSlot(slotId, marker);
    existingIds.add(marker.id);
  }
}
