import { NextRequest, NextResponse } from "next/server";
import { RiskEngine, computePerformanceStats } from "@wicksense/core";
import type { RiskSettings, AlertSettings, Trade, TradeMode } from "@wicksense/core";
import { placeOrder } from "@/lib/alpaca";
import { sendAlert } from "@/lib/alerts";
import { getUserContact } from "@/lib/user-config";

const riskEngines = new Map<string, RiskEngine>();
const allTrades: Trade[] = [];
const executedSignalIds = new Set<string>();

function getEngine(chartSlot: string, settings: RiskSettings) {
  if (!riskEngines.has(chartSlot)) {
    riskEngines.set(chartSlot, new RiskEngine(settings));
  } else {
    riskEngines.get(chartSlot)!.updateSettings(settings);
  }
  return riskEngines.get(chartSlot)!;
}

function signalKey(chartSlot: string, signalId: string) {
  return `${chartSlot}:${signalId}`;
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
  };

  const engine = getEngine(chartSlot, riskSettings);
  const openTrades = allTrades.filter((t) => t.status === "open");
  const openBuy = openTrades.find(
    (t) => t.symbol === symbol && t.chartSlot === chartSlot && t.side === "buy"
  );

  const contact = getUserContact();

  if (side === "sell") {
    if (!openBuy) {
      return NextResponse.json({ skipped: true, reason: "No open position to sell" });
    }
    if (signalId && executedSignalIds.has(signalKey(chartSlot, signalId))) {
      return NextResponse.json({ skipped: true, reason: "Signal already traded" });
    }

    if (mode === "live") {
      try {
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
    openBuy.exitPrice = price;
    openBuy.exitTime = Date.now();
    openBuy.pnl = pnl;
    openBuy.pnlPercent = (pnl / (openBuy.entryPrice * openBuy.quantity)) * 100;
    openBuy.status = "closed";
    engine.recordTradeResult(pnl);
    if (signalId) executedSignalIds.add(signalKey(chartSlot, signalId));

    await sendAlert(
      "default",
      side,
      `${side.toUpperCase()} ${openBuy.quantity} ${symbol} @ $${price.toFixed(2)} (${strategy})`,
      alertSettings,
      contact
    );

    return NextResponse.json({
      trade: openBuy,
      skipped: false,
      consecutiveLosses: engine.getConsecutiveLosses(),
      safetyStopTriggered: engine.isSafetyStopActive(),
      performance: computePerformanceStats(allTrades),
    });
  }

  if (signalId && executedSignalIds.has(signalKey(chartSlot, signalId))) {
    return NextResponse.json({ skipped: true, reason: "Signal already traded" });
  }

  if (openBuy) {
    return NextResponse.json({
      skipped: true,
      reason: "Open buy already exists for this chart",
      trade: openBuy,
    });
  }

  const slotOpenCount = openTrades.filter((t) => t.chartSlot === chartSlot).length;
  const check = engine.canOpenTrade(slotOpenCount);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, safetyStopTriggered: engine.isSafetyStopActive() });
  }

  const stopLoss = price * 0.98;
  const { quantity } = engine.calculatePositionSize(100_000, price, stopLoss);
  if (quantity <= 0) {
    return NextResponse.json({ error: "Position size too small" });
  }

  if (mode === "live") {
    try {
      await placeOrder({ symbol, qty: quantity, side: "buy", paper: false });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  } else if (mode === "paper") {
    try {
      await placeOrder({ symbol, qty: quantity, side: "buy", paper: true });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

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
  };
  allTrades.unshift(trade);

  if (signalId) executedSignalIds.add(signalKey(chartSlot, signalId));

  await sendAlert(
    "default",
    side,
    `${side.toUpperCase()} ${quantity} ${symbol} @ $${price.toFixed(2)} (${strategy})`,
    alertSettings,
    contact
  );

  if (engine.isSafetyStopActive()) {
    await sendAlert("default", "safety_stop", "Safety stop triggered — auto trading paused", alertSettings, contact);
  }

  return NextResponse.json({
    trade,
    skipped: false,
    consecutiveLosses: engine.getConsecutiveLosses(),
    safetyStopTriggered: engine.isSafetyStopActive(),
    performance: computePerformanceStats(allTrades),
  });
}
