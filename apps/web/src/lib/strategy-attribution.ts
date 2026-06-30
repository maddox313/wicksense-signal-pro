import fs from "fs";
import path from "path";
import type { Trade, TradeMode, TradeSide } from "@wicksense/core";

export interface StrategyAttribution {
  strategy: string;
  chartSlot: string;
  signalId?: string;
  timeframe?: string;
  entryTime: number;
}

import { dataFile } from "@/lib/data-paths";

const CONFIG_PATH = dataFile("strategy-attributions.local.json");

function attributionKey(symbol: string, side: TradeSide, mode: TradeMode): string {
  return `${mode}:${symbol}:${side}`;
}

function loadAll(): Record<string, StrategyAttribution> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const data = JSON.parse(raw) as Record<string, StrategyAttribution>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, StrategyAttribution>): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function saveStrategyAttribution(
  symbol: string,
  side: TradeSide,
  mode: TradeMode,
  attribution: Omit<StrategyAttribution, "entryTime"> & { entryTime?: number }
): void {
  const key = attributionKey(symbol, side, mode);
  const all = loadAll();
  all[key] = {
    ...attribution,
    entryTime: attribution.entryTime ?? Date.now(),
  };
  saveAll(all);
}

export function loadStrategyAttribution(
  symbol: string,
  side: TradeSide,
  mode: TradeMode
): StrategyAttribution | null {
  return loadAll()[attributionKey(symbol, side, mode)] ?? null;
}

export function applyAttributionToOpenTrade(
  trade: Trade,
  attribution: StrategyAttribution
): Trade {
  return {
    ...trade,
    strategy: attribution.strategy,
    chartSlot: attribution.chartSlot,
    signalId: attribution.signalId ?? trade.signalId,
    timeframe: attribution.timeframe ?? trade.timeframe,
    status: "open",
  };
}
