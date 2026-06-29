import { NextRequest, NextResponse } from "next/server";
import { ALL_STRATEGIES, evaluateTradingSchedule } from "@wicksense/core";
import { sendAlert, type SessionAlertDetails } from "@/lib/alerts";
import { loadTradingScheduleSettings } from "@/lib/trading-schedule-config";
import {
  markScheduleAlertSent,
  shouldSendScheduleAlert,
  type ScheduleAlertEvent,
} from "@/lib/trading-schedule-alert-state";
import { getUserContact, loadUserProfile } from "@/lib/user-config";
import { getAllTrades } from "@/lib/trade-store";
import {
  buildScheduleStopReason,
  buildSessionStopRecap,
  buildTradingStartedMessage,
  buildTradingStoppedMessage,
  formatEasternTimestamp,
  formatModeLabel,
  formatTradingScheduleSummary,
  type TradingSessionClientContext,
} from "@/lib/session-alert-content";

function strategyLabels(ids: string[]): string[] {
  const map = Object.fromEntries(ALL_STRATEGIES.map((s) => [s.id, s.name]));
  return ids.map((id) => map[id] ?? id);
}

export async function POST(req: NextRequest) {
  let body: { event?: ScheduleAlertEvent; context?: TradingSessionClientContext };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const event = body.event;
  if (event !== "started" && event !== "stopped") {
    return NextResponse.json({ error: "event must be started or stopped" }, { status: 400 });
  }

  const schedule = loadTradingScheduleSettings();
  if (schedule.unrestricted) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Unrestricted schedule" });
  }

  if (!shouldSendScheduleAlert(event)) {
    console.log(
      `[Alert] alert_skipped_duplicate: ${event === "started" ? "trading_started" : "trading_stopped"}`
    );
    return NextResponse.json({ ok: true, skipped: true, reason: "Already sent today" });
  }

  const context = body.context ?? {
    mode: "paper",
    autoTradeEnabled: true,
    enabledMarkets: [],
    enabledStrategies: [],
  };

  const profile = loadUserProfile();
  const contact = getUserContact();
  const alertType = event === "started" ? "trading_started" : "trading_stopped";
  const now = new Date();
  const scheduleSummary = formatTradingScheduleSummary(schedule);
  evaluateTradingSchedule(schedule);
  const trades = await getAllTrades();

  const details: SessionAlertDetails = {
    timestamp: now.getTime(),
    mode: context.mode,
    scheduleSummary,
    statusLabel: event === "started" ? "Trading session active" : "Trading stopped",
    autoTradeStatus: context.autoTradeEnabled ? "Auto-trading enabled" : "Auto-trading disabled",
    enabledMarkets: context.enabledMarkets,
    enabledStrategies: strategyLabels(context.enabledStrategies),
    presetName: context.presetName,
  };

  if (event === "started") {
    details.startTimeEt = formatEasternTimestamp(now);
    details.footerMessage = buildTradingStartedMessage(schedule, context);
    details.reason = details.footerMessage;
  } else {
    const recap = buildSessionStopRecap(trades, now);
    details.stopTimeEt = formatEasternTimestamp(now);
    details.stopReason = buildScheduleStopReason(schedule, context);
    details.tradesOpenedToday = recap.tradesOpenedToday;
    details.tradesClosedToday = recap.tradesClosedToday;
    details.winsToday = recap.winsToday;
    details.lossesToday = recap.lossesToday;
    details.todayPnl = recap.todayPnl;
    details.openPositionsRemaining = recap.openPositionsRemaining;
    details.footerMessage = buildTradingStoppedMessage(schedule, context, recap);
    details.reason = details.stopReason;
  }

  const message =
    event === "started"
      ? `WickSense trading started (${formatModeLabel(context.mode)}). ${details.footerMessage}`
      : `WickSense trading stopped. ${details.footerMessage}`;

  const results = await sendAlert(
    "default",
    alertType,
    message,
    profile.alertSettings,
    contact,
    details
  );

  const sent = results.some((r) => r.sent);
  if (sent) {
    markScheduleAlertSent(event);
    console.log(`[Alert] alert_sent: ${event === "started" ? "trading_started" : "trading_stopped"}`);
  }

  return NextResponse.json({ ok: sent, results, skipped: !sent });
}
