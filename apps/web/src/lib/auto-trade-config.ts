import fs from "fs";
import { ALL_CHART_SLOT_IDS } from "@/lib/chart-slots";

import { dataFile } from "@/lib/data-paths";

const CONFIG_PATH = dataFile("auto-trade.local.json");

export type AutoTradeSlotSettings = Record<string, boolean>;

const DEFAULT_SLOTS: AutoTradeSlotSettings = Object.fromEntries(
  ALL_CHART_SLOT_IDS.map((id) => [id, false])
);

function normalizeSlots(raw: unknown): AutoTradeSlotSettings {
  const slots = { ...DEFAULT_SLOTS };
  if (!raw || typeof raw !== "object") return slots;

  for (const slotId of ALL_CHART_SLOT_IDS) {
    const value = (raw as Record<string, unknown>)[slotId];
    if (typeof value === "boolean") slots[slotId] = value;
  }
  return slots;
}

export function loadAutoTradeSettings(): AutoTradeSlotSettings {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_SLOTS };
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as {
      slots?: unknown;
    };
    return normalizeSlots(data.slots);
  } catch {
    return { ...DEFAULT_SLOTS };
  }
}

export function saveAutoTradeSlot(slotId: string, enabled: boolean): AutoTradeSlotSettings {
  if (!ALL_CHART_SLOT_IDS.includes(slotId as (typeof ALL_CHART_SLOT_IDS)[number])) {
    throw new Error(`Unknown chart slot: ${slotId}`);
  }

  const current = loadAutoTradeSettings();
  const next = { ...current, [slotId]: enabled };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ slots: next }, null, 2), "utf8");
  return next;
}

/** Storage location for persisted Auto Trade settings. */
export const AUTO_TRADE_CONFIG_PATH = CONFIG_PATH;
