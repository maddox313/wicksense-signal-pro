"use client";

import { useAppStore } from "@/lib/store";
import { ShieldAlert, Play, Pause, Hand, Bot } from "lucide-react";

export function TradeControls() {
  const {
    mode,
    autoTradeEnabled,
    safetyStopActive,
    consecutiveLosses,
    riskSettings,
    setMode,
    setAutoTradeEnabled,
    resetSafetyStop,
  } = useAppStore();

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <h3 className="mb-3 text-sm font-medium">Trade Controls</h3>

      <div className="mb-4 flex gap-2">
        {(["paper", "live", "manual"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 text-xs capitalize transition-colors ${
              mode === m
                ? "bg-[var(--accent)] text-black font-medium"
                : "bg-white/5 text-[var(--muted)] hover:text-white"
            }`}
          >
            {m === "manual" ? "Manual" : m === "paper" ? "Paper" : "Live"}
          </button>
        ))}
      </div>

      <button
        onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
        disabled={mode === "manual" || safetyStopActive}
        className={`mb-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
          autoTradeEnabled
            ? "bg-[var(--accent)] text-black"
            : "bg-white/5 text-white hover:bg-white/10"
        } disabled:opacity-40`}
      >
        {autoTradeEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        Auto Trade {autoTradeEnabled ? "ON" : "OFF"}
      </button>

      <div className="space-y-2 text-xs text-[var(--muted)]">
        <div className="flex items-center gap-2">
          {mode === "manual" ? <Hand className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
          Mode: <span className="text-white capitalize">{mode}</span>
        </div>
        <div>
          Risk: {riskSettings.riskPercentMin}% – {riskSettings.riskPercentMax}%
        </div>
        <div>
          Position: {riskSettings.positionSizeMinPercent}% – {riskSettings.positionSizeMaxPercent}%
        </div>
        <div>
          Loss streak: {consecutiveLosses} / {riskSettings.maxConsecutiveLosses}
        </div>
      </div>

      {safetyStopActive && (
        <div className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3">
          <div className="flex items-center gap-2 text-[var(--danger)]">
            <ShieldAlert className="h-4 w-4" />
            <span className="text-xs font-medium">Safety Stop Active</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Max consecutive losses reached. Auto trading paused.
          </p>
          <button
            onClick={resetSafetyStop}
            className="mt-2 w-full rounded bg-[var(--danger)]/20 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/30"
          >
            Reset Safety Stop
          </button>
        </div>
      )}
    </div>
  );
}
