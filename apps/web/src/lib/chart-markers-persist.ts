import type { ChartMarker } from "@wicksense/core";

const STORAGE_KEY = "wicksense-chart-markers";
const MAX_MARKERS_PER_SLOT = 100;

export interface PersistedChartMarkers {
  main: ChartMarker[];
  slots: Record<string, ChartMarker[]>;
}

function isChartMarker(value: unknown): value is ChartMarker {
  if (!value || typeof value !== "object") return false;
  const m = value as ChartMarker;
  return (
    typeof m.id === "string" &&
    typeof m.time === "number" &&
    typeof m.price === "number" &&
    (m.side === "buy" || m.side === "sell") &&
    typeof m.label === "string"
  );
}

function trimMarkers(markers: ChartMarker[]): ChartMarker[] {
  return markers.slice(-MAX_MARKERS_PER_SLOT);
}

export function loadChartMarkers(): PersistedChartMarkers {
  if (typeof window === "undefined") return { main: [], slots: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { main: [], slots: {} };
    const parsed = JSON.parse(raw) as {
      main?: unknown;
      slots?: Record<string, unknown>;
    };
    const main = Array.isArray(parsed.main)
      ? trimMarkers(parsed.main.filter(isChartMarker))
      : [];
    const slots: Record<string, ChartMarker[]> = {};
    if (parsed.slots && typeof parsed.slots === "object") {
      for (const [slotId, list] of Object.entries(parsed.slots)) {
        if (Array.isArray(list)) {
          slots[slotId] = trimMarkers(list.filter(isChartMarker));
        }
      }
    }
    return { main, slots };
  } catch {
    return { main: [], slots: {} };
  }
}

let pendingState: PersistedChartMarkers | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flushChartMarkers(): void {
  if (typeof window === "undefined" || !pendingState) return;
  const state = pendingState;
  pendingState = null;
  persistTimer = null;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        main: trimMarkers(state.main),
        slots: Object.fromEntries(
          Object.entries(state.slots).map(([id, markers]) => [id, trimMarkers(markers)])
        ),
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

/** Debounced — avoids hammering storage during rapid signal scans. */
export function persistChartMarkers(state: PersistedChartMarkers): void {
  if (typeof window === "undefined") return;
  pendingState = state;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushChartMarkers, 400);
}
