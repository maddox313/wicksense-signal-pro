import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Trade } from "@wicksense/core";
import {
  alpacaPositionQty,
  alpacaPositionSide,
  alpacaSyncTradeId,
  computeClosePnl,
  computeClosePnlPercent,
  positionKey,
  shouldPreserveOpenAppTrade,
} from "./position-sync-helpers.ts";

interface MockAlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  avg_entry_price: string;
}

function mockPosition(overrides: Partial<MockAlpacaPosition>): MockAlpacaPosition {
  return {
    symbol: "AAPL",
    qty: "10",
    side: "long",
    market_value: "1000",
    cost_basis: "950",
    unrealized_pl: "50",
    unrealized_plpc: "0.05",
    current_price: "100",
    avg_entry_price: "95",
    ...overrides,
  };
}

describe("alpacaPositionSide", () => {
  it("maps long positions to buy", () => {
    assert.equal(alpacaPositionSide(mockPosition({ side: "long", qty: "10" })), "buy");
  });

  it("maps short positions to sell via side field", () => {
    assert.equal(alpacaPositionSide(mockPosition({ side: "short", qty: "10" })), "sell");
  });

  it("maps negative qty to sell", () => {
    assert.equal(alpacaPositionSide(mockPosition({ side: "long", qty: "-5" })), "sell");
  });
});

describe("alpacaPositionQty", () => {
  it("returns absolute quantity for shorts", () => {
    assert.equal(alpacaPositionQty(mockPosition({ qty: "-7" })), 7);
  });
});

describe("positionKey", () => {
  it("separates long and short on the same symbol", () => {
    assert.notEqual(positionKey("AAPL", "buy"), positionKey("AAPL", "sell"));
  });
});

describe("alpacaSyncTradeId", () => {
  it("includes side so long and short do not collide", () => {
    assert.notEqual(
      alpacaSyncTradeId("paper", "AAPL", "buy"),
      alpacaSyncTradeId("paper", "AAPL", "sell")
    );
  });
});

describe("computeClosePnl", () => {
  const longTrade: Trade = {
    id: "1",
    symbol: "AAPL",
    side: "buy",
    quantity: 10,
    entryPrice: 100,
    entryTime: Date.now(),
    mode: "paper",
    strategy: "test",
    status: "open",
  };

  const shortTrade: Trade = {
    ...longTrade,
    id: "2",
    side: "sell",
    entryPrice: 100,
  };

  it("computes long profit", () => {
    assert.equal(computeClosePnl(longTrade, 110), 100);
  });

  it("computes short profit", () => {
    assert.equal(computeClosePnl(shortTrade, 90), 100);
  });

  it("computes short loss", () => {
    assert.equal(computeClosePnl(shortTrade, 110), -100);
  });
});

describe("computeClosePnlPercent", () => {
  it("uses entry notional as basis", () => {
    const trade: Trade = {
      id: "1",
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      entryPrice: 100,
      entryTime: Date.now(),
      mode: "paper",
      strategy: "test",
      status: "open",
    };
    assert.equal(computeClosePnlPercent(trade, 100), 10);
  });
});

describe("shouldPreserveOpenAppTrade", () => {
  it("preserves recent app trades with signalId during fill grace", () => {
    const trade: Trade = {
      id: "trade-main-ema-AAPL-5m-1-buy",
      symbol: "AAPL",
      side: "buy",
      quantity: 1,
      entryPrice: 100,
      entryTime: Date.now() - 60_000,
      mode: "paper",
      strategy: "ema-crossover",
      status: "open",
      chartSlot: "main",
      signalId: "ema-crossover-AAPL-5m-1-buy",
    };
    assert.equal(shouldPreserveOpenAppTrade(trade), true);
  });

  it("does not preserve stale app trades without alpaca position", () => {
    const trade: Trade = {
      id: "trade-main-ema-AAPL-5m-1-buy",
      symbol: "AAPL",
      side: "buy",
      quantity: 1,
      entryPrice: 100,
      entryTime: Date.now() - 10 * 60_000,
      mode: "paper",
      strategy: "ema-crossover",
      status: "open",
      chartSlot: "main",
      signalId: "ema-crossover-AAPL-5m-1-buy",
    };
    assert.equal(shouldPreserveOpenAppTrade(trade), false);
  });
});
