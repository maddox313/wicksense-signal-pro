import type { StrategyPreset } from "@wicksense/core";
import { DEFAULT_RISK_SETTINGS } from "@wicksense/core";

export const DEFAULT_PRESETS: StrategyPreset[] = [
  {
    id: "day-scalper",
    name: "Day Scalper",
    description: "Fast day trades using VWAP, wick rejection, and EMA crossover.",
    tradingStyle: "day",
    strategies: ["vwap-bounce", "wick-rejection", "ema-crossover", "rsi-reversal"],
    timeframe: "15m",
    riskSettings: DEFAULT_RISK_SETTINGS,
    isAiGenerated: false,
    enabled: true,
  },
  {
    id: "swing-momentum",
    name: "Swing Momentum",
    description: "Multi-day swing trades using MACD, Bollinger, and EMA strategies.",
    tradingStyle: "swing",
    strategies: ["ema-crossover", "macd-momentum", "bollinger-breakout", "wick-rejection"],
    timeframe: "1d",
    riskSettings: DEFAULT_RISK_SETTINGS,
    isAiGenerated: false,
    enabled: true,
  },
  {
    id: "wick-sense-pro",
    name: "WickSense Pro",
    description: "Signature wick rejection strategy combined with RSI and EMA confirmation.",
    tradingStyle: "day",
    strategies: ["wick-rejection", "rsi-reversal", "ema-crossover"],
    timeframe: "15m",
    riskSettings: { ...DEFAULT_RISK_SETTINGS, maxConsecutiveLosses: 4 },
    isAiGenerated: false,
    enabled: true,
  },
];
