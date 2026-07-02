import {
  getExitPercentsForTradingStyle,
  type StyleExitPercents,
  type Trade,
  type TradingStyle,
} from "@wicksense/core";
import { loadEngineConfig } from "@/lib/engine-config";

export function resolveTradingStyleForChartSlot(chartSlot: string): TradingStyle {
  const engine = loadEngineConfig();
  if (chartSlot === "main") return engine.main.tradingStyle;
  return engine.multi[chartSlot]?.tradingStyle ?? "day";
}

export function resolveExitPercentsForChartSlot(chartSlot: string): StyleExitPercents {
  return getExitPercentsForTradingStyle(resolveTradingStyleForChartSlot(chartSlot));
}

export function resolveTradingStyleForTrade(trade: Trade): TradingStyle {
  const slot = trade.chartSlot;
  if (!slot || slot === "alpaca-sync") return "day";
  return resolveTradingStyleForChartSlot(slot);
}

export function resolveExitPercentsForTrade(trade: Trade): StyleExitPercents {
  return getExitPercentsForTradingStyle(resolveTradingStyleForTrade(trade));
}
