import { NextRequest, NextResponse } from "next/server";
import { sendAlert, type SessionAlertDetails } from "@/lib/alerts";
import {
  markActionRequiredAlertSent,
  shouldSendActionRequiredAlert,
} from "@/lib/trading-schedule-alert-state";
import { getUserContact, loadUserProfile } from "@/lib/user-config";
import { formatEasternTimestamp } from "@/lib/session-alert-content";

export async function POST(req: NextRequest) {
  let body: {
    reasonCode?: string;
    problemReason?: string;
    recommendedStep?: string;
    symbol?: string;
    strategy?: string;
    mode?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const reasonCode = body.reasonCode?.trim();
  const problemReason = body.problemReason?.trim();
  if (!reasonCode || !problemReason) {
    return NextResponse.json({ error: "reasonCode and problemReason are required" }, { status: 400 });
  }

  if (!shouldSendActionRequiredAlert(reasonCode)) {
    console.log("[Alert] alert_skipped_duplicate: action_required", reasonCode);
    return NextResponse.json({ ok: true, skipped: true, reason: "Already sent today for this issue" });
  }

  const profile = loadUserProfile();
  const contact = getUserContact();
  const now = new Date();

  const details: SessionAlertDetails = {
    timestamp: now.getTime(),
    statusLabel: "Trading Paused: Action Required",
    problemReason,
    recommendedStep: body.recommendedStep,
    affectedSymbol: body.symbol,
    affectedStrategy: body.strategy,
    mode: body.mode === "Live" ? "live" : body.mode === "Paper" ? "paper" : undefined,
    stopTimeEt: formatEasternTimestamp(now),
    reason: problemReason,
    footerMessage: body.recommendedStep,
  };

  const message = `Trading Paused: Action Required — ${problemReason}`;

  const results = await sendAlert(
    "default",
    "action_required",
    message,
    profile.alertSettings,
    contact,
    details
  );

  const sent = results.some((r) => r.sent);
  if (sent) {
    markActionRequiredAlertSent(reasonCode);
    console.log("[Alert] alert_sent: action_required", reasonCode);
  }

  return NextResponse.json({ ok: sent, results, skipped: !sent });
}
