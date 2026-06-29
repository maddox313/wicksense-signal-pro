"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import type { RiskSettings, AlertSettings } from "@wicksense/core";
import { CheckCircle, AlertCircle } from "lucide-react";

export default function SettingsPage() {
  const { riskSettings, alertSettings, setRiskSettings, setAlertSettings } = useAppStore();
  const [brokerStatus, setBrokerStatus] = useState<{
    paperConfigured: boolean;
    liveConfigured: boolean;
    paperKeyPreview: string;
    liveKeyPreview: string;
    source: string;
  } | null>(null);
  const [paperApiKey, setPaperApiKey] = useState("");
  const [paperSecretKey, setPaperSecretKey] = useState("");
  const [liveApiKey, setLiveApiKey] = useState("");
  const [liveSecretKey, setLiveSecretKey] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/broker")
      .then((r) => r.json())
      .then(setBrokerStatus)
      .catch(() => {});
    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.alertSettings) setAlertSettings(data.alertSettings);
      })
      .catch(() => {});
  }, [setAlertSettings]);

  const persistAlertSettings = async (next: AlertSettings) => {
    setAlertSettings(next);
    try {
      await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertSettings: next }),
      });
    } catch {
      // keep local state even if persist fails
    }
  };

  const saveBroker = async (type: "paper" | "live") => {
    setSaving(true);
    setSaveMessage(null);
    const payload =
      type === "paper"
        ? { paperApiKey, paperSecretKey }
        : { liveApiKey, liveSecretKey };
    try {
      const res = await fetch("/api/settings/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMessage(data.error ?? "Failed to save keys");
        return;
      }
      setSaveMessage(
        `${type === "paper" ? "Paper" : "Live"} Alpaca keys saved. Check Account page for synced balance.`
      );
      if (type === "paper") {
        setPaperApiKey("");
        setPaperSecretKey("");
      } else {
        setLiveApiKey("");
        setLiveSecretKey("");
      }
      setBrokerStatus(data);
    } catch {
      setSaveMessage("Could not save keys. Is the dev server running?");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/broker/test");
      const data = await res.json();
      if (data.ok) {
        setTestResult(`✓ ${data.message} (${data.barCount} bars)`);
      } else {
        setTestResult(`✗ ${data.error ?? "Connection failed"}${data.status ? ` (${data.status})` : ""}`);
      }
    } catch {
      setTestResult("✗ Could not reach test API");
    } finally {
      setTesting(false);
    }
  };

  const updateRisk = (key: keyof RiskSettings, value: number) => {
    setRiskSettings({ ...riskSettings, [key]: value });
  };

  const updateAlert = (key: keyof AlertSettings, value: boolean) => {
    persistAlertSettings({ ...alertSettings, [key]: value });
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--muted)]">Risk management, alerts, and broker configuration</p>
      </header>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 text-lg font-medium">Risk Management</h2>
          <div className="space-y-4">
            <NumberInput label="Max Consecutive Losses (Safety Stop)" value={riskSettings.maxConsecutiveLosses} onChange={(v) => updateRisk("maxConsecutiveLosses", v)} min={1} max={20} />
            <NumberInput label="Position Size Min (%)" value={riskSettings.positionSizeMinPercent} onChange={(v) => updateRisk("positionSizeMinPercent", v)} min={0.1} max={50} step={0.1} />
            <NumberInput label="Position Size Max (%)" value={riskSettings.positionSizeMaxPercent} onChange={(v) => updateRisk("positionSizeMaxPercent", v)} min={0.1} max={100} step={0.1} />
            <NumberInput label="Risk Percent Min" value={riskSettings.riskPercentMin} onChange={(v) => updateRisk("riskPercentMin", v)} min={0.1} max={10} step={0.1} />
            <NumberInput label="Risk Percent Max" value={riskSettings.riskPercentMax} onChange={(v) => updateRisk("riskPercentMax", v)} min={0.1} max={10} step={0.1} />
            <NumberInput label="Max Open Positions" value={riskSettings.maxOpenPositions} onChange={(v) => updateRisk("maxOpenPositions", v)} min={1} max={50} />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 text-lg font-medium">Alerts & Notifications</h2>
          <p className="mb-4 text-xs text-[var(--muted)]">
            Set your email and phone on the{" "}
            <Link href="/profile" className="text-[var(--accent)] hover:underline">
              Profile
            </Link>{" "}
            page. Provider API keys go in <code>.env</code>.
          </p>
          <div className="space-y-3">
            <Toggle label="Push Notifications" checked={alertSettings.pushEnabled} onChange={(v) => updateAlert("pushEnabled", v)} />
            <Toggle label="Email Alerts" checked={alertSettings.emailEnabled} onChange={(v) => updateAlert("emailEnabled", v)} />
            <Toggle label="SMS Alerts" checked={alertSettings.smsEnabled} onChange={(v) => updateAlert("smsEnabled", v)} />
            <hr className="border-[var(--card-border)]" />
            <Toggle label="Alert on Buy" checked={alertSettings.onBuy} onChange={(v) => updateAlert("onBuy", v)} />
            <Toggle label="Alert on Sell" checked={alertSettings.onSell} onChange={(v) => updateAlert("onSell", v)} />
            <Toggle label="Alert on Stop Loss" checked={alertSettings.onStopLoss} onChange={(v) => updateAlert("onStopLoss", v)} />
            <Toggle label="Alert on Safety Stop" checked={alertSettings.onSafetyStop} onChange={(v) => updateAlert("onSafetyStop", v)} />
            <Toggle label="Alert when Trading Starts" checked={alertSettings.onTradingStart ?? true} onChange={(v) => updateAlert("onTradingStart", v)} />
            <Toggle label="Alert when Trading Stops" checked={alertSettings.onTradingStop ?? true} onChange={(v) => updateAlert("onTradingStop", v)} />
            <Toggle label="Alert when Action Required" checked={alertSettings.onActionRequired ?? true} onChange={(v) => updateAlert("onActionRequired", v)} />
          </div>
        </section>

        <section className="col-span-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 text-lg font-medium">Broker API (Alpaca)</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Save separate paper and live keys to sync balances on the{" "}
            <Link href="/account" className="text-[var(--accent)] hover:underline">
              Account
            </Link>{" "}
            page. Keys are stored locally in <code className="text-xs">broker.local.json</code>.
          </p>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-[var(--card-border)] bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Paper account</p>
              {brokerStatus === null ? (
                <p className="mt-1 text-sm text-[var(--muted)]">Checking...</p>
              ) : brokerStatus.paperConfigured ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-[var(--accent)]">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Connected — {brokerStatus.paperKeyPreview}
                </p>
              ) : (
                <p className="mt-1 flex items-center gap-2 text-sm text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Not configured
                </p>
              )}
            </div>
            <div className="rounded-lg border border-[var(--card-border)] bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Live account</p>
              {brokerStatus === null ? (
                <p className="mt-1 text-sm text-[var(--muted)]">Checking...</p>
              ) : brokerStatus.liveConfigured ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-[var(--accent)]">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Connected — {brokerStatus.liveKeyPreview}
                </p>
              ) : (
                <p className="mt-1 flex items-center gap-2 text-sm text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Not configured
                </p>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium">Paper trading keys</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Paper API Key</label>
                <input
                  type="password"
                  value={paperApiKey}
                  onChange={(e) => setPaperApiKey(e.target.value)}
                  placeholder="PK..."
                  className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Paper Secret Key</label>
                <input
                  type="password"
                  value={paperSecretKey}
                  onChange={(e) => setPaperSecretKey(e.target.value)}
                  placeholder="Secret key"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <button
              onClick={() => saveBroker("paper")}
              disabled={saving || !paperApiKey || !paperSecretKey}
              className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Paper Keys"}
            </button>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium">Live trading keys</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Live API Key</label>
                <input
                  type="password"
                  value={liveApiKey}
                  onChange={(e) => setLiveApiKey(e.target.value)}
                  placeholder="AK..."
                  className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">Live Secret Key</label>
                <input
                  type="password"
                  value={liveSecretKey}
                  onChange={(e) => setLiveSecretKey(e.target.value)}
                  placeholder="Secret key"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <button
              onClick={() => saveBroker("live")}
              disabled={saving || !liveApiKey || !liveSecretKey}
              className="mt-3 rounded-lg border border-[var(--card-border)] bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Live Keys"}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={testConnection}
              disabled={testing || !brokerStatus?.paperConfigured}
              className="rounded-lg border border-[var(--card-border)] bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {testing ? "Testing..." : "Test Paper Connection"}
            </button>
          </div>

          {testResult && (
            <p className={`mt-3 text-sm ${testResult.startsWith("✓") ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
              {testResult}
            </p>
          )}

          {saveMessage && (
            <p className={`mt-3 text-sm ${saveMessage.includes("saved") ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
              {saveMessage}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--muted)]">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--accent)]" : "bg-white/10"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}
