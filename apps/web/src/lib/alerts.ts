import type { AlertSettings } from "@wicksense/core";
import nodemailer from "nodemailer";

export interface AlertProviderStatus {
  email: "resend" | "sendgrid" | "smtp" | "none";
  sms: "twilio" | "none";
}

export function getAlertProviderStatus(): AlertProviderStatus {
  if (process.env.RESEND_API_KEY) return { email: "resend", sms: twilioStatus() };
  if (process.env.SENDGRID_API_KEY) return { email: "sendgrid", sms: twilioStatus() };
  if (process.env.SMTP_HOST) return { email: "smtp", sms: twilioStatus() };
  return { email: "none", sms: twilioStatus() };
}

function twilioStatus(): "twilio" | "none" {
  return process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
    ? "twilio"
    : "none";
}

export async function sendAlert(
  userId: string,
  type: "buy" | "sell" | "stop_loss" | "safety_stop",
  message: string,
  settings: AlertSettings,
  contact: { email?: string; phone?: string }
) {
  const channels: { channel: string; sent: boolean; error?: string }[] = [];

  const typeEnabled =
    (type === "buy" && settings.onBuy) ||
    (type === "sell" && settings.onSell) ||
    (type === "stop_loss" && settings.onStopLoss) ||
    (type === "safety_stop" && settings.onSafetyStop);

  if (!typeEnabled) return channels;

  if (settings.pushEnabled) {
    channels.push({ channel: "push", sent: true });
  }

  if (settings.emailEnabled && contact.email) {
    try {
      await sendEmail(contact.email, `WickSense Alert: ${type.toUpperCase()}`, message);
      channels.push({ channel: "email", sent: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Email send failed";
      console.error("[Alert email error]", error);
      channels.push({ channel: "email", sent: false, error });
    }
  }

  if (settings.smsEnabled && contact.phone) {
    try {
      await sendSms(contact.phone, `WickSense: ${message}`);
      channels.push({ channel: "sms", sent: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : "SMS send failed";
      console.error("[Alert SMS error]", error);
      channels.push({ channel: "sms", sent: false, error });
    }
  }

  return channels;
}

async function sendEmail(to: string, subject: string, body: string) {
  if (process.env.RESEND_API_KEY) {
    await sendEmailViaResend(to, subject, body);
    return;
  }
  if (process.env.SENDGRID_API_KEY) {
    await sendEmailViaSendGrid(to, subject, body);
    return;
  }
  if (process.env.SMTP_HOST) {
    await sendEmailViaSmtp(to, subject, body);
    return;
  }
  console.log(`[Email stub] To: ${to} | ${subject}: ${body}`);
  throw new Error(
    "No email provider configured. Add RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_* to .env"
  );
}

async function sendEmailViaResend(to: string, subject: string, body: string) {
  const from = process.env.EMAIL_FROM || "WickSense <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });
  if (!res.ok) {
    throw new Error(`Resend error (${res.status}): ${await res.text()}`);
  }
}

async function sendEmailViaSendGrid(to: string, subject: string, body: string) {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || "alerts@wicksense.pro";
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  });
  if (!res.ok) {
    throw new Error(`SendGrid error (${res.status}): ${await res.text()}`);
  }
}

async function sendEmailViaSmtp(to: string, subject: string, body: string) {
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465 || process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || "alerts@wicksense.pro",
    to,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
  });
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function sendSms(to: string, body: string): Promise<{ status: string; sid?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.log(`[SMS stub] To: ${to}: ${body}`);
    throw new Error(
      "Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to .env"
    );
  }

  const toNormalized = normalizePhone(to);
  const fromNormalized = normalizePhone(from);

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: toNormalized,
      From: fromNormalized,
      Body: body.slice(0, 1600),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    sid?: string;
    message?: string;
    code?: number;
    error_message?: string;
  };

  if (!res.ok) {
    const detail = data.message || data.error_message || JSON.stringify(data);
    throw new Error(`Twilio error (${res.status}, code ${data.code ?? "?"}): ${detail}`);
  }

  if (data.status === "failed" || data.status === "undelivered") {
    throw new Error(`Twilio message ${data.status}: ${data.error_message ?? "unknown error"}`);
  }

  console.log(`[SMS sent] sid=${data.sid} status=${data.status} to=${toNormalized}`);
  return { status: data.status ?? "unknown", sid: data.sid };
}
