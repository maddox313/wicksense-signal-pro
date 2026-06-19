"use client";

import { useAppStore } from "@/lib/store";
import { ArrowUpCircle, ArrowDownCircle, Activity } from "lucide-react";

export function SignalPanel() {
  const { signals, symbol } = useAppStore();

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--accent)]" />
        <h3 className="text-sm font-medium">Live Signals — {symbol}</h3>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {signals.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No signals yet. Run analysis or enable auto trade.</p>
        ) : (
          signals.slice(0, 10).map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-2 rounded-lg bg-white/5 p-2"
            >
              {s.side === "buy" ? (
                <ArrowUpCircle className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              ) : (
                <ArrowDownCircle className="h-4 w-4 shrink-0 text-[var(--danger)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium capitalize ${s.side === "buy" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                    {s.side}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[10px] text-[var(--muted)]">{s.strategy}</p>
                <p className="text-[10px] text-white/70">{s.reason}</p>
                <p className="text-[10px] text-[var(--muted)]">${s.price.toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
