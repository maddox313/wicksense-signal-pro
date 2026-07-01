import { NextRequest, NextResponse } from "next/server";
import { sendAlert, getAlertProviderStatus } from "@/lib/alerts";
import { loadUserProfile } from "@/lib/user-config";
import { DEFAULT_ALERT_SETTINGS } from "@wicksense/core";

export async function POST(req: NextRequest) {
  try {
    let body: { channel?: "email" | "sms" | "both" };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const channel = body.channel ?? "both";
    const profile = loadUserProfile();
    const providers = getAlertProviderStatus();
    const testSettings = {
      ...DEFAULT_ALERT_SETTINGS,
      emailEnabled: channel === "email" || channel === "both",
      smsEnabled: channel === "sms" || channel === "both",
      onBuy: true,
      onSell: true,
      onStopLoss: true,
      onSafetyStop: true,
    };

    const message =
      "This is a test alert from WickSense Signal Pro. Your notifications are working.";

    const results = await sendAlert(
      "default",
      "buy",
      message,
      testSettings,
      { email: profile.email || undefined, phone: profile.phone || undefined },
      {
        symbol: "AAPL",
        quantity: 11,
        entryPrice: 186.54,
        strategy: "ema-crossover",
        timeframe: "5m",
        mode: "paper",
        timestamp: Date.now(),
        reason: message,
      }
    );

    return NextResponse.json({
      ok: results.some((r) => r.sent),
      results,
      providers,
      profile: {
        hasEmail: Boolean(profile.email),
        hasPhone: Boolean(profile.phone),
        phoneNormalized: profile.phone ? profile.phone.replace(/\D/g, "").length >= 10 : false,
      },
      twilioHints: [
        "Trial accounts must verify your phone at console.twilio.com → Phone Numbers → Verified Caller IDs",
        "Toll-free senders (+1855...) need SMS registration in Twilio before delivery works reliably",
        "Use +1 format in Profile, e.g. +15615123165",
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/alerts/test] failed:", message);
    return NextResponse.json({ ok: false, error: message, results: [] }, { status: 500 });
  }
}
