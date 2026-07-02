import fs from "fs";
import {
  DEFAULT_TRADING_SCHEDULE,
  normalizeTradingSchedule,
  type TradingScheduleSettings,
} from "@wicksense/core";
import { getAppSetting, setAppSetting } from "@/lib/app-settings";

import { dataFile } from "@/lib/data-paths";

const CONFIG_PATH = dataFile("trading-schedule.local.json");
const DB_KEY = "trading_schedule";

let memoryCache: TradingScheduleSettings | null = null;
let hydratePromise: Promise<TradingScheduleSettings> | null = null;

function loadTradingScheduleFromFile(): TradingScheduleSettings {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_TRADING_SCHEDULE };
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<TradingScheduleSettings>;
    return normalizeTradingSchedule(raw);
  } catch {
    return { ...DEFAULT_TRADING_SCHEDULE };
  }
}

function writeTradingScheduleToFile(settings: TradingScheduleSettings): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), "utf8");
}

export function loadTradingScheduleSettings(): TradingScheduleSettings {
  return memoryCache ?? loadTradingScheduleFromFile();
}

export async function primeTradingScheduleCache(): Promise<TradingScheduleSettings> {
  if (memoryCache) return memoryCache;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const fromDb = await getAppSetting<Partial<TradingScheduleSettings>>(DB_KEY);
    if (fromDb) {
      memoryCache = normalizeTradingSchedule(fromDb);
      writeTradingScheduleToFile(memoryCache);
      return memoryCache;
    }

    const fromFile = loadTradingScheduleFromFile();
    memoryCache = fromFile;

    const differsFromDefault =
      JSON.stringify(fromFile) !== JSON.stringify(DEFAULT_TRADING_SCHEDULE);
    if (differsFromDefault) {
      await setAppSetting(DB_KEY, fromFile);
    }

    return fromFile;
  })();

  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export async function saveTradingScheduleSettings(
  updates: Partial<TradingScheduleSettings>
): Promise<TradingScheduleSettings> {
  const next = normalizeTradingSchedule(updates);
  memoryCache = next;
  writeTradingScheduleToFile(next);
  await setAppSetting(DB_KEY, next);
  return next;
}

export const TRADING_SCHEDULE_CONFIG_PATH = CONFIG_PATH;
