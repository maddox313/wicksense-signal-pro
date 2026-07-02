import type { StrategyPreset, Trade } from "@wicksense/core";
import { AUTO_TRADE_SLOT_IDS } from "@/lib/chart-slots";
import { loadEngineConfig, patchEngineSlot } from "@/lib/engine-config";
import { scanTopOpportunities } from "@/lib/market-opportunity-scanner";

const ETF_SYMBOLS = new Set(["SPY", "QQQ", "IWM", "DIA"]);

function slotHasOpenTrade(trades: Trade[], slotId: string, symbol: string): boolean {
  return trades.some(
    (t) =>
      t.status === "open" &&
      t.chartSlot === slotId &&
      t.symbol === symbol &&
      (t.mode === "paper" || t.mode === "live")
  );
}

function pickUncorrelatedCandidates(
  opportunities: Awaited<ReturnType<typeof scanTopOpportunities>>,
  reserved: Set<string>,
  limit: number
): string[] {
  const picked: string[] = [];
  const hasStock = [...reserved].some((s) => !ETF_SYMBOLS.has(s));

  for (const item of opportunities) {
    const symbol = item.symbol.toUpperCase();
    if (reserved.has(symbol) || picked.includes(symbol)) continue;

    // Prefer individual names over ETFs when we already hold a stock.
    if (hasStock && ETF_SYMBOLS.has(symbol) && picked.length < limit - 1) {
      continue;
    }

    picked.push(symbol);
    if (picked.length >= limit) break;
  }

  // Backfill ETFs if we still need symbols.
  if (picked.length < limit) {
    for (const item of opportunities) {
      const symbol = item.symbol.toUpperCase();
      if (reserved.has(symbol) || picked.includes(symbol)) continue;
      picked.push(symbol);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

export interface SlotSymbolAssignment {
  slotId: string;
  symbol: string;
  previousSymbol: string;
  changed: boolean;
  pinned: boolean;
}

/**
 * Assign top-confidence opportunities to auto-trade slots (unique symbols).
 * Slots with open positions keep their current symbol.
 */
export async function routeOpportunitiesToSlots(params: {
  preset: StrategyPreset;
  timeframe: string;
  openTrades: Trade[];
}): Promise<SlotSymbolAssignment[]> {
  const engine = loadEngineConfig();
  const opportunities = await scanTopOpportunities({
    preset: params.preset,
    timeframe: params.timeframe,
  });

  const assignments: SlotSymbolAssignment[] = [];
  const reserved = new Set<string>();

  for (const slotId of AUTO_TRADE_SLOT_IDS) {
    const slot = slotId === "main" ? engine.main : engine.multi[slotId];
    const current = slot.symbol.toUpperCase();

    if (slotHasOpenTrade(params.openTrades, slotId, current)) {
      reserved.add(current);
      assignments.push({
        slotId,
        symbol: current,
        previousSymbol: current,
        changed: false,
        pinned: true,
      });
    }
  }

  const slotsNeedingSymbols = AUTO_TRADE_SLOT_IDS.filter(
    (id) => !assignments.some((a) => a.slotId === id)
  );
  const candidates = pickUncorrelatedCandidates(
    opportunities,
    reserved,
    slotsNeedingSymbols.length
  );

  slotsNeedingSymbols.forEach((slotId, index) => {
    const slot = slotId === "main" ? engine.main : engine.multi[slotId];
    const previousSymbol = slot.symbol.toUpperCase();
    const nextSymbol = candidates[index] ?? previousSymbol;
    const changed = nextSymbol !== previousSymbol;

    if (changed) {
      patchEngineSlot(slotId, { symbol: nextSymbol });
    }

    reserved.add(nextSymbol);
    assignments.push({
      slotId,
      symbol: nextSymbol,
      previousSymbol,
      changed,
      pinned: false,
    });
  });

  return assignments;
}
