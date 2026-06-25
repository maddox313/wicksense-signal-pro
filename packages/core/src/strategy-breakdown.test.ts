import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeAccountSyncActivity,
  computeStrategyBreakdown,
  computeStrategyExtendedBreakdown,
  buildOpenTradesByStrategy,
  isAccountSyncTrade,
} from "./strategy-breakdown.ts";
import type { Trade } from "./types.ts";

function closedTrade(
  overrides: Partial<Trade> & Pick<Trade, "id" | "strategy" | "symbol" | "pnl">
): Trade {
  return {
    side: "buy",
    quantity: 10,
    entryPrice: 100,
    exitPrice: 100 + (overrides.pnl ?? 0) / 10,
    entryTime: 1,
    exitTime: 2,
    mode: "paper",
    status: "closed",
    ...overrides,
  };
}

describe("isAccountSyncTrade", () => {
  it("detects alpaca sync and closed sync records", () => {
    assert.equal(
      isAccountSyncTrade(
        closedTrade({
          id: "alpaca-sync-paper-AAPL-buy",
          strategy: "closed:alpaca-flat",
          symbol: "AAPL",
          pnl: -10,
          chartSlot: "alpaca-sync",
        })
      ),
      true
    );
    assert.equal(
      isAccountSyncTrade(closedTrade({ id: "1", strategy: "ema-crossover", symbol: "AAPL", pnl: 5 })),
      false
    );
  });
});

describe("computeStrategyBreakdown", () => {
  it("groups closed trades by strategy and sorts worst net P&L first", () => {
    const rows = computeStrategyBreakdown([
      closedTrade({ id: "1", strategy: "ema-crossover", symbol: "AAPL", pnl: 50, timeframe: "5m" }),
      closedTrade({ id: "2", strategy: "ema-crossover", symbol: "MSFT", pnl: -20, timeframe: "5m" }),
      closedTrade({ id: "3", strategy: "rsi-reversal", symbol: "NVDA", pnl: -80, timeframe: "15m" }),
      closedTrade({ id: "4", strategy: "wick-rejection", symbol: "AAPL", pnl: 10 }),
    ]);

    assert.deepEqual(
      rows.map((row) => row.strategy),
      ["rsi-reversal", "wick-rejection", "ema-crossover"]
    );
  });

  it("excludes alpaca sync reconciliation trades", () => {
    const rows = computeStrategyBreakdown([
      closedTrade({ id: "1", strategy: "ema-crossover", symbol: "AAPL", pnl: 25 }),
      closedTrade({
        id: "alpaca-sync-paper-GOOGL-buy",
        strategy: "closed:alpaca-flat",
        symbol: "GOOGL",
        pnl: -100,
        chartSlot: "alpaca-sync",
      }),
      closedTrade({
        id: "alpaca-sync-paper-TSLA-buy",
        strategy: "alpaca-sync",
        symbol: "TSLA",
        pnl: -50,
        chartSlot: "alpaca-sync",
      }),
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].strategy, "ema-crossover");
    assert.equal(rows[0].netPnl, 25);
  });

  it("ignores open trades", () => {
    const rows = computeStrategyBreakdown([
      {
        id: "open",
        symbol: "AAPL",
        side: "buy",
        quantity: 1,
        entryPrice: 100,
        entryTime: 1,
        mode: "paper",
        strategy: "ema-crossover",
        status: "open",
      },
    ]);
    assert.deepEqual(rows, []);
  });
});

describe("computeAccountSyncActivity", () => {
  it("collects sync records separately from strategy stats", () => {
    const activity = computeAccountSyncActivity([
      closedTrade({ id: "1", strategy: "ema-crossover", symbol: "AAPL", pnl: 25 }),
      closedTrade({
        id: "alpaca-sync-paper-GOOGL-buy",
        strategy: "closed:alpaca-flat",
        symbol: "GOOGL",
        pnl: -40,
        chartSlot: "alpaca-sync",
      }),
      {
        id: "alpaca-sync-live-NVDA-buy",
        symbol: "NVDA",
        side: "buy",
        quantity: 5,
        entryPrice: 120,
        entryTime: 3,
        mode: "live",
        strategy: "alpaca-sync",
        status: "open",
        chartSlot: "alpaca-sync",
      },
    ]);

    assert.equal(activity.summary.totalRecords, 2);
    assert.equal(activity.summary.openRecords, 1);
    assert.equal(activity.summary.closedRecords, 1);
    assert.equal(activity.summary.netPnl, -40);
    assert.deepEqual(activity.summary.markets, ["GOOGL", "NVDA"]);
    assert.equal(activity.records.length, 2);
  });
});

describe("computeStrategyExtendedBreakdown", () => {
  it("includes open trades and signal funnel metrics per strategy", () => {
    const rows = computeStrategyExtendedBreakdown(
      [
        closedTrade({
          id: "trade-main-ema-crossover-AAPL-5m-100-buy",
          strategy: "ema-crossover",
          symbol: "AAPL",
          pnl: 20,
          chartSlot: "main",
        }),
        {
          id: "trade-main-rsi-reversal-MSFT-5m-200-buy",
          symbol: "MSFT",
          side: "buy",
          quantity: 2,
          entryPrice: 300,
          entryTime: 1,
          mode: "paper",
          strategy: "rsi-reversal",
          status: "open",
          chartSlot: "main",
        },
      ],
      [
        {
          signalId: "ema-crossover-AAPL-5m-100-buy",
          strategy: "ema-crossover",
          symbol: "AAPL",
          side: "buy",
          time: 100,
          kind: "generated",
        },
        {
          signalId: "ema-crossover-AAPL-5m-100-buy",
          strategy: "ema-crossover",
          symbol: "AAPL",
          side: "buy",
          time: 100,
          kind: "converted",
        },
        {
          signalId: "rsi-reversal-MSFT-5m-200-buy",
          strategy: "rsi-reversal",
          symbol: "MSFT",
          side: "buy",
          time: 200,
          kind: "generated",
        },
        {
          signalId: "rsi-reversal-MSFT-5m-200-buy",
          strategy: "rsi-reversal",
          symbol: "MSFT",
          side: "buy",
          time: 200,
          kind: "rejected",
          reason: "Auto trade disabled",
        },
      ],
      ["ema-crossover", "rsi-reversal"]
    );

    const ema = rows.find((row) => row.strategy === "ema-crossover");
    const rsi = rows.find((row) => row.strategy === "rsi-reversal");

    assert.equal(ema?.openTrades, 0);
    assert.equal(ema?.closedTrades, 1);
    assert.equal(ema?.signalsGenerated, 1);
    assert.equal(ema?.signalsConverted, 1);
    assert.equal(ema?.signalsRejected, 0);
    assert.equal(ema?.totalGeneratedSinceStartup, 1);
    assert.equal(ema?.engineActive, false);

    assert.equal(rsi?.openTrades, 1);
    assert.equal(rsi?.closedTrades, 0);
    assert.equal(rsi?.signalsGenerated, 1);
    assert.equal(rsi?.signalsRejected, 1);
    assert.equal(rsi?.signalsConverted, 1);
  });

  it("counts open sync positions using converted signal activity", () => {
    const openByStrategy = buildOpenTradesByStrategy(
      [
        {
          id: "alpaca-sync-paper-AAPL-buy",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          entryPrice: 100,
          entryTime: 1,
          mode: "paper",
          strategy: "alpaca-sync",
          status: "open",
          chartSlot: "alpaca-sync",
        },
      ],
      [
        {
          signalId: "wick-rejection-AAPL-5m-100-buy",
          strategy: "wick-rejection",
          symbol: "AAPL",
          side: "buy",
          time: 100,
          kind: "converted",
        },
      ]
    );

    assert.equal(openByStrategy.get("wick-rejection"), 1);
  });
});
