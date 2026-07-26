import type {
  Signal,
  Trade,
  TradingScheduleSettings,
  TradingStyle,
} from "@wicksense/core";
import {
  canEnterNewPositions,
  evaluateTradingSchedule,
} from "@wicksense/core";
import type { FetchBarsResult, SlotTradeConfig } from "./autoTradeRunner";

export type SlotEntryGateResult =
  | { executable: true }
  | { executable: false; reason: string };

function hasActiveTradeForSignal(trades: Trade[], slotId: string, signalId: string): boolean {
  return trades.some(
    (trade) =>
      trade.chartSlot === slotId &&
      (trade.signalId === signalId || trade.id === `trade-${slotId}-${signalId}`)
  );
}

/**
 * Shared pre-execute gates used by the live slot cycle and Main Chart dry-run.
 * Keep in lockstep with runSlotCycleWithContext — do not fork alternate rules.
 */
export async function evaluateSlotEntryGates(params: {
  config: SlotTradeConfig;
  signal: Signal;
  bars: FetchBarsResult["bars"];
  trades: Trade[];
  tradingSchedule: TradingScheduleSettings;
  filterSignalBeforeExecute?: (params: {
    signal: Signal;
    bars: FetchBarsResult["bars"];
    config: SlotTradeConfig;
  }) => Promise<{ allow: boolean; reason?: string } | void>;
}): Promise<SlotEntryGateResult> {
  const { config, signal, bars, trades, tradingSchedule, filterSignalBeforeExecute } = params;
  const { slotId, symbol, tradingStyle, mode, autoTradeEnabled, safetyStopActive } = config;

  if (bars.length < 30) {
    return { executable: false, reason: `Only ${bars.length} bars (need 30+)` };
  }

  if (!autoTradeEnabled) {
    return { executable: false, reason: "Auto trade disabled" };
  }

  const scheduleCheck =
    signal.side === "buy"
      ? canEnterNewPositions(tradingSchedule)
      : evaluateTradingSchedule(tradingSchedule);
  if (!scheduleCheck.allowed) {
    return {
      executable: false,
      reason: scheduleCheck.reason ?? "Outside trading schedule",
    };
  }

  if (safetyStopActive) {
    return { executable: false, reason: "Safety stop active" };
  }

  if (mode === "manual") {
    return { executable: false, reason: "Manual mode" };
  }

  if (filterSignalBeforeExecute) {
    const gate = await filterSignalBeforeExecute({ signal, bars, config });
    if (gate && gate.allow === false) {
      return {
        executable: false,
        reason: gate.reason ?? "Blocked by pre-execute filter",
      };
    }
  }

  if (signal.side === "sell") {
    const hasOpenOnSlot = trades.some(
      (t) =>
        t.status === "open" &&
        t.mode === mode &&
        t.chartSlot === slotId &&
        t.symbol === symbol &&
        t.side === "buy"
    );
    if (!hasOpenOnSlot) {
      return {
        executable: false,
        reason: "Sell signal skipped — no open position on this chart",
      };
    }
    if (autoTradeEnabled && tradingStyle === "day") {
      return {
        executable: false,
        reason: "Day scalp exits via auto-exit TP/SL only",
      };
    }
  }

  if (hasActiveTradeForSignal(trades, slotId, signal.id)) {
    return { executable: false, reason: "Duplicate signal (trade already recorded)" };
  }

  if (!(signal.price > 0) || !Number.isFinite(signal.price)) {
    return { executable: false, reason: "Invalid signal price" };
  }

  return { executable: true };
}

export function isUnresolvedMainSlotTrade(trade: Trade): boolean {
  return (
    trade.chartSlot === "main" &&
    (trade.status === "open" || trade.status === "needs_manual_close") &&
    (trade.mode === "paper" || trade.mode === "live")
  );
}

export type { TradingStyle };
