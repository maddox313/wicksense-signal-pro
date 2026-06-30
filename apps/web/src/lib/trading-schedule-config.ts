import fs from "fs";
import {
  DEFAULT_TRADING_SCHEDULE,
  normalizeTradingSchedule,
  type TradingScheduleSettings,
} from "@wicksense/core";

import { dataFile } from "@/lib/data-paths";

const CONFIG_PATH = dataFile("trading-schedule.local.json");

export function loadTradingScheduleSettings(): TradingScheduleSettings {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_TRADING_SCHEDULE };
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<TradingScheduleSettings>;
    return normalizeTradingSchedule(raw);
  } catch {
    return { ...DEFAULT_TRADING_SCHEDULE };
  }
}

export function saveTradingScheduleSettings(
  updates: Partial<TradingScheduleSettings>
): TradingScheduleSettings {
  const next = normalizeTradingSchedule(updates);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export const TRADING_SCHEDULE_CONFIG_PATH = CONFIG_PATH;
