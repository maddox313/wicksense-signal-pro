import { NextRequest, NextResponse } from "next/server";
import {
  computePerformanceStats,
  computeTakeProfitPrice,
  isAccountSyncTrade,
  isAppStrategyTrade,
} from "@wicksense/core";
import type { RiskSettings, AlertSettings, Trade, TradeMode } from "@wicksense/core";
import {
  placeOrderWithFill,
  resolveAccountEquity,
  placeLiveStopLossOrder,
  cancelOpenExitOrdersForSymbol,
  CLOSE_ORDER_FILL_OPTIONS,
  ENTRY_ORDER_FILL_OPTIONS,
  getPaperOpenOrders,
  getLiveOpenOrders,
} from "@/lib/alpaca";
import { sendAlert, type TradeAlertDetails } from "@/lib/alerts";
import { logDuplicateSignalBlocked } from "@/lib/signal-dedupe-log";
import { getUserContact, loadUserProfile } from "@/lib/user-config";
import { saveStrategyAttribution } from "@/lib/strategy-attribution";
import {
  loadLiveTradingSettings,
  computeStopLossPrice,
} from "@/lib/live-trading-config";
import { resolveExitPercentsForChartSlot } from "@/lib/trade-exit-settings";
import { getRiskEngine } from "@/lib/risk-engine-registry";
import { persistSlotSafetyStopState } from "@/lib/safety-stop-sync";
import {
  computeClosePnl,
  computeClosePnlPercent,
} from "@/lib/position-sync-helpers";
import {
  getAllTrades,
  getOpenTrades,
  findOpenTrade,
  findTradeBySignalId,
  upsertTrade,
  deleteSyncImportsForPosition,
} from "@/lib/trade-store";
import { syncAlpacaPositions } from "@/lib/position-sync";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import { shouldSendExtendedHoursOrders, isRegularUsEquitySession } from "@wicksense/core";
import { getTradingScheduleStatus } from "@/lib/trading-schedule-guard";
import { isLegacyPaperBlockSymbol } from "@/lib/legacy-paper-cleanup";

function getEngine(chartSlot: string, settings: RiskSettings) {
  return getRiskEngine(chartSlot, settings);
}

async function blockIfDuplicateSignal(params: {
  chartSlot: string;
  signalId?: string;
  symbol: string;
  timeframe?: string;
  strategy: string;
  side: string;
  signalBarTime?: number;
}): Promise<boolean> {
  if (!params.signalId) return false;
  const existing = await findTradeBySignalId(params.chartSlot, params.signalId);
  if (!existing) return false;

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

async function hasPendingBuyOrder(symbol: string, paper: boolean): Promise<boolean> {
  const orders = paper ? await getPaperOpenOrders() : await getLiveOpenOrders();
  return orders.some((order) => order.symbol === symbol && order.side === "buy");
}

function isRetryableFillFailure(message: string): boolean {
  return /market may be closed|still (accepted|new|pending)|not filled after/i.test(message);
}

function scheduleAllowsExtendedHours(): boolean {
  return shouldSendExtendedHoursOrders(loadTradingScheduleSettings());
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

  const scheduleCheck = getTradingScheduleStatus();
  if (!scheduleCheck.allowed) {
    console.warn(`[execute] Blocked ${side} ${symbol}: ${scheduleCheck.reason ?? "Outside allowed trading hours"}`);
    return NextResponse.json({
      skipped: true,
      reason: scheduleCheck.reason ?? "Outside allowed trading hours",
    });
  }

  if (side === "buy" && !isRegularUsEquitySession()) {
    return NextResponse.json({
      skipped: true,
      reason: "New entries only during regular market hours (9:30 AM – 4:00 PM ET)",
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
      await blockIfDuplicateSignal({
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

    let exitPrice = price;
    let closedQty = openBuy.quantity;

    if (mode === "live") {
      try {
        await cancelOpenExitOrdersForSymbol(symbol, "sell", false);
        const fill = await placeOrderWithFill({
          symbol,
          qty: openBuy.quantity,
          side: "sell",
          paper: false,
          extended_hours: scheduleAllowsExtendedHours(),
          fillOptions: CLOSE_ORDER_FILL_OPTIONS,
        });
        exitPrice = fill.filledAvgPrice;
        closedQty = fill.filledQty;
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
      }
    } else if (mode === "paper") {
      try {
        await cancelOpenExitOrdersForSymbol(symbol, "sell", true);
        const fill = await placeOrderWithFill({
          symbol,
          qty: openBuy.quantity,
          side: "sell",
          paper: true,
          extended_hours: scheduleAllowsExtendedHours(),
          fillOptions: CLOSE_ORDER_FILL_OPTIONS,
        });
        exitPrice = fill.filledAvgPrice;
        closedQty = fill.filledQty;
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
      }
    }

    const closedBasis = { ...openBuy, quantity: closedQty };
    const pnl = computeClosePnl(closedBasis, exitPrice);
    const closed: Trade = {
      ...openBuy,
      quantity: closedQty,
      exitPrice,
      exitTime: Date.now(),
      pnl,
      pnlPercent: computeClosePnlPercent(closedBasis, pnl),
      status: "closed",
    };
    await upsertTrade(closed);
    engine.recordTradeResult(pnl);
    persistSlotSafetyStopState(chartSlot, riskSettings);

    await sendAlert(
      "default",
      side,
      `${side.toUpperCase()} ${closedQty} ${symbol} @ $${exitPrice.toFixed(2)} (${strategy})`,
      effectiveAlertSettings,
      contact,
      {
        symbol,
        quantity: closedQty,
        entryPrice: exitPrice,
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
    await blockIfDuplicateSignal({
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

  if (mode === "paper" && isLegacyPaperBlockSymbol(symbol)) {
    return NextResponse.json({
      skipped: true,
      reason: `Legacy paper position still open at Alpaca for ${symbol} — close at broker first`,
    });
  }

  if (isAlpacaMode(mode) && (await hasPendingBuyOrder(symbol, mode === "paper"))) {
    return NextResponse.json({
      skipped: true,
      reason: `Buy order already pending for ${symbol} at Alpaca`,
    });
  }

  const openTrades = await getOpenTrades();
  const slotOpenCount = openTrades.filter(
    (t) => t.chartSlot === chartSlot && !isAccountSyncTrade(t)
  ).length;
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
  const exitPercents = resolveExitPercentsForChartSlot(chartSlot);
  let stopLoss = computeStopLossPrice(price, exitPercents.stopLossPercent);
  const { quantity } = engine.calculatePositionSize(accountEquity, price, stopLoss);
  if (quantity <= 0) {
    return NextResponse.json({ error: "Position size too small" });
  }

  let alpacaOrderId: string | undefined;
  let alpacaStopOrderId: string | undefined;
  let entryPrice = price;
  let filledQty = quantity;
  const allowExtendedHours = scheduleAllowsExtendedHours();

  if (mode === "live") {
    try {
      const fill = await placeOrderWithFill({
        symbol,
        qty: quantity,
        side: "buy",
        paper: false,
        extended_hours: allowExtendedHours,
        fillOptions: ENTRY_ORDER_FILL_OPTIONS,
      });
      alpacaOrderId = fill.orderId;
      entryPrice = fill.filledAvgPrice;
      filledQty = fill.filledQty;

      if (liveSettings.brokerStopLossEnabled) {
        stopLoss = computeStopLossPrice(entryPrice, exitPercents.stopLossPercent);
        try {
          const stopOrder = await placeLiveStopLossOrder({
            symbol,
            qty: filledQty,
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
      const message = err instanceof Error ? err.message : String(err);
      if (isRetryableFillFailure(message)) {
        return NextResponse.json({
          skipped: true,
          reason: `Order not filled — ${message}`,
        });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else if (mode === "paper") {
    try {
      const fill = await placeOrderWithFill({
        symbol,
        qty: quantity,
        side: "buy",
        paper: true,
        extended_hours: allowExtendedHours,
        fillOptions: ENTRY_ORDER_FILL_OPTIONS,
      });
      alpacaOrderId = fill.orderId;
      entryPrice = fill.filledAvgPrice;
      filledQty = fill.filledQty;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRetryableFillFailure(message)) {
        return NextResponse.json({
          skipped: true,
          reason: `Order not filled — ${message}`,
        });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  await deleteSyncImportsForPosition(symbol, "buy", mode);

  const takeProfit = computeTakeProfitPrice(
    entryPrice,
    "buy",
    exitPercents.takeProfitPercent
  );
  stopLoss = computeStopLossPrice(entryPrice, exitPercents.stopLossPercent);

  const trade: Trade = {
    id: signalId
      ? `trade-${chartSlot}-${signalId}`
      : `trade-${chartSlot}-${symbol}-buy-${Date.now()}`,
    symbol,
    side: "buy",
    quantity: filledQty,
    entryPrice,
    entryTime: Date.now(),
    mode,
    strategy,
    status: "open",
    chartSlot,
    timeframe,
    signalId,
    stopLossPrice: isAlpacaMode(mode) ? stopLoss : undefined,
    takeProfitPrice: isAlpacaMode(mode) ? takeProfit : undefined,
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

  const stopNote =
    mode === "live" && liveSettings.brokerStopLossEnabled
      ? ` · Stop @ $${stopLoss.toFixed(2)}`
      : "";

  const alertResults = await sendAlert(
    "default",
    side,
    `${side.toUpperCase()} ${filledQty} ${symbol} @ $${entryPrice.toFixed(2)} (${strategy})${stopNote}`,
    effectiveAlertSettings,
    contact,
    {
      symbol,
      quantity: filledQty,
      entryPrice,
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
