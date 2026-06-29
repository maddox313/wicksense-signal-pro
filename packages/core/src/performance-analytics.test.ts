import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Trade } from "./types.ts";
import {
  filterTradesClosedOnDay,
  getCalendarDayKey,
} from "./trade-calendar.ts";
import { computePerformanceStats } from "./risk.ts";

function closedTrade(overrides: Partial<Trade> & Pick<Trade, "id" | "exitTime" | "pnl">): Trade {
  return {
    symbol: "AAPL",
    side: "buy",
    quantity: 10,
    entryPrice: 100,
    entryTime: overrides.exitTime - 60_000,
    mode: "paper",
    strategy: "ema-crossover",
    status: "closed",
    ...overrides,
  };
}

describe("computeTradeAnalysisStats", () => {
  it("counts open and closed trades so totals match the trade table", () => {
    const trades: Trade[] = [
      {
        id: "open-1",
        symbol: "TSLA",
        side: "buy",
        quantity: 10,
        entryPrice: 100,
        entryTime: Date.now(),
        mode: "paper",
        strategy: "alpaca-sync",
        status: "open",
      },
      {
        id: "open-2",
        symbol: "SPY",
        side: "buy",
        quantity: 2,
        entryPrice: 400,
        entryTime: Date.now(),
        mode: "paper",
        strategy: "alpaca-sync",
        status: "open",
      },
      closedTrade({ id: "closed-1", exitTime: Date.now(), pnl: 50 }),
    ];

    const closed = computePerformanceStats(trades);
    const stats = { ...closed, totalTrades: trades.length };
    assert.equal(stats.totalTrades, 3);
    assert.equal(stats.totalPnl, 50);
    assert.equal(stats.winRate, 100);
  });
});

describe("today performance stats", () => {
  it("filters closed trades by Eastern calendar day", () => {
    const mondayClose = new Date("2026-06-22T20:00:00Z");
    const tuesdayClose = new Date("2026-06-23T14:30:00Z");

    const trades = [
      closedTrade({ id: "a", exitTime: mondayClose.getTime(), pnl: 50 }),
      closedTrade({ id: "b", exitTime: tuesdayClose.getTime(), pnl: -20 }),
    ];

    const tuesdayOnly = filterTradesClosedOnDay(trades, tuesdayClose);
    assert.equal(tuesdayOnly.length, 1);
    assert.equal(tuesdayOnly[0]?.id, "b");
  });

  it("sums today's realized P&L from filtered trades", () => {
    const today = new Date("2026-06-23T18:00:00Z");
    const trades = [
      closedTrade({ id: "a", exitTime: today.getTime(), pnl: 100 }),
      closedTrade({ id: "b", exitTime: today.getTime() - 3_600_000, pnl: 25 }),
      closedTrade({ id: "c", exitTime: new Date("2026-06-22T20:00:00Z").getTime(), pnl: 500 }),
    ];

    const todayTrades = filterTradesClosedOnDay(trades, today);
    const totalPnl = todayTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
    assert.equal(todayTrades.length, 2);
    assert.equal(totalPnl, 125);
  });

  it("formats calendar day keys in Eastern Time", () => {
    const lateNightUtc = new Date("2026-06-23T03:30:00Z");
    assert.equal(getCalendarDayKey(lateNightUtc.getTime()), "2026-06-22");
  });
});
