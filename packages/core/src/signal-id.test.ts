import { describe, it } from "node:test";
import assert from "node:assert/strict";

function buildSignalId(
  strategy: string,
  symbol: string,
  timeframe: string,
  barTime: number,
  side: "buy" | "sell"
): string {
  return `${strategy}-${symbol}-${timeframe}-${barTime}-${side}`;
}

describe("buildSignalId", () => {
  it("includes strategy, symbol, timeframe, bar timestamp, and side", () => {
    assert.equal(
      buildSignalId("ema-crossover", "AAPL", "5m", 1_700_000_000, "buy"),
      "ema-crossover-AAPL-5m-1700000000-buy"
    );
  });

  it("changes when a new bar forms", () => {
    const first = buildSignalId("ema-crossover", "AAPL", "5m", 100, "buy");
    const nextBar = buildSignalId("ema-crossover", "AAPL", "5m", 200, "buy");
    assert.notEqual(first, nextBar);
  });

  it("allows different strategies on the same bar", () => {
    const ema = buildSignalId("ema-crossover", "AAPL", "5m", 100, "buy");
    const wick = buildSignalId("wick-rejection", "AAPL", "5m", 100, "buy");
    assert.notEqual(ema, wick);
  });

  it("blocks only exact duplicates", () => {
    const a = buildSignalId("ema-crossover", "AAPL", "5m", 100, "buy");
    const b = buildSignalId("ema-crossover", "AAPL", "5m", 100, "buy");
    assert.equal(a, b);
  });
});
