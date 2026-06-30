import type { PerformanceStats, RiskSettings, Trade } from "@wicksense/core";

export interface CloseOpenTradeResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  trade?: Trade;
  trades?: Trade[];
  performance?: PerformanceStats;
  consecutiveLosses?: number;
  safetyStopTriggered?: boolean;
}

export async function closeOpenTrade(params: {
  trade: Trade;
  riskSettings: RiskSettings;
}): Promise<CloseOpenTradeResult> {
  const { trade, riskSettings } = params;

  if (trade.status !== "open") {
    return { ok: false, skipped: true, reason: "Trade is not open" };
  }

  if (trade.mode !== "paper" && trade.mode !== "live") {
    return { ok: false, skipped: true, reason: "Only paper and live trades can be closed here" };
  }

  try {
    const res = await fetch("/api/trades/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tradeId: trade.id,
        riskSettings,
      }),
    });

    let data: CloseOpenTradeResult & { error?: string } = { ok: false };
    try {
      data = (await res.json()) as CloseOpenTradeResult & { error?: string };
    } catch {
      return { ok: false, reason: `Close failed (${res.status})` };
    }

    if (data.skipped) {
      return { ok: false, skipped: true, reason: data.reason ?? "Close skipped" };
    }
    if (!res.ok) {
      return { ok: false, reason: data.error ?? data.reason ?? `Close failed (${res.status})` };
    }

    return {
      ok: true,
      trade: data.trade,
      trades: data.trades,
      performance: data.performance,
      consecutiveLosses: data.consecutiveLosses,
      safetyStopTriggered: data.safetyStopTriggered,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Close failed",
    };
  }
}
