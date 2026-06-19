"use client";

import { useEffect, useState } from "react";
import type { ScannerResult } from "@wicksense/core";
import { useAppStore } from "@/lib/store";
import { ScanSearch, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

export default function ScannerPage() {
  const { tradingStyle, presets, activePresetId } = useAppStore();
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMeta, setScanMeta] = useState<{ scanned: number; withData: number; matches: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];

  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/scanner/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyIds: activePreset?.strategies ?? ["ema-crossover", "wick-rejection", "rsi-reversal"],
          style: tradingStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Scan failed");
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
      setScanMeta(data.meta ?? null);
    } catch {
      setScanError("Could not reach scanner API. Is the dev server running?");
      setResults([]);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetch("/api/presets").then((r) => r.json()).then((d) => {
      const presets = d.presets ?? [];
      useAppStore.getState().setPresets(presets);
      if (presets[0] && !useAppStore.getState().activePresetId) {
        useAppStore.getState().setActivePresetId(presets[0].id);
      }
    });
  }, []);

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Market Scanner</h1>
          <p className="text-sm text-[var(--muted)]">
            Scan watchlist for {tradingStyle} trading opportunities
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          <ScanSearch className="h-4 w-4" />
          {scanning ? "Scanning..." : "Run Scan"}
        </button>
      </header>

      {scanMeta && (
        <p className="mb-4 text-sm text-[var(--muted)]">
          Scanned {scanMeta.scanned} symbols · {scanMeta.withData} with data · {scanMeta.matches} signal{scanMeta.matches === 1 ? "" : "s"} found
          {activePreset ? ` · Preset: ${activePreset.name}` : ""}
        </p>
      )}

      {scanError && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-2 text-sm text-[var(--danger)]">
          {scanError}
        </p>
      )}

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
              <th className="p-3">Symbol</th>
              <th className="p-3">Signal</th>
              <th className="p-3">Strategy</th>
              <th className="p-3">Confidence</th>
              <th className="p-3">Price</th>
              <th className="p-3">Change</th>
              <th className="p-3">Volume</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--muted)]">
                  {scanMeta
                    ? "No matching signals in the last 20 bars. Try switching Day/Swing style or run again."
                    : "Run a scan to find opportunities across the watchlist"}
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr key={r.symbol} className="border-b border-[var(--card-border)]/50 hover:bg-white/5">
                  <td className="p-3 font-medium">{r.symbol}</td>
                  <td className="p-3">
                    <span className={`flex items-center gap-1 capitalize ${r.signal.side === "buy" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                      {r.signal.side === "buy" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                      {r.signal.side}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--muted)]">{r.signal.strategy}</td>
                  <td className="p-3">{(r.signal.confidence * 100).toFixed(0)}%</td>
                  <td className="p-3">${r.signal.price.toFixed(2)}</td>
                  <td className={`p-3 ${r.changePercent >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                    {r.changePercent >= 0 ? "+" : ""}{r.changePercent.toFixed(2)}%
                  </td>
                  <td className="p-3 text-[var(--muted)]">{(r.volume / 1000).toFixed(0)}K</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
