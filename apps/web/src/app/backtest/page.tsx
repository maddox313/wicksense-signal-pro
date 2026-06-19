"use client";

import { useEffect, useState } from "react";
import type { BacktestResult, StrategyPreset } from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { FlaskConical, Sparkles } from "lucide-react";

export default function BacktestPage() {
  const { symbol, presets, activePresetId, setPresets, setActivePresetId } = useAppStore();
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [btSymbol, setBtSymbol] = useState(symbol);

  useEffect(() => {
    fetch("/api/presets").then((r) => r.json()).then((d) => {
      setPresets(d.presets ?? []);
      if (d.presets?.[0]) setActivePresetId(d.presets[0].id);
    });
  }, [setPresets, setActivePresetId]);

  const runBacktest = async () => {
    setRunning(true);
    try {
      const preset = presets.find((p) => p.id === activePresetId);
      if (!preset) return;
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: btSymbol, preset }),
      });
      const data = await res.json();
      setResult(data.result ?? null);
    } finally {
      setRunning(false);
    }
  };

  const generateAiPreset = async (style: "day" | "swing") => {
    const res = await fetch("/api/presets/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style }),
    });
    const data = await res.json();
    if (data.preset) {
      setPresets([...presets, data.preset]);
      setActivePresetId(data.preset.id);
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Backtest Engine</h1>
        <p className="text-sm text-[var(--muted)]">
          Test strategies on historical data before going live
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Symbol</label>
          <input
            value={btSymbol}
            onChange={(e) => setBtSymbol(e.target.value.toUpperCase())}
            className="rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm uppercase outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Preset</label>
          <select
            value={activePresetId}
            onChange={(e) => setActivePresetId(e.target.value)}
            className="rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm outline-none"
          >
            {presets.map((p: StrategyPreset) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.isAiGenerated ? "(AI)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runBacktest}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" />
          {running ? "Running..." : "Run Backtest"}
        </button>
        <button
          onClick={() => generateAiPreset("day")}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          AI Day Preset
        </button>
        <button
          onClick={() => generateAiPreset("swing")}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          AI Swing Preset
        </button>
      </div>

      {result && (
        <div className="grid grid-cols-4 gap-4">
          <Metric label="Total Trades" value={String(result.stats.totalTrades)} />
          <Metric label="Win Rate" value={`${result.stats.winRate.toFixed(1)}%`} />
          <Metric label="Total P&L" value={`$${result.stats.totalPnl.toFixed(2)}`} />
          <Metric label="Profit Factor" value={result.stats.profitFactor.toFixed(2)} />
          <Metric label="Avg Win" value={`$${result.stats.avgWin.toFixed(2)}`} />
          <Metric label="Avg Loss" value={`$${result.stats.avgLoss.toFixed(2)}`} />
          <Metric label="Max Drawdown" value={`$${result.stats.maxDrawdown.toFixed(2)}`} />
          <Metric
            label="Safety Stop"
            value={result.stats.safetyStopTriggered ? "Triggered" : "Not triggered"}
          />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
