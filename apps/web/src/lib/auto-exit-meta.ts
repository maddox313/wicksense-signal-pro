import fs from "fs";
import path from "path";
import type { AutoExitCloseReason, Trade, TradeOutcome } from "@wicksense/core";

import { dataFile } from "@/lib/data-paths";

const META_PATH = dataFile("auto-exit-meta.local.json");

export interface AutoExitMeta {
  takeProfitPrice: number;
  closeReason?: AutoExitCloseReason;
  outcome?: TradeOutcome;
}

interface AutoExitMetaFile {
  trades: Record<string, AutoExitMeta>;
}

function readFile(): AutoExitMetaFile {
  try {
    if (!fs.existsSync(META_PATH)) return { trades: {} };
    const raw = fs.readFileSync(META_PATH, "utf8");
    const data = JSON.parse(raw) as Partial<AutoExitMetaFile>;
    return { trades: data.trades ?? {} };
  } catch {
    return { trades: {} };
  }
}

function writeFile(data: AutoExitMetaFile): void {
  fs.writeFileSync(META_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function getAutoExitMeta(tradeId: string): AutoExitMeta | undefined {
  return readFile().trades[tradeId];
}

export function saveAutoExitMeta(tradeId: string, meta: Partial<AutoExitMeta>): void {
  const file = readFile();
  const current = file.trades[tradeId] ?? { takeProfitPrice: 0 };
  file.trades[tradeId] = {
    ...current,
    ...meta,
    takeProfitPrice: meta.takeProfitPrice ?? current.takeProfitPrice,
  };
  writeFile(file);
}

export function deleteAutoExitMeta(tradeId: string): void {
  const file = readFile();
  if (!file.trades[tradeId]) return;
  delete file.trades[tradeId];
  writeFile(file);
}

export function deleteAutoExitMetaForTrades(tradeIds: string[]): void {
  if (tradeIds.length === 0) return;
  const file = readFile();
  let changed = false;
  for (const id of tradeIds) {
    if (file.trades[id]) {
      delete file.trades[id];
      changed = true;
    }
  }
  if (changed) writeFile(file);
}

export function mergeTradeWithAutoExitMeta(trade: Trade): Trade {
  const meta = getAutoExitMeta(trade.id);
  if (!meta) return trade;
  return {
    ...trade,
    takeProfitPrice: meta.takeProfitPrice ?? trade.takeProfitPrice,
    closeReason: meta.closeReason ?? trade.closeReason,
    outcome: meta.outcome ?? trade.outcome,
  };
}

export function persistTradeAutoExitFields(trade: Trade): void {
  if (typeof trade.takeProfitPrice !== "number") return;
  saveAutoExitMeta(trade.id, {
    takeProfitPrice: trade.takeProfitPrice,
    closeReason: trade.closeReason,
    outcome: trade.outcome,
  });
}
