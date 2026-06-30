import fs from "fs";
import type { LiveTradingSettings } from "@wicksense/core";
import { DEFAULT_LIVE_TRADING_SETTINGS } from "@wicksense/core";
import { dataFile } from "@/lib/data-paths";

const CONFIG_PATH = dataFile("live-trading.local.json");

export function loadLiveTradingSettings(): LiveTradingSettings {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_LIVE_TRADING_SETTINGS };
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const data = JSON.parse(raw) as Partial<LiveTradingSettings>;
    return {
      brokerStopLossEnabled:
        data.brokerStopLossEnabled ?? DEFAULT_LIVE_TRADING_SETTINGS.brokerStopLossEnabled,
      stopLossPercent:
        typeof data.stopLossPercent === "number"
          ? Math.min(20, Math.max(0.5, data.stopLossPercent))
          : DEFAULT_LIVE_TRADING_SETTINGS.stopLossPercent,
      takeProfitPercent:
        typeof data.takeProfitPercent === "number"
          ? Math.min(50, Math.max(0.5, data.takeProfitPercent))
          : DEFAULT_LIVE_TRADING_SETTINGS.takeProfitPercent,
    };
  } catch {
    return { ...DEFAULT_LIVE_TRADING_SETTINGS };
  }
}

export function saveLiveTradingSettings(
  updates: Partial<LiveTradingSettings>
): LiveTradingSettings {
  const current = loadLiveTradingSettings();
  const next: LiveTradingSettings = {
    brokerStopLossEnabled:
      updates.brokerStopLossEnabled ?? current.brokerStopLossEnabled,
    stopLossPercent:
      typeof updates.stopLossPercent === "number"
        ? Math.min(20, Math.max(0.5, updates.stopLossPercent))
        : current.stopLossPercent,
    takeProfitPercent:
      typeof updates.takeProfitPercent === "number"
        ? Math.min(50, Math.max(0.5, updates.takeProfitPercent))
        : current.takeProfitPercent,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function computeStopLossPrice(entryPrice: number, stopLossPercent: number): number {
  const raw = entryPrice * (1 - stopLossPercent / 100);
  return entryPrice >= 1 ? Math.round(raw * 100) / 100 : Math.round(raw * 10000) / 10000;
}
