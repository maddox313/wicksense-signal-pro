export const MAIN_CHART_SLOT = "main";

/** Positions imported from Alpaca reconciliation (not tied to a chart slot). */
export const ALPACA_SYNC_SLOT = "alpaca-sync";

export const MULTI_CHART_SLOT_IDS = ["multi-1", "multi-2", "multi-3", "multi-4"] as const;

export const ALL_CHART_SLOT_IDS = [MAIN_CHART_SLOT, ...MULTI_CHART_SLOT_IDS] as const;

export type ChartSlotId = (typeof ALL_CHART_SLOT_IDS)[number];

export const CHART_SLOT_LABELS: Record<string, string> = {
  main: "Main Chart",
  "alpaca-sync": "Alpaca Sync",
  "multi-1": "Multi Chart 1",
  "multi-2": "Multi Chart 2",
  "multi-3": "Multi Chart 3",
  "multi-4": "Multi Chart 4",
};

export function chartSlotLabel(slot?: string) {
  if (!slot) return "Unknown";
  return CHART_SLOT_LABELS[slot] ?? slot;
}
