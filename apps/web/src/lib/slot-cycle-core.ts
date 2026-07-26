import type { Signal, StrategyPreset, Trade, TradingScheduleSettings, AlertSettings, RiskSettings } from "@wicksense/core";
import {
  detectActionableSignal,
  detectCurrentBarSignals,
} from "@wicksense/core";
import { logDuplicateSignalBlocked } from "@/lib/signal-dedupe-log";
import type { FetchBarsResult, SlotTradeConfig } from "@/lib/autoTradeRunner";
import { evaluateSlotEntryGates } from "@/lib/slot-entry-gates";

export interface SlotCycleExecuteResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface SlotCycleContext {
  getTrades: () => Trade[] | Promise<Trade[]>;
  tradingSchedule: TradingScheduleSettings;
  riskSettings: RiskSettings;
  alertSettings: AlertSettings;
  resolveActivePreset: () => StrategyPreset | null;
  fetchBars: (symbol: string, timeframe: string) => Promise<FetchBarsResult>;
  executeTrade: (params: {
    slotId: string;
    symbol: string;
    side: "buy" | "sell";
    price: number;
    strategy: string;
    mode: SlotTradeConfig["mode"];
    signalId?: string;
    bars: FetchBarsResult["bars"];
    timeframe?: string;
    signalReason?: string;
    signalBarTime?: number;
  }) => Promise<SlotCycleExecuteResult>;
  onSignalDetected?: (signal: Signal) => void;
  recordBarSignalsGenerated?: (signals: Signal[]) => void;
  recordSlotScan?: (scan: Record<string, unknown>) => void;
  recordSignalGenerated?: (signal: Signal) => void;
  recordSignalRejected?: (signal: Signal, reason: string) => void;
  recordSignalConverted?: (signal: Signal) => void;
  recordDetectError?: (message: string) => void;
  clearDetectError?: () => void;
  /**
   * Optional server-side gate (e.g. paper VWAP Bounce ROC4/RelVol).
   * Must not pull Node `fs` into the client bundle — provide only from server engine.
   */
  filterSignalBeforeExecute?: (params: {
    signal: Signal;
    bars: FetchBarsResult["bars"];
    config: SlotTradeConfig;
  }) => Promise<{ allow: boolean; reason?: string } | void>;
}

export async function runSlotCycleWithContext(
  config: SlotTradeConfig,
  ctx: SlotCycleContext
): Promise<void> {
  const { slotId, symbol, timeframe, tradingStyle, mode } = config;

  const { bars } = await ctx.fetchBars(symbol, timeframe);

  const recordScan = (scan: Record<string, unknown>) => {
    ctx.recordSlotScan?.(scan);
  };

  if (bars.length < 30) {
    recordScan({
      chartSlot: slotId,
      symbol,
      timeframe,
      barCount: bars.length,
      presetId: null,
      presetStrategies: [],
      barSignalCount: 0,
      strategiesFired: [],
      pickedStrategy: null,
      outcome: "no_bars",
      detail: `Only ${bars.length} bars (need 30+)`,
    });
    return;
  }

  const activePreset = ctx.resolveActivePreset();
  if (!activePreset) {
    recordScan({
      chartSlot: slotId,
      symbol,
      timeframe,
      barCount: bars.length,
      presetId: null,
      presetStrategies: [],
      barSignalCount: 0,
      strategiesFired: [],
      pickedStrategy: null,
      outcome: "no_preset",
      detail: "No strategy preset loaded",
    });
    return;
  }

  try {
    const tf = timeframe || "15m";
    const signal = detectActionableSignal(
      symbol,
      bars,
      activePreset.strategies,
      tradingStyle,
      tf
    );
    const barSignals = detectCurrentBarSignals(
      symbol,
      bars,
      activePreset.strategies,
      tradingStyle,
      tf
    );
    const strategiesFired = [...new Set<string>(barSignals.map((s) => s.strategy))];
    ctx.clearDetectError?.();

    if (barSignals.length > 0) {
      ctx.recordBarSignalsGenerated?.(barSignals);
    }

    if (!signal) {
      recordScan({
        chartSlot: slotId,
        symbol,
        timeframe,
        barCount: bars.length,
        presetId: activePreset.id,
        presetStrategies: activePreset.strategies,
        barSignalCount: barSignals.length,
        strategiesFired,
        pickedStrategy: null,
        outcome: strategiesFired.length > 0 ? "signal_seen" : "no_signal",
        detail: strategiesFired.length > 0 ? "Bar signals only" : "No strategy match",
      });
      return;
    }

    ctx.recordSignalGenerated?.(signal);
    ctx.onSignalDetected?.(signal);

    const rejectSignal = (reason: string) => {
      ctx.recordSignalRejected?.(signal, reason);
    };

    const trades = await ctx.getTrades();
    const gate = await evaluateSlotEntryGates({
      config,
      signal,
      bars,
      trades,
      tradingSchedule: ctx.tradingSchedule,
      filterSignalBeforeExecute: ctx.filterSignalBeforeExecute,
    });

    if (!gate.executable) {
      const detail = gate.reason;
      if (detail.includes("Duplicate signal")) {
        logDuplicateSignalBlocked({
          slot: slotId,
          symbol,
          timeframe,
          strategy: signal.strategy,
          side: signal.side,
          barTime: signal.time,
          signalId: signal.id,
        });
      } else {
        rejectSignal(detail);
      }
      const outcome = detail.toLowerCase().includes("schedule")
        ? "schedule_blocked"
        : "signal_seen";
      recordScan({
        chartSlot: slotId,
        symbol,
        timeframe,
        barCount: bars.length,
        presetId: activePreset.id,
        presetStrategies: activePreset.strategies,
        barSignalCount: barSignals.length,
        strategiesFired,
        pickedStrategy: signal.strategy,
        outcome,
        detail:
          detail === "Sell signal skipped — no open position on this chart"
            ? "Sell signal skipped — no open position on this chart (waiting for buy)"
            : detail === "Day scalp exits via auto-exit TP/SL only"
              ? `Strategy sell ignored (${signal.reason}) — waiting for TP/SL auto-exit`
              : detail,
      });
      return;
    }

    const result = await ctx.executeTrade({
      slotId,
      symbol,
      side: signal.side,
      price: signal.price,
      strategy: signal.strategy,
      mode,
      signalId: signal.id,
      bars,
      timeframe,
      signalReason: signal.reason,
      signalBarTime: signal.time,
    });

    if (result.skipped || (!result.ok && result.reason)) {
      rejectSignal(result.reason ?? "Trade skipped by filter");
      recordScan({
        chartSlot: slotId,
        symbol,
        timeframe,
        barCount: bars.length,
        presetId: activePreset.id,
        presetStrategies: activePreset.strategies,
        barSignalCount: barSignals.length,
        strategiesFired,
        pickedStrategy: signal.strategy,
        outcome: "signal_seen",
        detail: result.reason ?? "Trade skipped by filter",
      });
      return;
    }

    if (result.ok) {
      ctx.recordSignalConverted?.(signal);
      recordScan({
        chartSlot: slotId,
        symbol,
        timeframe,
        barCount: bars.length,
        presetId: activePreset.id,
        presetStrategies: activePreset.strategies,
        barSignalCount: barSignals.length,
        strategiesFired,
        pickedStrategy: signal.strategy,
        outcome: "signal_traded",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signal analysis failed";
    ctx.recordDetectError?.(message);
    console.error(`[AutoTrade:${slotId}] Signal analysis failed`, err);
  }
}
