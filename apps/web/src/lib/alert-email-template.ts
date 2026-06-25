import { ALL_STRATEGIES } from "@wicksense/core";
import type { TradeMode } from "@wicksense/core";

export type AlertEmailType = "buy" | "sell" | "stop_loss" | "safety_stop";

export interface TradeAlertDetails {
  symbol?: string;
  quantity?: number;
  entryPrice?: number;
  strategy?: string;
  timeframe?: string;
  mode?: TradeMode;
  timestamp?: number;
  reason?: string;
  stopLossPrice?: number;
}

export interface AlertEmailContent {
  subject: string;
  text: string;
  html: string;
}

const STRATEGY_LABELS = Object.fromEntries(
  ALL_STRATEGIES.map((strategy) => [strategy.id, strategy.name])
);

const BUY_THEME = {
  accent: "#10b981",
  accentDark: "#059669",
  accentLight: "#ecfdf5",
  label: "BUY",
};

const SELL_THEME = {
  accent: "#ef4444",
  accentDark: "#dc2626",
  accentLight: "#fef2f2",
  label: "SELL",
};

const NEUTRAL_THEME = {
  accent: "#6366f1",
  accentDark: "#4f46e5",
  accentLight: "#eef2ff",
  label: "ALERT",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStrategyLabel(strategyId?: string): string {
  if (!strategyId) return "—";
  return STRATEGY_LABELS[strategyId] ?? strategyId;
}

function formatMode(mode?: TradeMode): string {
  if (!mode) return "—";
  if (mode === "paper") return "Paper";
  if (mode === "live") return "Live";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function formatTimestamp(timestamp?: number): string {
  const date = new Date(timestamp ?? Date.now());
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function alertTheme(type: AlertEmailType) {
  if (type === "buy") return BUY_THEME;
  if (type === "sell") return SELL_THEME;
  return NEUTRAL_THEME;
}

function alertHeadline(type: AlertEmailType): string {
  if (type === "buy") return "BUY Alert";
  if (type === "sell") return "SELL Alert";
  if (type === "stop_loss") return "Stop Loss Alert";
  if (type === "safety_stop") return "Safety Stop Alert";
  return "Trade Alert";
}

function buildSubject(type: AlertEmailType, details?: TradeAlertDetails): string {
  const direction = type === "buy" || type === "sell" ? type.toUpperCase() : alertHeadline(type);
  if (details?.symbol && (type === "buy" || type === "sell")) {
    return `WickSense Alert: ${direction} ${details.symbol.toUpperCase()}`;
  }
  return `WickSense Alert: ${direction}`;
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;color:#94a3b8;font-size:13px;width:120px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;color:#f8fafc;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function buildTradeHtml(
  type: AlertEmailType,
  message: string,
  details?: TradeAlertDetails
): string {
  const theme = alertTheme(type);
  const symbol = details?.symbol?.toUpperCase() ?? "—";
  const direction = type === "buy" || type === "sell" ? theme.label : alertHeadline(type);
  const quantity = details?.quantity;
  const price = details?.entryPrice;
  const actionLine =
    quantity != null && price != null
      ? `${direction} ${quantity} share${quantity === 1 ? "" : "s"} @ $${price.toFixed(2)}`
      : message;

  const reason = details?.reason?.trim();
  const stopLoss =
    details?.stopLossPrice != null
      ? `$${details.stopLossPrice.toFixed(2)}`
      : null;

  const rows = [
    detailRow("Symbol", symbol),
    detailRow("Direction", direction),
    ...(quantity != null ? [detailRow("Quantity", String(quantity))] : []),
    ...(price != null ? [detailRow("Entry Price", `$${price.toFixed(2)}`)] : []),
    detailRow("Strategy", formatStrategyLabel(details?.strategy)),
    detailRow("Timeframe", details?.timeframe ?? "—"),
    detailRow("Mode", formatMode(details?.mode)),
    detailRow("Time", formatTimestamp(details?.timestamp)),
    ...(stopLoss ? [detailRow("Stop Loss", stopLoss)] : []),
  ].join("");

  const reasonSection = reason
    ? `
      <tr>
        <td style="padding:0 32px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#111827;border:1px solid #1f2937;border-radius:12px;">
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Reason / Signal Details</p>
                <p style="margin:0;color:#e5e7eb;font-size:14px;line-height:1.6;">${escapeHtml(reason)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const paperNote =
    details?.mode === "paper"
      ? `<p style="margin:8px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">Paper trading alerts are for testing only.</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(buildSubject(type, details))}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0f14;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${theme.accentDark};padding:28px 32px;">
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">WickSense Signal Pro</p>
              <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;line-height:1.2;">${escapeHtml(alertHeadline(type))}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:${theme.accent};font-size:36px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;">${escapeHtml(symbol)}</p>
              <p style="margin:0 0 24px;color:#f8fafc;font-size:18px;font-weight:600;line-height:1.4;">${escapeHtml(actionLine)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #1f2937;">
                ${rows}
              </table>
            </td>
          </tr>
          ${reasonSection}
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${theme.accentLight};border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#475569;font-size:12px;line-height:1.5;">This is an automated WickSense alert.</p>
                    ${paperNote}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildTradeText(
  type: AlertEmailType,
  message: string,
  details?: TradeAlertDetails
): string {
  const theme = alertTheme(type);
  const symbol = details?.symbol?.toUpperCase() ?? "—";
  const direction = type === "buy" || type === "sell" ? theme.label : alertHeadline(type);
  const quantity = details?.quantity;
  const price = details?.entryPrice;
  const actionLine =
    quantity != null && price != null
      ? `${direction} ${quantity} share${quantity === 1 ? "" : "s"} @ $${price.toFixed(2)}`
      : message;

  const lines = [
    "WickSense Signal Pro",
    alertHeadline(type),
    "",
    symbol,
    actionLine,
    "",
    `Strategy: ${formatStrategyLabel(details?.strategy)}`,
    `Timeframe: ${details?.timeframe ?? "—"}`,
    `Mode: ${formatMode(details?.mode)}`,
    `Time: ${formatTimestamp(details?.timestamp)}`,
  ];

  if (details?.stopLossPrice != null) {
    lines.push(`Stop Loss: $${details.stopLossPrice.toFixed(2)}`);
  }

  if (details?.reason?.trim()) {
    lines.push("", "Reason / Signal Details:", details.reason.trim());
  }

  lines.push("", "This is an automated WickSense alert.");
  if (details?.mode === "paper") {
    lines.push("Paper trading alerts are for testing only.");
  }

  return lines.join("\n");
}

function buildGenericHtml(type: AlertEmailType, message: string): string {
  const theme = alertTheme(type);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(buildSubject(type))}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0f14;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${theme.accentDark};padding:28px 32px;">
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">WickSense Signal Pro</p>
              <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;line-height:1.2;">${escapeHtml(alertHeadline(type))}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0;color:#f8fafc;font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">This is an automated WickSense alert.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildGenericText(type: AlertEmailType, message: string): string {
  return [
    "WickSense Signal Pro",
    alertHeadline(type),
    "",
    message,
    "",
    "This is an automated WickSense alert.",
  ].join("\n");
}

export function buildAlertEmailContent(
  type: AlertEmailType,
  message: string,
  details?: TradeAlertDetails
): AlertEmailContent {
  const isTradeAlert =
    (type === "buy" || type === "sell") &&
    Boolean(details?.symbol || details?.quantity != null || details?.entryPrice != null);

  if (isTradeAlert) {
    return {
      subject: buildSubject(type, details),
      text: buildTradeText(type, message, details),
      html: buildTradeHtml(type, message, details),
    };
  }

  return {
    subject: buildSubject(type, details),
    text: buildGenericText(type, message),
    html: buildGenericHtml(type, message),
  };
}
