import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateAutoExit } from "./auto-exit.ts";

describe("evaluateAutoExit — BUY (long)", () => {
  const stopLoss = 98;
  const takeProfit = 104;

  it("closes at take profit when price >= takeProfit", () => {
    assert.equal(evaluateAutoExit("buy", 104, stopLoss, takeProfit), "TAKE_PROFIT");
    assert.equal(evaluateAutoExit("buy", 105, stopLoss, takeProfit), "TAKE_PROFIT");
  });

  it("closes at stop loss when price <= stopLoss", () => {
    assert.equal(evaluateAutoExit("buy", 98, stopLoss, takeProfit), "STOP_LOSS");
    assert.equal(evaluateAutoExit("buy", 97.5, stopLoss, takeProfit), "STOP_LOSS");
  });

  it("does not close when price is between stopLoss and takeProfit", () => {
    assert.equal(evaluateAutoExit("buy", 100, stopLoss, takeProfit), null);
    assert.equal(evaluateAutoExit("buy", 103.99, stopLoss, takeProfit), null);
    assert.equal(evaluateAutoExit("buy", 98.01, stopLoss, takeProfit), null);
  });
});

describe("evaluateAutoExit — SELL (short)", () => {
  const stopLoss = 102;
  const takeProfit = 96;

  it("closes at take profit when price <= takeProfit", () => {
    assert.equal(evaluateAutoExit("sell", 96, stopLoss, takeProfit), "TAKE_PROFIT");
    assert.equal(evaluateAutoExit("sell", 95, stopLoss, takeProfit), "TAKE_PROFIT");
  });

  it("closes at stop loss when price >= stopLoss", () => {
    assert.equal(evaluateAutoExit("sell", 102, stopLoss, takeProfit), "STOP_LOSS");
    assert.equal(evaluateAutoExit("sell", 103, stopLoss, takeProfit), "STOP_LOSS");
  });

  it("does not close when price is between takeProfit and stopLoss", () => {
    assert.equal(evaluateAutoExit("sell", 99, stopLoss, takeProfit), null);
    assert.equal(evaluateAutoExit("sell", 96.01, stopLoss, takeProfit), null);
    assert.equal(evaluateAutoExit("sell", 101.99, stopLoss, takeProfit), null);
  });
});
