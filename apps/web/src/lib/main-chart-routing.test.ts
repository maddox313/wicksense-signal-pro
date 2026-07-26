import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Signal, Trade, TradingScheduleSettings } from "@wicksense/core";
import { DEFAULT_TRADING_SCHEDULE } from "@wicksense/core";
import {
  applyManualSymbolOverride,
  applyReturnToAuto,
  decideMainChartRouting,
} from "./main-chart-routing-logic.ts";
import { defaultMainChartRoutingState } from "./main-chart-routing-types.ts";
import { evaluateSlotEntryGates } from "./slot-entry-gates.ts";
import { findBestExecutableOpportunity } from "./main-chart-executable.ts";
import type { SlotTradeConfig } from "./autoTradeRunner.ts";

const NOW = "2026-07-22T16:00:00.000Z";

function openTrade(overrides: Partial<Trade> & Pick<Trade, "id" | "symbol" | "chartSlot">): Trade {
  return {
    side: "buy",
    status: "open",
    mode: "paper",
    entryPrice: 100,
    quantity: 1,
    strategy: "vwap-bounce",
    entryTime: Date.now(),
    timeframe: "15m",
    ...overrides,
  } as Trade;
}

function buySignal(symbol: string, confidence = 0.9, id = `sig-${symbol}`): Signal {
  return {
    id,
    symbol,
    strategy: "vwap-bounce",
    side: "buy",
    price: 100,
    confidence,
    time: 1_700_000_000,
    reason: "test",
  } as Signal;
}

function bars(n = 40) {
  return Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 900,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1_000_000,
  }));
}

const openSchedule: TradingScheduleSettings = {
  ...DEFAULT_TRADING_SCHEDULE,
  unrestricted: true,
};

const mainConfig: SlotTradeConfig = {
  slotId: "main",
  symbol: "AAPL",
  timeframe: "15m",
  tradingStyle: "day",
  mode: "paper",
  autoTradeEnabled: true,
  safetyStopActive: false,
};

describe("Main Chart routing — AUTO best executable", () => {
  it("assigns best executable opportunity (not highest confidence alone)", () => {
    const decision = decideMainChartRouting({
      current: defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
      stateMissingOrCorrupt: false,
      openTrades: [],
      bestExecutable: {
        signalId: "sig-MSFT",
        strategy: "vwap-bounce",
        confidence: 0.72,
        symbol: "MSFT",
      },
      nowIso: NOW,
    });
    assert.equal(decision.state.mainSymbol, "MSFT");
    assert.equal(decision.state.lastAssignment?.reason, "AUTO_BEST_EXECUTABLE");
    assert.equal(decision.state.lastAssignment?.executable, true);
  });
});

describe("Main Chart routing — ACTIVE TRADE pin", () => {
  it("pins only unresolved main-slot trades", () => {
    const decision = decideMainChartRouting({
      current: defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
      stateMissingOrCorrupt: false,
      openTrades: [
        openTrade({ id: "t-multi", symbol: "DIA", chartSlot: "multi-1" }),
        openTrade({ id: "t-main", symbol: "NVDA", chartSlot: "main" }),
      ],
      bestExecutable: {
        signalId: "x",
        strategy: "vwap-bounce",
        confidence: 0.99,
        symbol: "TSLA",
      },
      nowIso: NOW,
    });
    assert.equal(decision.state.mainSymbol, "NVDA");
    assert.equal(decision.state.activeTradePin?.tradeId, "t-main");
    assert.equal(decision.state.lastAssignment?.reason, "ACTIVE_TRADE_PIN");
  });

  it("does not pin Main Chart for open trades on other slots", () => {
    const decision = decideMainChartRouting({
      current: defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
      stateMissingOrCorrupt: false,
      openTrades: [openTrade({ id: "t-multi", symbol: "DIA", chartSlot: "multi-1" })],
      bestExecutable: {
        signalId: "sig-MSFT",
        strategy: "vwap-bounce",
        confidence: 0.8,
        symbol: "MSFT",
      },
      nowIso: NOW,
    });
    assert.equal(decision.state.mainSymbol, "MSFT");
    assert.equal(decision.state.activeTradePin, null);
  });
});

describe("Main Chart routing — MANUAL", () => {
  it("never overwrites manual symbol when not executable", () => {
    const current = applyManualSymbolOverride(
      defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
      "IBM",
      NOW
    );
    const decision = decideMainChartRouting({
      current,
      stateMissingOrCorrupt: false,
      openTrades: [],
      bestExecutable: null,
      nowIso: NOW,
    });
    assert.equal(decision.state.mode, "MANUAL");
    assert.equal(decision.state.mainSymbol, "IBM");
    assert.equal(decision.blockedReason, "MANUAL_WAIT_NOT_EXECUTABLE");
  });

  it("keeps manual symbol when it is independently executable", () => {
    const current = applyManualSymbolOverride(
      defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
      "IBM",
      NOW
    );
    const decision = decideMainChartRouting({
      current,
      stateMissingOrCorrupt: false,
      openTrades: [],
      bestExecutable: {
        signalId: "sig-IBM",
        strategy: "vwap-bounce",
        confidence: 0.85,
        symbol: "IBM",
      },
      nowIso: NOW,
    });
    assert.equal(decision.state.mainSymbol, "IBM");
    assert.equal(decision.state.mode, "MANUAL");
    assert.equal(decision.blockedReason, undefined);
  });
});

describe("Main Chart routing — Return to AUTO", () => {
  it("clears manual override and takes best executable", () => {
    const manual = applyManualSymbolOverride(
      defaultMainChartRoutingState({ mainSymbol: "IBM" }),
      "IBM",
      NOW
    );
    const decision = applyReturnToAuto(
      manual,
      {
        signalId: "sig-QQQ",
        strategy: "ema-crossover",
        confidence: 0.77,
        symbol: "QQQ",
      },
      [],
      NOW
    );
    assert.equal(decision.state.mode, "AUTO");
    assert.equal(decision.state.mainSymbol, "QQQ");
    assert.equal(decision.state.manualOverrideSymbol, null);
  });
});

describe("Main Chart routing — missing/corrupt state", () => {
  it("restores unresolved main-slot trade", () => {
    const decision = decideMainChartRouting({
      current: defaultMainChartRoutingState({ mainSymbol: "DIA" }),
      stateMissingOrCorrupt: true,
      openTrades: [openTrade({ id: "t1", symbol: "AMD", chartSlot: "main" })],
      bestExecutable: null,
      nowIso: NOW,
    });
    assert.equal(decision.state.mainSymbol, "AMD");
    assert.equal(decision.state.lastAssignment?.reason, "RESTORE_ACTIVE_POSITION");
    assert.notEqual(decision.state.mainSymbol, "DIA");
  });

  it("initializes AUTO without permanently defaulting to DIA", () => {
    const decision = decideMainChartRouting({
      current: defaultMainChartRoutingState({ mainSymbol: "DIA" }),
      stateMissingOrCorrupt: true,
      openTrades: [],
      bestExecutable: null,
      nowIso: NOW,
    });
    assert.equal(decision.state.mode, "AUTO");
    assert.notEqual(decision.state.mainSymbol, "DIA");
    assert.equal(decision.state.mainSymbol, "AAPL");
  });
});

describe("Main Chart routing — UI unavailable", () => {
  it("routing decision does not require any UI callback", () => {
    const decision = decideMainChartRouting({
      current: defaultMainChartRoutingState(),
      stateMissingOrCorrupt: false,
      openTrades: [],
      bestExecutable: {
        signalId: "s",
        strategy: "vwap-bounce",
        confidence: 0.7,
        symbol: "SPY",
      },
      nowIso: NOW,
    });
    assert.equal(decision.state.mainSymbol, "SPY");
    // No browser / EngineConfigSync involved — pure server decision.
  });
});

describe("Shared entry gates + best executable selection", () => {
  it("skips high-confidence non-executable and picks next executable", async () => {
    const high: Signal = buySignal("DIA", 0.99, "high");
    const mid: Signal = buySignal("MSFT", 0.8, "mid");

    const picked = await findBestExecutableOpportunity({
      opportunities: [
        { symbol: "DIA", signal: high },
        { symbol: "MSFT", signal: mid },
      ],
      fetchBars: async (symbol) => ({ bars: bars(40) }),
      mainConfig,
      trades: [],
      tradingSchedule: openSchedule,
      strategyIds: ["vwap-bounce"],
      tradingStyle: "day",
      timeframe: "15m",
      filterSignalBeforeExecute: async ({ signal }) => {
        if (signal.symbol === "DIA") return { allow: false, reason: "paper filter" };
        return { allow: true };
      },
      // Bypass detectActionableSignal dependency on real strategy formulas:
      detectSignal: (_symbol, _bars, _ids, _style, _tf, fallback) => fallback,
    });

    assert.ok(picked);
    assert.equal(picked!.symbol, "MSFT");
  });

  it("candidate invalid before execution is skipped", async () => {
    const sig = buySignal("NVDA", 0.9);
    let checks = 0;
    const picked = await findBestExecutableOpportunity({
      opportunities: [{ symbol: "NVDA", signal: sig }],
      fetchBars: async () => ({ bars: bars(40) }),
      mainConfig,
      trades: [],
      tradingSchedule: openSchedule,
      strategyIds: ["vwap-bounce"],
      tradingStyle: "day",
      timeframe: "15m",
      detectSignal: (_s, _b, _i, _st, _tf, fallback) => fallback,
      revalidate: async () => {
        checks += 1;
        return false;
      },
    });
    assert.equal(picked, null);
    assert.equal(checks, 1);
  });

  it("evaluateSlotEntryGates rejects when auto-trade disabled (shared with slot cycle)", async () => {
    const gate = await evaluateSlotEntryGates({
      config: { ...mainConfig, autoTradeEnabled: false },
      signal: buySignal("AAPL"),
      bars: bars(40),
      trades: [],
      tradingSchedule: openSchedule,
    });
    assert.equal(gate.executable, false);
    if (!gate.executable) assert.match(gate.reason, /Auto trade disabled/);
  });
});
