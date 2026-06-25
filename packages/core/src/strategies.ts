import { ema, rsi, macd, vwap, bollingerBands } from "./indicators";
import type { OHLCV, Signal, TradingStyle } from "./types";

export interface StrategyContext {
  symbol: string;
  bars: OHLCV[];
  style: TradingStyle;
  timeframe: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  style: TradingStyle | "both";
  evaluate: (ctx: StrategyContext) => Signal | null;
}

export function buildSignalId(
  strategy: string,
  symbol: string,
  timeframe: string,
  barTime: number,
  side: Signal["side"]
): string {
  return `${strategy}-${symbol}-${timeframe}-${barTime}-${side}`;
}

function makeSignal(
  ctx: StrategyContext,
  side: Signal["side"],
  strategy: string,
  confidence: number,
  reason: string
): Signal {
  const bar = ctx.bars[ctx.bars.length - 1];
  return {
    id: buildSignalId(strategy, ctx.symbol, ctx.timeframe, bar.time, side),
    symbol: ctx.symbol,
    side,
    price: bar.close,
    time: bar.time,
    strategy,
    confidence,
    reason,
  };
}

export const emaCrossoverStrategy: Strategy = {
  id: "ema-crossover",
  name: "EMA Crossover",
  description: "Buy when fast EMA crosses above slow EMA; sell on cross below.",
  style: "both",
  evaluate(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    if (closes.length < 30) return null;
    const fast = ema(closes, 9);
    const slow = ema(closes, 21);
    const i = closes.length - 1;
    const prev = i - 1;
    if (isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[prev]) || isNaN(slow[prev]))
      return null;
    if (fast[prev] <= slow[prev] && fast[i] > slow[i])
      return makeSignal(ctx, "buy", "ema-crossover", 0.72, "Fast EMA crossed above slow EMA");
    if (fast[prev] >= slow[prev] && fast[i] < slow[i])
      return makeSignal(ctx, "sell", "ema-crossover", 0.72, "Fast EMA crossed below slow EMA");
    return null;
  },
};

export const rsiReversalStrategy: Strategy = {
  id: "rsi-reversal",
  name: "RSI Reversal",
  description: "Buy oversold RSI bounce; sell overbought reversal.",
  style: "both",
  evaluate(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    if (closes.length < 20) return null;
    const values = rsi(closes);
    const i = closes.length - 1;
    const prev = i - 1;
    if (isNaN(values[i]) || isNaN(values[prev])) return null;
    if (values[prev] < 30 && values[i] >= 30)
      return makeSignal(ctx, "buy", "rsi-reversal", 0.68, `RSI bounced from oversold (${values[i].toFixed(1)})`);
    if (values[prev] > 70 && values[i] <= 70)
      return makeSignal(ctx, "sell", "rsi-reversal", 0.68, `RSI rolled from overbought (${values[i].toFixed(1)})`);
    return null;
  },
};

export const macdMomentumStrategy: Strategy = {
  id: "macd-momentum",
  name: "MACD Momentum",
  description: "Buy/sell on MACD line crossing signal line.",
  style: "swing",
  evaluate(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    if (closes.length < 35) return null;
    const { macd: macdLine, signal: signalLine } = macd(closes);
    const i = closes.length - 1;
    const prev = i - 1;
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) return null;
    if (macdLine[prev] <= signalLine[prev] && macdLine[i] > signalLine[i])
      return makeSignal(ctx, "buy", "macd-momentum", 0.7, "MACD crossed above signal line");
    if (macdLine[prev] >= signalLine[prev] && macdLine[i] < signalLine[i])
      return makeSignal(ctx, "sell", "macd-momentum", 0.7, "MACD crossed below signal line");
    return null;
  },
};

export const vwapBounceStrategy: Strategy = {
  id: "vwap-bounce",
  name: "VWAP Bounce",
  description: "Day trade bounce off VWAP support/resistance.",
  style: "day",
  evaluate(ctx) {
    if (ctx.bars.length < 10) return null;
    const vwaps = vwap(ctx.bars);
    const i = ctx.bars.length - 1;
    const bar = ctx.bars[i];
    const prev = ctx.bars[i - 1];
    const v = vwaps[i];
    const dist = Math.abs(bar.close - v) / v;
    if (dist > 0.003) return null;
    if (prev.low <= v && bar.close > v && bar.close > bar.open)
      return makeSignal(ctx, "buy", "vwap-bounce", 0.75, "Price bounced off VWAP support");
    if (prev.high >= v && bar.close < v && bar.close < bar.open)
      return makeSignal(ctx, "sell", "vwap-bounce", 0.75, "Price rejected at VWAP resistance");
    return null;
  },
};

export const wickRejectionStrategy: Strategy = {
  id: "wick-rejection",
  name: "Wick Rejection",
  description: "WickSense signature: long lower wick rejection for buys, upper wick for sells.",
  style: "both",
  evaluate(ctx) {
    if (ctx.bars.length < 5) return null;
    const bar = ctx.bars[ctx.bars.length - 1];
    const body = Math.abs(bar.close - bar.open);
    const range = bar.high - bar.low;
    if (range === 0) return null;
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    if (lowerWick / range > 0.6 && body / range < 0.3 && bar.close > bar.open)
      return makeSignal(ctx, "buy", "wick-rejection", 0.78, "Bullish wick rejection at support");
    if (upperWick / range > 0.6 && body / range < 0.3 && bar.close < bar.open)
      return makeSignal(ctx, "sell", "wick-rejection", 0.78, "Bearish wick rejection at resistance");
    return null;
  },
};

export const bollingerBreakoutStrategy: Strategy = {
  id: "bollinger-breakout",
  name: "Bollinger Breakout",
  description: "Buy breakout above upper band; sell breakdown below lower band.",
  style: "swing",
  evaluate(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    if (closes.length < 25) return null;
    const { upper, lower } = bollingerBands(closes);
    const i = closes.length - 1;
    const prev = i - 1;
    if (isNaN(upper[i]) || isNaN(lower[i])) return null;
    if (closes[prev] <= upper[prev] && closes[i] > upper[i])
      return makeSignal(ctx, "buy", "bollinger-breakout", 0.65, "Price broke above upper Bollinger Band");
    if (closes[prev] >= lower[prev] && closes[i] < lower[i])
      return makeSignal(ctx, "sell", "bollinger-breakout", 0.65, "Price broke below lower Bollinger Band");
    return null;
  },
};

export const ALL_STRATEGIES: Strategy[] = [
  emaCrossoverStrategy,
  rsiReversalStrategy,
  macdMomentumStrategy,
  vwapBounceStrategy,
  wickRejectionStrategy,
  bollingerBreakoutStrategy,
];

export function getStrategyById(id: string): Strategy | undefined {
  return ALL_STRATEGIES.find((s) => s.id === id);
}

export function evaluateStrategies(
  ctx: StrategyContext,
  strategyIds: string[]
): Signal[] {
  const signals: Signal[] = [];
  for (const id of strategyIds) {
    const strategy = getStrategyById(id);
    if (!strategy) continue;
    if (strategy.style !== "both" && strategy.style !== ctx.style) continue;
    const signal = strategy.evaluate(ctx);
    if (signal) signals.push(signal);
  }
  return signals;
}

export function consensusSignal(signals: Signal[]): Signal | null {
  if (signals.length === 0) return null;
  const buys = signals.filter((s) => s.side === "buy");
  const sells = signals.filter((s) => s.side === "sell");
  if (buys.length > sells.length) {
    const best = buys.sort((a, b) => b.confidence - a.confidence)[0];
    return { ...best, confidence: Math.min(0.95, best.confidence + buys.length * 0.05) };
  }
  if (sells.length > buys.length) {
    const best = sells.sort((a, b) => b.confidence - a.confidence)[0];
    return { ...best, confidence: Math.min(0.95, best.confidence + sells.length * 0.05) };
  }
  return null;
}

/** Scanner-friendly pick: consensus first, else highest-confidence single signal. */
export function pickScannerSignal(signals: Signal[]): Signal | null {
  if (signals.length === 0) return null;
  return consensusSignal(signals) ?? signals.sort((a, b) => b.confidence - a.confidence)[0];
}
