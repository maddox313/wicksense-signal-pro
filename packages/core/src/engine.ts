import { evaluateStrategies, consensusSignal, pickScannerSignal } from "./strategies";
import { RiskEngine, computePerformanceStats } from "./risk";
import type {
  OHLCV,
  Signal,
  Trade,
  StrategyPreset,
  BacktestResult,
  TradingStyle,
  RiskSettings,
  ScannerResult,
} from "./types";
import { DEFAULT_RISK_SETTINGS } from "./types";

export function runBacktest(
  symbol: string,
  bars: OHLCV[],
  preset: StrategyPreset,
  initialBalance = 100_000
): BacktestResult {
  const riskEngine = new RiskEngine(preset.riskSettings);
  const trades: Trade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let balance = initialBalance;
  let openTrade: Trade | null = null;
  const style: TradingStyle = preset.tradingStyle;
  const lookback = 50;

  for (let i = lookback; i < bars.length; i++) {
    if (riskEngine.isSafetyStopActive()) break;

    const slice = bars.slice(0, i + 1);
    const signals = evaluateStrategies(
      { symbol, bars: slice, style, timeframe: preset.timeframe },
      preset.strategies
    );
    const signal = consensusSignal(signals);
    const bar = bars[i];

    equityCurve.push({ time: bar.time, equity: balance });

    if (openTrade) {
      const isLong = openTrade.side === "buy";
      const exitSignal = signal?.side === "sell" && isLong;
      const stopHit = isLong
        ? bar.low <= openTrade.entryPrice * 0.98
        : bar.high >= openTrade.entryPrice * 1.02;

      if (exitSignal || stopHit) {
        const exitPrice = exitSignal ? bar.close : isLong ? openTrade.entryPrice * 0.98 : openTrade.entryPrice * 1.02;
        const pnl = isLong
          ? (exitPrice - openTrade.entryPrice) * openTrade.quantity
          : (openTrade.entryPrice - exitPrice) * openTrade.quantity;
        openTrade.exitPrice = exitPrice;
        openTrade.exitTime = bar.time;
        openTrade.pnl = pnl;
        openTrade.pnlPercent = (pnl / (openTrade.entryPrice * openTrade.quantity)) * 100;
        openTrade.status = "closed";
        balance += pnl;
        riskEngine.recordTradeResult(pnl);
        trades.push(openTrade);
        openTrade = null;
      }
      continue;
    }

    if (!signal) continue;
    const check = riskEngine.canOpenTrade(0);
    if (!check.allowed) continue;

    const stopLoss = signal.side === "buy" ? signal.price * 0.98 : signal.price * 1.02;
    const { quantity } = riskEngine.calculatePositionSize(balance, signal.price, stopLoss);
    if (quantity <= 0) continue;

    openTrade = {
      id: `bt-${bar.time}`,
      symbol,
      side: signal.side,
      quantity,
      entryPrice: signal.price,
      entryTime: bar.time,
      mode: "paper",
      strategy: signal.strategy,
      status: "open",
    };
  }

  if (openTrade) {
    const lastBar = bars[bars.length - 1];
    const pnl =
      openTrade.side === "buy"
        ? (lastBar.close - openTrade.entryPrice) * openTrade.quantity
        : (openTrade.entryPrice - lastBar.close) * openTrade.quantity;
    openTrade.exitPrice = lastBar.close;
    openTrade.exitTime = lastBar.time;
    openTrade.pnl = pnl;
    openTrade.pnlPercent = (pnl / (openTrade.entryPrice * openTrade.quantity)) * 100;
    openTrade.status = "closed";
    trades.push(openTrade);
  }

  const stats = computePerformanceStats(trades);
  stats.safetyStopTriggered = riskEngine.isSafetyStopActive();

  return {
    presetId: preset.id,
    symbol,
    startTime: bars[0]?.time ?? 0,
    endTime: bars[bars.length - 1]?.time ?? 0,
    trades,
    stats,
    equityCurve,
  };
}

const MIN_BARS = 30;
const DEFAULT_SCAN_LOOKBACK = 20;

/** Minimum confidence to act on a signal for auto-trade (avoids weak marginal setups). */
export const MIN_TRADE_SIGNAL_CONFIDENCE = 0.68;

/** Scan recent bars for the latest strategy signal (not just the current bar). */
export function detectRecentSignal(
  symbol: string,
  bars: OHLCV[],
  strategyIds: string[],
  style: TradingStyle,
  lookback = DEFAULT_SCAN_LOOKBACK,
  timeframe = "5m"
): Signal | null {
  if (bars.length < MIN_BARS) return null;

  let best: Signal | null = null;
  const start = Math.max(MIN_BARS - 1, bars.length - lookback);

  for (let i = start; i < bars.length; i++) {
    const slice = bars.slice(0, i + 1);
    const signals = evaluateStrategies({ symbol, bars: slice, style, timeframe }, strategyIds);
    const signal = pickScannerSignal(signals);
    if (signal && (!best || signal.time >= best.time)) {
      best = signal;
    }
  }

  return best;
}

/** All strategy signals on the current (latest) bar. */
export function detectCurrentBarSignals(
  symbol: string,
  bars: OHLCV[],
  strategyIds: string[],
  style: TradingStyle,
  timeframe = "5m"
): Signal[] {
  if (bars.length < MIN_BARS) return [];
  return evaluateStrategies({ symbol, bars, style, timeframe }, strategyIds);
}

/**
 * Fresh signal on the latest bar only — no stale lookback entries.
 * Returns null when confidence is below the trade threshold.
 */
export function detectFreshBarSignal(
  symbol: string,
  bars: OHLCV[],
  strategyIds: string[],
  style: TradingStyle,
  timeframe = "5m",
  minConfidence = MIN_TRADE_SIGNAL_CONFIDENCE
): Signal | null {
  const signals = detectCurrentBarSignals(symbol, bars, strategyIds, style, timeframe);
  const signal = pickScannerSignal(signals);
  if (!signal || signal.confidence < minConfidence) return null;
  const lastBar = bars[bars.length - 1];
  if (signal.time !== lastBar.time) return null;
  return signal;
}

export function scanMarket(
  data: { symbol: string; bars: OHLCV[]; changePercent: number }[],
  strategyIds: string[],
  style: TradingStyle,
  lookback = DEFAULT_SCAN_LOOKBACK,
  timeframe?: string
): ScannerResult[] {
  const tf = timeframe ?? (style === "day" ? "5m" : "1d");
  const results: ScannerResult[] = [];
  for (const item of data) {
    if (item.bars.length < MIN_BARS) continue;
    const signal = detectFreshBarSignal(item.symbol, item.bars, strategyIds, style, tf);
    if (!signal) continue;
    const lastBar = item.bars[item.bars.length - 1];
    results.push({
      symbol: item.symbol,
      signal,
      volume: lastBar.volume,
      changePercent: item.changePercent,
    });
  }
  return results.sort((a, b) => b.signal.confidence - a.signal.confidence);
}

export function generateAiPreset(
  style: TradingStyle,
  riskSettings: RiskSettings = DEFAULT_RISK_SETTINGS
): StrategyPreset {
  const dayStrategies = ["vwap-bounce", "wick-rejection", "ema-crossover", "rsi-reversal"];
  const swingStrategies = ["ema-crossover", "macd-momentum", "rsi-reversal", "bollinger-breakout", "wick-rejection"];
  return {
    id: `ai-${Date.now()}`,
    name: `AI ${style === "day" ? "Day" : "Swing"} Preset`,
    description: `AI-optimized ${style} trading preset combining top-performing strategies.`,
    tradingStyle: style,
    strategies: style === "day" ? dayStrategies : swingStrategies,
    timeframe: style === "day" ? "15m" : "1d",
    riskSettings,
    isAiGenerated: true,
    enabled: true,
  };
}

export function detectSignal(
  symbol: string,
  bars: OHLCV[],
  strategyIds: string[],
  style: TradingStyle,
  timeframe = "5m"
): Signal | null {
  const signals = evaluateStrategies({ symbol, bars, style, timeframe }, strategyIds);
  return consensusSignal(signals);
}
