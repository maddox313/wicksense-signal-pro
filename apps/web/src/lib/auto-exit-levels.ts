import {
  computeStopLossPriceForSide,
  computeTakeProfitPrice,
  isAccountSyncTrade,
  isAppStrategyTrade,
  type Trade,
} from "@wicksense/core";
import { persistTradeAutoExitFields } from "@/lib/auto-exit-meta";
import { resolveExitPercentsForTrade } from "@/lib/trade-exit-settings";
import { deleteTrade, upsertTrade } from "@/lib/trade-store";

function positionKey(trade: Trade): string {
  return `${trade.mode}:${trade.symbol}:${trade.side}`;
}

function isOpenPaperOrLive(trade: Trade): boolean {
  return trade.status === "open" && (trade.mode === "paper" || trade.mode === "live");
}

/** One open record per broker position — prefer app strategy trades over alpaca-sync mirrors. */
export function selectCanonicalOpenTrades(openTrades: Trade[]): Trade[] {
  const byKey = new Map<string, Trade[]>();
  for (const trade of openTrades) {
    if (!isOpenPaperOrLive(trade)) continue;
    const key = positionKey(trade);
    const cohort = byKey.get(key) ?? [];
    cohort.push(trade);
    byKey.set(key, cohort);
  }

  const canonical: Trade[] = [];
  for (const cohort of byKey.values()) {
    const keep =
      cohort.find(isAppStrategyTrade) ??
      cohort.find(
        (t) =>
          typeof t.stopLossPrice === "number" &&
          typeof t.takeProfitPrice === "number" &&
          t.stopLossPrice > 0 &&
          t.takeProfitPrice > 0
      ) ??
      cohort[0];
    if (keep) canonical.push(keep);
  }
  return canonical;
}

export function resolveExitLevels(trade: Trade): {
  stopLossPrice: number;
  takeProfitPrice: number;
} {
  const { stopLossPercent, takeProfitPercent } = resolveExitPercentsForTrade(trade);
  return {
    stopLossPrice: computeStopLossPriceForSide(
      trade.entryPrice,
      trade.side,
      stopLossPercent
    ),
    takeProfitPrice: computeTakeProfitPrice(
      trade.entryPrice,
      trade.side,
      takeProfitPercent
    ),
  };
}

export async function ensureTradeExitLevels(trade: Trade): Promise<Trade> {
  const { stopLossPrice, takeProfitPrice } = resolveExitLevels(trade);
  const enriched: Trade = { ...trade, stopLossPrice, takeProfitPrice };
  const needsPersist =
    trade.stopLossPrice !== stopLossPrice || trade.takeProfitPrice !== takeProfitPrice;
  if (needsPersist) {
    await upsertTrade(enriched);
    persistTradeAutoExitFields(enriched);
  }
  return enriched;
}

/** Drop alpaca-sync duplicates when an app trade exists for the same position. */
export async function prepareOpenTradesForAutoExit(openTrades: Trade[]): Promise<Trade[]> {
  const byKey = new Map<string, Trade[]>();
  for (const trade of openTrades) {
    if (!isOpenPaperOrLive(trade)) continue;
    const key = positionKey(trade);
    const cohort = byKey.get(key) ?? [];
    cohort.push(trade);
    byKey.set(key, cohort);
  }

  const canonical: Trade[] = [];
  for (const cohort of byKey.values()) {
    const keep =
      cohort.find(isAppStrategyTrade) ??
      cohort.find(
        (t) =>
          typeof t.stopLossPrice === "number" &&
          typeof t.takeProfitPrice === "number" &&
          t.stopLossPrice > 0 &&
          t.takeProfitPrice > 0
      ) ??
      cohort[0];
    if (!keep) continue;

    for (const trade of cohort) {
      if (trade.id === keep.id) continue;
      if (isAccountSyncTrade(trade)) {
        await deleteTrade(trade.id);
      }
    }

    canonical.push(await ensureTradeExitLevels(keep));
  }

  return canonical;
}
