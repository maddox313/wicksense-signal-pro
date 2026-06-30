import type { OHLCV, AlertSettings, RiskSettings, TradeMode } from "@wicksense/core";
import { NextRequest } from "next/server";
import { POST as executeTradeHandler } from "@/app/api/trades/execute/route";
import { patchEngineSlot } from "@/lib/engine-config";

export interface ServerExecuteResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

export async function executeServerSlotTrade(params: {
  slotId: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  strategy: string;
  mode: TradeMode;
  signalId?: string;
  bars: OHLCV[];
  timeframe?: string;
  signalReason?: string;
  signalBarTime?: number;
  riskSettings: RiskSettings;
  alertSettings: AlertSettings;
}): Promise<ServerExecuteResult> {
  const {
    slotId,
    symbol,
    side,
    price,
    strategy,
    mode,
    signalId,
    timeframe,
    signalReason,
    signalBarTime,
    riskSettings,
    alertSettings,
  } = params;

  try {
    // Call the route handler directly — HTTP self-fetch deadlocks the Next.js dev server.
    const req = new NextRequest("http://internal/api/trades/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        side,
        price,
        strategy,
        mode,
        riskSettings,
        alertSettings,
        signalId,
        chartSlot: slotId,
        timeframe,
        signalReason,
        signalBarTime,
      }),
    });
    const res = await executeTradeHandler(req);
    const data = (await res.json()) as {
      skipped?: boolean;
      reason?: string;
      error?: string;
      safetyStopTriggered?: boolean;
      consecutiveLosses?: number;
    };

    if (data.safetyStopTriggered) {
      patchEngineSlot(slotId, { safetyStopActive: true });
    }
    if (typeof data.consecutiveLosses === "number") {
      patchEngineSlot(slotId, { consecutiveLosses: data.consecutiveLosses });
    }

    if (data.skipped) {
      if (data.reason?.includes("trading hours") || data.reason?.includes("Trading is not")) {
        console.warn(`[ServerAutoTrade:${slotId}] ${data.reason}`);
      }
      return { ok: false, skipped: true, reason: data.reason };
    }
    if (!res.ok) {
      console.error(`[ServerAutoTrade:${slotId}]`, data.error ?? "Trade failed");
      return { ok: false, reason: data.error ?? "Trade failed" };
    }

    console.log(`[ServerAutoTrade:${slotId}] ${side.toUpperCase()} ${symbol} @ ${price}`);
    return { ok: true };
  } catch (err) {
    console.error(`[ServerAutoTrade:${slotId}] Trade execution failed`, err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Trade execution failed",
    };
  }
}
