import { NextRequest, NextResponse } from "next/server";
import { computePerformanceStats, isAppStrategyTrade } from "@wicksense/core";
import type { RiskSettings, AlertSettings, Trade, TradeMode } from "@wicksense/core";
import {
  placeOrder,
  resolveAccountEquity,
  placeLiveStopLossOrder,
  cancelLiveStopOrdersForSymbol,
} from "@/lib/alpaca";
import { sendAlert, type TradeAlertDetails } from "@/lib/alerts";
import { logDuplicateSignalBlocked } from "@/lib/signal-dedupe-log";
import { getUserContact, loadUserProfile } from "@/lib/user-config";
import { saveStrategyAttribution } from "@/lib/strategy-attribution";
import {
  loadLiveTradingSettings,
  computeStopLossPrice,
} from "@/lib/live-trading-config";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import {
  getAllTrades,
  getOpenTrades,
  findOpenTrade,
  upsertTrade,
  deleteSyncImportsForPosition,
} from "@/lib/trade-store";
import { syncAlpacaPositions } from "@/lib/position-sync";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import { evaluateTradingSchedule } from "@wicksense/core";

const executedSignalIds = new Set<string>();

function getEngine(chartSlot: string, settings: RiskSettings) {
  return getRiskEngine(chartSlot, settings);
}

function signalKey(chartSlot: string, signalId: string) {
  return `${chartSlot}:${signalId}`;
}

function blockIfDuplicateSignal(params: {
  chartSlot: string;
  signalId?: string;
  symbol: string;
  timeframe?: string;
  strategy: string;
  side: string;
  signalBarTime?: number;
}): boolean {
  if (!params.signalId) return false;
  if (!executedSignalIds.has(signalKey(params.chartSlot, params.signalId))) return false;

  logDuplicateSignalBlocked({
    slot: params.chartSlot,
    symbol: params.symbol,
    timeframe: params.timeframe ?? "—",
    strategy: params.strategy,
    side: params.side,
    barTime: params.signalBarTime ?? 0,
    signalId: params.signalId,
  });
  return true;
}

function isAlpacaMode(mode: TradeMode): mode is "paper" | "live" {
  return mode === "paper" || mode === "live";
}

async function reconcileMode(mode: TradeMode) {
  if (isAlpacaMode(mode)) {
    await syncAlpacaPositions(mode);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    symbol,
    side,
    price,
    strategy,
    mode,
    riskSettings,
    alertSettings,
    signalId,
    chartSlot = "main",
    timeframe,
    signalReason,
    signalBarTime,
  } = body as {
    symbol: string;
    side: "buy" | "sell";
    price: number;
    strategy: string;
    mode: TradeMode;
    riskSettings: RiskSettings;
    alertSettings: AlertSettings;
    signalId?: string;
    chartSlot?: string;
    timeframe?: string;
    signalReason?: string;
    signalBarTime?: number;
  };

  const scheduleCheck = evaluateTradingSchedule(loadTradingScheduleSettings());
  if (!scheduleCheck.allowed) {
    return NextResponse.json({
      skipped: true,
      reason: scheduleCheck.reason ?? "Outside allowed trading hours",
    });
  }

  await reconcileMode(mode);

  const engine = getEngine(chartSlot, riskSettings);
  const openBuy = await findOpenTrade(symbol, mode, chartSlot, "buy");
  const profile = loadUserProfile();
  const contact = getUserContact();
  const effectiveAlertSettings: AlertSettings = {
    ...alertSettings,
    ...profile.alertSettings,
  };

  if (side === "sell") {
    if (!openBuy) {
      return NextResponse.json({ skipped: true, reason: "No open position to sell" });
    }
    if (
      blockIfDuplicateSignal({
        chartSlot,
        signalId,
        symbol,
        timeframe,
        strategy,
        side,
        signalBarTime,
      })
    ) {
      return NextResponse.json({ skipped: true, reason: "Signal already traded" });
    }

    if (mode === "live") {
      try {
        await cancelLiveStopOrdersForSymbol(symbol);
        await placeOrder({ symbol, qty: openBuy.quantity, side: "sell", paper: false });
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
      }
    } else if (mode === "paper") {
      try {
        await placeOrder({ symbol, qty: openBuy.quantity, side: "sell", paper: true });
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
      }
    }

    const pnl = (price - openBuy.entryPrice) * openBuy.quantity;
    const closed: Trade = {
      ...openBuy,
      exitPrice: price,
      exitTime: Date.now(),
      pnl,
      pnlPercent: (pnl / (openBuy.entryPrice * openBuy.quantity)) * 100,
      status: "closed",
    };
    await upsertTrade(closed);
    engine.recordTradeResult(pnl);
    if (signalId) executedSignalIds.add(signalKey(chartSlot, signalId));

    await sendAlert(
      "default",
      side,
      `${side.toUpperCase()} ${openBuy.quantity} ${symbol} @ $${price.toFixed(2)} (${strategy})`,
      effectiveAlertSettings,
      contact,
      {
        symbol,
        quantity: openBuy.quantity,
        entryPrice: price,
        strategy,
        timeframe: timeframe ?? openBuy.timeframe,
        mode,
        timestamp: Date.now(),
        reason: signalReason,
      } satisfies TradeAlertDetails
    );

    const allTrades = await getAllTrades();
    return NextResponse.json({
      trade: closed,
      skipped: false,
      consecutiveLosses: engine.getConsecutiveLosses(),
      safetyStopTriggered: engine.isSafetyStopActive(),
      performance: computePerformanceStats(allTrades),
    });
  }

  if (
    blockIfDuplicateSignal({
      chartSlot,
      signalId,
      symbol,
      timeframe,
      strategy,
      side,
      signalBarTime,
    })
  ) {
    return NextResponse.json({ skipped: true, reason: "Signal already traded" });
  }

  if (isAlpacaMode(mode)) {
    const existing = await findOpenTrade(symbol, mode, undefined, "buy");
    if (existing) {
      if (isAppStrategyTrade(existing)) {
        return NextResponse.json({
          skipped: true,
          reason: "Alpaca already has an open position for this symbol",
          trade: existing,
        });
      }
      await deleteSyncImportsForPosition(symbol, "buy", mode);
    }
  }

  if (openBuy) {
    return NextResponse.json({
      skipped: true,
      reason: "Open buy already exists for this chart",
      trade: openBuy,
    });
  }

  const openTrades = await getOpenTrades();
  const slotOpenCount = openTrades.filter((t) => t.chartSlot === chartSlot).length;
  const check = engine.canOpenTrade(slotOpenCount);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, safetyStopTriggered: engine.isSafetyStopActive() });
  }

  let accountEquity: number;
  try {
    const { equity } = await resolveAccountEquity(mode);
    accountEquity = equity;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load Alpaca account equity" },
      { status: 400 }
    );
  }

  const liveSettings = loadLiveTradingSettings();
  const stopLoss = computeStopLossPrice(price, liveSettings.stopLossPercent);
  const { quantity } = engine.calculatePositionSize(accountEquity, price, stopLoss);
  if (quantity <= 0) {
    return NextResponse.json({ error: "Position size too small" });
  }

  let alpacaOrderId: string | undefined;
  let alpacaStopOrderId: string | undefined;

  if (mode === "live") {
    try {
      const buyOrder = await placeOrder({ symbol, qty: quantity, side: "buy", paper: false });
      alpacaOrderId = buyOrder?.id;

      if (liveSettings.brokerStopLossEnabled) {
        try {
          const stopOrder = await placeLiveStopLossOrder({
            symbol,
            qty: quantity,
            stopPrice: stopLoss,
          });
          alpacaStopOrderId = stopOrder?.id;
        } catch (stopErr) {
          console.error("[execute] Live stop-loss placement failed:", stopErr);
          return NextResponse.json(
            {
              error: `Buy filled but stop-loss failed: ${String(stopErr)}`,
              partial: true,
              alpacaOrderId,
            },
            { status: 500 }
          );
        }
      }
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  } else if (mode === "paper") {
    try {
      const buyOrder = await placeOrder({ symbol, qty: quantity, side: "buy", paper: true });
      alpacaOrderId = buyOrder?.id;
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  await deleteSyncImportsForPosition(symbol, "buy", mode);

  const trade: Trade = {
    id: signalId
      ? `trade-${chartSlot}-${signalId}`
      : `trade-${chartSlot}-${symbol}-buy-${Date.now()}`,
    symbol,
    side: "buy",
    quantity,
    entryPrice: price,
    entryTime: Date.now(),
    mode,
    strategy,
    status: "open",
    chartSlot,
    timeframe,
    signalId,
    stopLossPrice: mode === "live" && liveSettings.brokerStopLossEnabled ? stopLoss : undefined,
    alpacaOrderId,
    alpacaStopOrderId,
  };

  saveStrategyAttribution(symbol, "buy", mode, {
    strategy,
    chartSlot,
    signalId,
    timeframe,
    entryTime: trade.entryTime,
  });

  let dbError: string | undefined;
  try {
    await upsertTrade(trade);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    console.error("[execute] Trade save failed after broker fill:", dbError);
  }

  if (signalId) executedSignalIds.add(signalKey(chartSlot, signalId));

  const stopNote =
    mode === "live" && liveSettings.brokerStopLossEnabled
      ? ` · Stop @ $${stopLoss.toFixed(2)}`
      : "";

  const alertResults = await sendAlert(
    "default",
    side,
    `${side.toUpperCase()} ${quantity} ${symbol} @ $${price.toFixed(2)} (${strategy})${stopNote}`,
    effectiveAlertSettings,
    contact,
    {
      symbol,
      quantity,
      entryPrice: price,
      strategy,
      timeframe,
      mode,
      timestamp: Date.now(),
      reason: signalReason,
      stopLossPrice:
        mode === "live" && liveSettings.brokerStopLossEnabled ? stopLoss : undefined,
    } satisfies TradeAlertDetails
  );

  if (engine.isSafetyStopActive()) {
    await sendAlert(
      "default",
      "safety_stop",
      "Safety stop triggered — auto trading paused",
      effectiveAlertSettings,
      contact
    );
  }

  if (isAlpacaMode(mode)) {
    await syncAlpacaPositions(mode);
  }

  const allTrades = await getAllTrades();
  if (dbError) {
    return NextResponse.json(
      {
        error: `Trade filled on broker but database save failed: ${dbError}`,
        trade,
        skipped: false,
        partial: true,
        alertResults,
        accountEquity,
        consecutiveLosses: engine.getConsecutiveLosses(),
        safetyStopTriggered: engine.isSafetyStopActive(),
        performance: computePerformanceStats(allTrades),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    trade,
    skipped: false,
    alertResults,
    accountEquity,
    consecutiveLosses: engine.getConsecutiveLosses(),
    safetyStopTriggered: engine.isSafetyStopActive(),
    performance: computePerformanceStats(allTrades),
  });
}
