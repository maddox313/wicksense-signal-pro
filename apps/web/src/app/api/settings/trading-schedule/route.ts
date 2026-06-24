import { NextRequest, NextResponse } from "next/server";
import { evaluateTradingSchedule } from "@wicksense/core";
import {
  loadTradingScheduleSettings,
  saveTradingScheduleSettings,
  TRADING_SCHEDULE_CONFIG_PATH,
} from "@/lib/trading-schedule-config";

export async function GET() {
  const settings = loadTradingScheduleSettings();
  const evaluation = evaluateTradingSchedule(settings);

  return NextResponse.json({
    settings,
    storagePath: TRADING_SCHEDULE_CONFIG_PATH,
    tradingAllowedNow: evaluation.allowed,
    tradingBlockReason: evaluation.reason ?? null,
    timezone: "America/New_York",
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const settings = saveTradingScheduleSettings(body);
  const evaluation = evaluateTradingSchedule(settings);

  return NextResponse.json({
    settings,
    storagePath: TRADING_SCHEDULE_CONFIG_PATH,
    tradingAllowedNow: evaluation.allowed,
    tradingBlockReason: evaluation.reason ?? null,
    timezone: "America/New_York",
    updatedAt: new Date().toISOString(),
  });
}
