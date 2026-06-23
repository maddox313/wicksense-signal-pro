"use client";

import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { syncTradesWithAlpaca } from "@/lib/sync-client";

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

function totalImported(
  paper: ReturnType<typeof useAppStore.getState>["syncStatus"]["paper"],
  live: ReturnType<typeof useAppStore.getState>["syncStatus"]["live"]
) {
  return (paper?.imported ?? 0) + (live?.imported ?? 0);
}

export function SyncStatusIndicator() {
  const { syncStatus } = useAppStore();
  const { loading, lastSyncTime, paper, live, error } = syncStatus;
  const imported = totalImported(paper, live);
  const hasError = Boolean(error);

  return (
    <div className="border-t border-[var(--card-border)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Alpaca Sync
        </p>
        <button
          type="button"
          onClick={() => void syncTradesWithAlpaca()}
          disabled={loading}
          className="rounded p-1 text-[var(--muted)] hover:bg-white/5 hover:text-white disabled:opacity-40"
          title="Sync now"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-1.5 text-[10px] text-[var(--muted)]">
        <div className="flex items-center gap-1.5">
          {hasError ? (
            <AlertCircle className="h-3 w-3 shrink-0 text-[var(--danger)]" />
          ) : (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-[var(--accent)]" />
          )}
          <span>Last: {loading ? "Syncing…" : formatSyncTime(lastSyncTime)}</span>
        </div>

        <p>
          Imported: <span className="text-white">{imported}</span>
          {(!paper?.skipped || !live?.skipped) && (
            <span className="ml-1">
              (paper {paper?.imported ?? 0}, live {live?.imported ?? 0})
            </span>
          )}
        </p>

        {(paper?.quantityUpdated || live?.quantityUpdated) ? (
          <p>
            Updated: {(paper?.quantityUpdated ?? 0) + (live?.quantityUpdated ?? 0)}
          </p>
        ) : null}

        {hasError && (
          <p className="leading-snug text-[var(--danger)]">{error}</p>
        )}

        {!hasError && paper?.skipped && live?.skipped && (
          <p className="leading-snug">No Alpaca credentials configured</p>
        )}
      </div>
    </div>
  );
}
