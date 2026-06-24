"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { AlertSettings } from "@wicksense/core";
import { User, Mail, Phone, Save, Bell, CheckCircle, AlertCircle } from "lucide-react";
import { TradingScheduleSection } from "@/components/TradingScheduleSection";

interface ProfileData {
  displayName: string;
  email: string;
  phone: string;
  alertSettings: AlertSettings;
  providers: { email: string; sms: string };
}

export default function ProfilePage() {
  const { mode, tradingStyle, riskSettings, alertSettings, setAlertSettings } = useAppStore();
  const [displayName, setDisplayName] = useState("Trader");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [providers, setProviders] = useState<{ email: string; sms: string }>({
    email: "none",
    sms: "none",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"email" | "sms" | "both" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setDisplayName(data.displayName || "Trader");
        setEmail(data.email || "");
        setPhone(data.phone || "");
        setProviders(data.providers || { email: "none", sms: "none" });
        if (data.alertSettings) setAlertSettings(data.alertSettings);
      })
      .catch(() => {});
  }, [setAlertSettings]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, phone, alertSettings }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save profile");
        return;
      }
      setMessage("Profile saved. Alerts will use this email and phone.");
    } catch {
      setMessage("Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const testAlert = async (channel: "email" | "sms" | "both") => {
    setTesting(channel);
    setTestResult(null);
    try {
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (data.ok) {
        const sent = (data.results as { channel: string; sent: boolean; error?: string }[])
          .filter((r) => r.sent)
          .map((r) => `${r.channel}${r.error ? ` (${r.error})` : ""}`)
          .join(", ");
        setTestResult(`Test sent via: ${sent || "none"}`);
      } else {
        const errors = (data.results as { channel: string; error?: string }[])
          .filter((r) => r.error)
          .map((r) => `${r.channel}: ${r.error}`)
          .join(" · ");
        const hints = (data.twilioHints as string[] | undefined)?.[0];
        setTestResult(errors || hints || "Test failed — check provider config in .env");
      }
    } catch {
      setTestResult("Could not reach test API");
    } finally {
      setTesting(null);
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="text-sm text-[var(--muted)]">
          Contact info used for email and SMS trade alerts
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/20">
              <User className="h-8 w-8 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-medium">Contact Details</h2>
              <p className="text-sm text-[var(--muted)]">Saved locally in user.local.json</p>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Display name" value={displayName} onChange={setDisplayName} />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              placeholder="you@example.com"
              icon={Mail}
            />
            <Field
              label="Phone (SMS)"
              value={phone}
              onChange={setPhone}
              type="tel"
              placeholder="+1 555 123 4567"
              icon={Phone}
              hint="Use E.164 format (+1...) for Twilio"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Profile"}
          </button>

          {message && (
            <p
              className={`mt-3 text-sm ${message.includes("saved") ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
              <Bell className="h-5 w-5 text-[var(--accent)]" />
              Alert Providers
            </h2>
            <dl className="space-y-3 text-sm">
              <ProviderRow
                label="Email provider"
                value={providers.email}
                configured={providers.email !== "none"}
              />
              <ProviderRow
                label="SMS provider"
                value={providers.sms}
                configured={providers.sms !== "none"}
              />
            </dl>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Configure RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_* for email. Configure
              TWILIO_* for SMS in <code>apps/web/.env</code>, then restart the dev server.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => testAlert("email")}
                disabled={!email || testing !== null || providers.email === "none"}
                className="rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
              >
                {testing === "email" ? "Sending..." : "Test Email"}
              </button>
              <button
                onClick={() => testAlert("sms")}
                disabled={!phone || testing !== null || providers.sms === "none"}
                className="rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
              >
                {testing === "sms" ? "Sending..." : "Test SMS"}
              </button>
              <button
                onClick={() => testAlert("both")}
                disabled={testing !== null || providers.email === "none"}
                className="rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
              >
                {testing === "both" ? "Sending..." : "Test Both"}
              </button>
            </div>

            {testResult && (
              <p
                className={`mt-3 text-sm ${testResult.includes("sent") ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
              >
                {testResult}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 text-lg font-medium">Trading Preferences</h2>
            <dl className="space-y-3 text-sm">
              <PrefRow label="Default Mode" value={mode} />
              <PrefRow label="Trading Style" value={tradingStyle} />
              <PrefRow label="Max Consecutive Losses" value={String(riskSettings.maxConsecutiveLosses)} />
              <PrefRow label="Risk Range" value={`${riskSettings.riskPercentMin}% – ${riskSettings.riskPercentMax}%`} />
              <PrefRow label="Email Alerts" value={alertSettings.emailEnabled ? "On" : "Off"} />
              <PrefRow label="SMS Alerts" value={alertSettings.smsEnabled ? "On" : "Off"} />
            </dl>
          </div>
        </div>
      </div>

      <TradingScheduleSection />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs text-[var(--muted)]">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
      {hint && <p className="mt-1 text-[10px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function ProviderRow({
  label,
  value,
  configured,
}: {
  label: string;
  value: string;
  configured: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="flex items-center gap-1 font-medium capitalize">
        {configured ? (
          <CheckCircle className="h-3 w-3 text-[var(--accent)]" />
        ) : (
          <AlertCircle className="h-3 w-3 text-amber-400" />
        )}
        {value}
      </dd>
    </div>
  );
}

function PrefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}
