export const CHART_SLOT_LABELS: Record<string, string> = {
  main: "Main Chart",
  "multi-1": "Multi Chart 1",
  "multi-2": "Multi Chart 2",
  "multi-3": "Multi Chart 3",
  "multi-4": "Multi Chart 4",
};

export function chartSlotLabel(slot?: string) {
  if (!slot) return "Unknown";
  return CHART_SLOT_LABELS[slot] ?? slot;
}
