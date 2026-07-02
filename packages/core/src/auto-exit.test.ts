import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateAutoExit, resolveVerifiedCloseReason } from "./auto-exit.ts";

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

describe("resolveVerifiedCloseReason", () => {
  const stopLoss = 98;
  const takeProfit = 104;

  it("returns TAKE_PROFIT only when fill price reaches TP", () => {
    assert.equal(
      resolveVerifiedCloseReason({
        side: "buy",
        exitPrice: 104,
        stopLoss,
        takeProfit,
        trigger: "AUTO_MONITOR",
      }),
      "TAKE_PROFIT"
    );
    assert.equal(
      resolveVerifiedCloseReason({
        side: "buy",
        exitPrice: 103,
        stopLoss,
        takeProfit,
        trigger: "AUTO_MONITOR",
      }),
      "MARKET_EXIT"
    );
  });

  it("never labels TP when quote hint was TP but fill missed", () => {
    const verified = resolveVerifiedCloseReason({
      side: "buy",
      exitPrice: 391.69,
      stopLoss: 387.96,
      takeProfit: 397.76,
      trigger: "AUTO_MONITOR",
    });
    assert.equal(verified, "MARKET_EXIT");
    assert.notEqual(verified, "TAKE_PROFIT");
  });

  it("returns SIGNAL_SELL when fill is between levels", () => {
    assert.equal(
      resolveVerifiedCloseReason({
        side: "buy",
        exitPrice: 307.6,
        stopLoss: 304.39,
        takeProfit: 312.07,
        trigger: "SIGNAL_SELL",
      }),
      "SIGNAL_SELL"
    );
  });

  it("returns TIME_EXIT for session flatten when levels not hit", () => {
    assert.equal(
      resolveVerifiedCloseReason({
        side: "buy",
        exitPrice: 527.75,
        stopLoss: 517.05,
        takeProfit: 530.11,
        trigger: "TIME_EXIT",
      }),
      "TIME_EXIT"
    );
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
