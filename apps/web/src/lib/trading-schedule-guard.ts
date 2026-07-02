import { evaluateTradingSchedule, type TradingScheduleEvaluation } from "@wicksense/core";
import {
  loadTradingScheduleSettings,
  primeTradingScheduleCache,
} from "@/lib/trading-schedule-config";

export function getTradingScheduleStatus(date: Date = new Date()): TradingScheduleEvaluation {
  return evaluateTradingSchedule(loadTradingScheduleSettings(), date);
}

export async function getTradingScheduleStatusAsync(
  date: Date = new Date()
): Promise<TradingScheduleEvaluation> {
  await primeTradingScheduleCache();
  return evaluateTradingSchedule(loadTradingScheduleSettings(), date);
}

export function isTradingScheduleAllowed(date: Date = new Date()): boolean {
  return getTradingScheduleStatus(date).allowed;
}

export function tradingScheduleBlockReason(date: Date = new Date()): string | undefined {
  const status = getTradingScheduleStatus(date);
  return status.allowed ? undefined : status.reason ?? "Outside allowed trading hours";
}
