import type { MultiChartSlot } from "@/lib/store";

/** Trading fields only — excludes markers so chart marker updates do not re-sync engine config. */
export function slotTradingSignature(slots: MultiChartSlot[]): string {
  return slots
    .map(
      (slot) =>
        `${slot.id}:${slot.symbol}:${slot.timeframe}:${slot.tradingStyle}:${slot.mode}:${slot.safetyStopActive}:${slot.consecutiveLosses}:${slot.autoTradeEnabled}`
    )
    .join("|");
}

export function mainTradingSignature(state: {
  symbol: string;
  timeframe: string;
  tradingStyle: string;
  mode: string;
  activePresetId: string;
  safetyStopActive: boolean;
  consecutiveLosses: number;
  riskSettings: unknown;
}): string {
  return JSON.stringify({
    symbol: state.symbol,
    timeframe: state.timeframe,
    tradingStyle: state.tradingStyle,
    mode: state.mode,
    activePresetId: state.activePresetId,
    safetyStopActive: state.safetyStopActive,
    consecutiveLosses: state.consecutiveLosses,
    riskSettings: state.riskSettings,
  });
}
