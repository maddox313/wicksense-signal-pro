import {
  computePerformanceStats,
  evaluateAutoExit,
  isAppStrategyTrade,
  isAutoExitMonitoredTrade,
  DEFAULT_RISK_SETTINGS,
  type AutoExitCloseReason,
  type RiskSettings,
  type Trade,
} from "@wicksense/core";
import { fetchQuote } from "@/lib/alpaca";
import { sendAlert } from "@/lib/alerts";
import { getUserContact, loadUserProfile } from "@/lib/user-config";
import { closeTradeRecord } from "@/lib/close-trade-record";
import { getAllTrades, getOpenTrades } from "@/lib/trade-store";

const exitInFlight = new Set<string>();

async function resolveLatestPrice(symbol: string, fallback: number): Promise<number> {
  try {
    const q = await fetchQuote(symbol);
    const raw = (q as { quote?: { ap?: number; bp?: number; p?: number } })?.quote;
    const price = raw?.ap ?? raw?.bp ?? raw?.p;
    if (typeof price === "number" && price > 0) return price;
  } catch (err) {
    console.warn(`[auto-exit] Quote fetch failed for ${symbol}:`, err);
  }
  return fallback;
}

export interface AutoExitRunResult {
  monitored: number;
  checked: number;
  closedCount: number;
  closed: Trade[];
  failures: {
    tradeId: string;
    symbol: string;
    mode: string;
    closeReason: AutoExitCloseReason;
    error: string;
  }[];
  trades: Trade[];
  performance: ReturnType<typeof computePerformanceStats>;
}

export async function runAutoExitMonitor(
  riskSettings?: RiskSettings
): Promise<AutoExitRunResult> {
  const profile = loadUserProfile();
  const contact = getUserContact();
  const effectiveRisk = riskSettings ?? DEFAULT_RISK_SETTINGS;

  const openTrades = await getOpenTrades();
  const candidates = openTrades.filter(
    (t) => isAppStrategyTrade(t) && isAutoExitMonitoredTrade(t)
  );
  const monitored = candidates.length;

  const closed: Trade[] = [];
  const failures: AutoExitRunResult["failures"] = [];

  for (const trade of candidates) {
    if (exitInFlight.has(trade.id)) continue;
    if (!trade.stopLossPrice || !trade.takeProfitPrice) continue;

    const currentPrice = await resolveLatestPrice(trade.symbol, trade.entryPrice);
    const closeReason = evaluateAutoExit(
      trade.side,
      currentPrice,
      trade.stopLossPrice,
      trade.takeProfitPrice
    );
    if (!closeReason) continue;

    exitInFlight.add(trade.id);
    try {
      console.log("[auto-exit] Triggered", {
        tradeId: trade.id,
        symbol: trade.symbol,
        mode: trade.mode,
        side: trade.side,
        closeReason,
        currentPrice,
        stopLoss: trade.stopLossPrice,
        takeProfit: trade.takeProfitPrice,
      });

      const result = await closeTradeRecord({
        trade,
        closeReason,
        riskSettings: effectiveRisk,
      });
      closed.push(result);

      const alertType = closeReason === "STOP_LOSS" ? "stop_loss" : "sell";
      const label = closeReason === "STOP_LOSS" ? "STOP LOSS" : "TAKE PROFIT";
      await sendAlert(
        "default",
        alertType,
        `${label}: closed ${result.quantity} ${result.symbol} @ $${result.exitPrice?.toFixed(2)} (${result.outcome})`,
        profile.alertSettings,
        contact,
        {
          symbol: result.symbol,
          quantity: result.quantity,
          entryPrice: result.exitPrice ?? currentPrice,
          strategy: result.strategy,
          timeframe: result.timeframe,
          mode: result.mode,
          timestamp: Date.now(),
          reason: closeReason,
        }
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[auto-exit] Broker close failed — trade left open", {
        tradeId: trade.id,
        symbol: trade.symbol,
        mode: trade.mode,
        closeReason,
        error,
      });
      failures.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        mode: trade.mode,
        closeReason,
        error,
      });

      await sendAlert(
        "default",
        "action_required",
        `Auto-exit failed for ${trade.symbol} (${closeReason}): ${error}`,
        profile.alertSettings,
        contact
      );
    } finally {
      exitInFlight.delete(trade.id);
    }
  }

  const trades = await getAllTrades();
  return {
    monitored,
    checked: candidates.length,
    closedCount: closed.length,
    closed,
    failures,
    trades,
    performance: computePerformanceStats(trades),
  };
}
