import fs from "fs";
import path from "path";
import type { Trade, TradeMode } from "@wicksense/core";

const TRADES_PATH = path.join(process.cwd(), "trades.local.json");

function loadTradesFromDisk(): Trade[] {
  try {
    if (!fs.existsSync(TRADES_PATH)) return [];
    const raw = fs.readFileSync(TRADES_PATH, "utf8");
    const data = JSON.parse(raw) as Trade[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function persistTrades(trades: Trade[]) {
  try {
    fs.writeFileSync(TRADES_PATH, JSON.stringify(trades, null, 2), "utf8");
  } catch (err) {
    console.error("[trade-store] Failed to persist trades:", err);
  }
}

let trades: Trade[] = loadTradesFromDisk();

export function getAllTrades(): Trade[] {
  return [...trades];
}

export function setAllTrades(next: Trade[]) {
  trades = [...next];
  persistTrades(trades);
}

export function getOpenTrades(mode?: TradeMode): Trade[] {
  return trades.filter(
    (t) => t.status === "open" && t.side === "buy" && (!mode || t.mode === mode)
  );
}

export function findOpenTrade(
  symbol: string,
  mode: TradeMode,
  chartSlot?: string
): Trade | undefined {
  const open = getOpenTrades(mode).filter((t) => t.symbol === symbol);
  if (chartSlot) {
    return open.find((t) => t.chartSlot === chartSlot) ?? open[0];
  }
  return open[0];
}

export function hasOpenAlpacaPosition(symbol: string, mode: "paper" | "live"): boolean {
  return getOpenTrades(mode).some((t) => t.symbol === symbol);
}

export function upsertTrade(trade: Trade) {
  const idx = trades.findIndex((t) => t.id === trade.id);
  if (idx >= 0) {
    trades[idx] = trade;
  } else {
    trades.unshift(trade);
  }
  persistTrades(trades);
}

export function updateTrade(id: string, updates: Partial<Trade>) {
  const idx = trades.findIndex((t) => t.id === id);
  if (idx < 0) return undefined;
  trades[idx] = { ...trades[idx], ...updates };
  persistTrades(trades);
  return trades[idx];
}
