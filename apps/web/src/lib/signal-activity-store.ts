import type { Signal } from "@wicksense/core";
import type { SignalActivityKind, SignalActivityRecord } from "@wicksense/core";

const STORAGE_KEY = "wicksense-signal-activity";
const MAX_RECORDS = 5000;
export const SIGNAL_ACTIVITY_EVENT = "wicksense-signal-activity";

function activityKey(signalId: string, kind: SignalActivityKind): string {
  return `${kind}:${signalId}`;
}

function notifyActivityChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SIGNAL_ACTIVITY_EVENT));
}

export function loadSignalActivities(): SignalActivityRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SignalActivityRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSignalActivities(records: SignalActivityRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
    notifyActivityChanged();
  } catch {
    // ignore quota / private mode
  }
}

export function recordSignalActivity(
  signal: Pick<Signal, "id" | "strategy" | "symbol" | "side" | "time">,
  kind: SignalActivityKind,
  options?: { reason?: string; chartSlot?: string; mode?: string; recordedAt?: number }
): boolean {
  const records = loadSignalActivities();
  const key = activityKey(signal.id, kind);
  if (records.some((record) => activityKey(record.signalId, record.kind) === key)) {
    return false;
  }

  const recordedAt = options?.recordedAt ?? Date.now();

  records.push({
    signalId: signal.id,
    strategy: signal.strategy,
    symbol: signal.symbol,
    side: signal.side,
    time: signal.time,
    kind,
    reason: options?.reason,
    chartSlot: options?.chartSlot,
    mode: options?.mode,
    recordedAt,
  });
  persistSignalActivities(records);
  return true;
}

export function recordSignalActivities(
  signals: Signal[],
  kind: SignalActivityKind,
  options?: { reason?: string; chartSlot?: string; mode?: string; recordedAt?: number }
): number {
  let added = 0;
  for (const signal of signals) {
    if (recordSignalActivity(signal, kind, options)) added++;
  }
  return added;
}

/** Hydrate generated events from in-memory signal history after refresh. */
export function bootstrapGeneratedFromSignals(signals: Signal[]): void {
  recordSignalActivities(signals, "generated", { recordedAt: Date.now() });
}

export function signalEventTime(record: SignalActivityRecord): number {
  return record.recordedAt ?? (record.time > 1_000_000_000_000 ? record.time : record.time * 1000);
}
