"use client";

import { useEffect, useRef, useState } from "react";
import type { TradingScheduleSettings, WeekdayKey } from "@wicksense/core";
import { DEFAULT_TRADING_SCHEDULE, evaluateTradingSchedule } from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { saveTradingSchedule } from "@/lib/trading-schedule-client";
import { Clock, Save } from "lucide-react";

const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

export function TradingScheduleSection() {
  const [schedule, setSchedule] = useState<TradingScheduleSettings>({
    ...DEFAULT_TRADING_SCHEDULE,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statusNow, setStatusNow] = useState<string>("");
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    fetch("/api/settings/trading-schedule", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSchedule(data.settings);
          lastSavedJsonRef.current = JSON.stringify(data.settings);
          useAppStore.getState().setTradingSchedule(data.settings);
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
        hydratedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || loading) return;

    const json = JSON.stringify(schedule);
    if (json === lastSavedJsonRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        setSaving(true);
        setMessage(null);
        const result = await saveTradingSchedule(schedule);
        if (result.ok) {
          lastSavedJsonRef.current = json;
          setMessage("Trading schedule saved.");
        } else {
          setMessage(result.error ?? "Failed to save trading schedule");
        }
        setSaving(false);
      })();
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [schedule, loading]);

  useEffect(() => {
    const update = () => {
      const result = evaluateTradingSchedule(schedule);
      setStatusNow(result.allowed ? "Trading allowed now" : result.reason ?? "Trading blocked now");
    };
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [schedule]);

  const disabled = schedule.unrestricted;

  const patch = (updates: Partial<TradingScheduleSettings>) => {
    setSchedule((prev) => ({ ...prev, ...updates }));
  };

  const toggleDay = (key: WeekdayKey) => {
    setSchedule((prev) => ({
      ...prev,
      days: { ...prev.days, [key]: !prev.days[key] },
    }));
  };

  const save = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveTradingSchedule(schedule);
      if (!result.ok) {
        setMessage(result.error ?? "Failed to save — server may be busy, try again");
        return;
      }
      lastSavedJsonRef.current = JSON.stringify(schedule);
      setMessage("Trading schedule saved.");
    } catch {
      setMessage("Save timed out — server busy. Stop extra dev servers and retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Clock className="h-5 w-5 text-[var(--accent)]" />
            Allowed Trading Schedule
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Manual and auto trades are blocked outside these hours (US Eastern Time). Changes save
            automatically. Stored in <code>trading-schedule.local.json</code>.
          </p>
        </div>
        <p
          className={`text-xs font-medium ${
            statusNow.includes("allowed") ? "text-[var(--accent)]" : "text-[var(--danger)]"
          }`}
        >
          {loading ? "Loading…" : statusNow}
        </p>
      </div>

      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={schedule.unrestricted}
          onChange={(e) => patch({ unrestricted: e.target.checked })}
          className="rounded border-[var(--card-border)]"
        />
        <span className="font-medium">Unrestricted (24/7 trading)</span>
      </label>
      {schedule.unrestricted && (
        <p className="mb-4 text-xs text-amber-400">
          Unrestricted is on — day/time fields below are ignored. Uncheck to set hours.
        </p>
      )}

      <div className={`space-y-5 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">Trading days</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  schedule.days[key]
                    ? "bg-[var(--accent)] text-black"
                    : "bg-white/5 text-[var(--muted)] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">Start time (ET)</label>
            <input
              type="time"
              value={schedule.startTime}
              onChange={(e) => patch({ startTime: e.target.value })}
              className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">End time (ET)</label>
            <input
              type="time"
              value={schedule.endTime}
              onChange={(e) => patch({ endTime: e.target.value })}
              className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--muted)]">Trading stops when this time is reached (e.g. 16:00 = no trades at or after 4:00 PM).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScheduleCheckbox
            label="Allow after hours"
            hint="Pre-market 4:00–9:30 AM ET and post-market 4:00–8:00 PM ET"
            checked={schedule.allowAfterHours}
            onChange={(allowAfterHours) => patch({ allowAfterHours })}
          />
          <ScheduleCheckbox
            label="Allow overnight"
            hint="8:00 PM – 4:00 AM ET"
            checked={schedule.allowOvernight}
            onChange={(allowOvernight) => patch({ allowOvernight })}
          />
        </div>
      </div>

      <button
        onClick={() => void save()}
        disabled={saving || loading}
        className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Now"}
      </button>

      {message && (
        <p
          className={`mt-3 text-sm ${
            message.includes("saved") ? "text-[var(--accent)]" : "text-[var(--danger)]"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function ScheduleCheckbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-[var(--card-border)] bg-white/5 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-[var(--card-border)]"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{hint}</span>
      </span>
    </label>
  );
}
