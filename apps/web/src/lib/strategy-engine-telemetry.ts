import type { Signal } from "@wicksense/core";

const STORAGE_KEY = "wicksense-engine-telemetry";
export const ENGINE_TELEMETRY_EVENT = "wicksense-engine-telemetry";
const ENGINE_POLL_MS = 30_000;

export interface SlotScanRecord {
  at: number;
  symbol: string;
  timeframe: string;
  chartSlot: string;
  barCount: number;
  presetId: string | null;
  presetStrategies: string[];
  barSignalCount: number;
  strategiesFired: string[];
  pickedStrategy: string | null;
  outcome: "no_bars" | "no_preset" | "detect_error" | "no_signal" | "signal_seen" | "signal_traded";
  detail?: string;
}

export interface StrategyTelemetrySlice {
  totalGeneratedSinceStartup: number;
  lastSignalAt: number | null;
  lastRejectedAt: number | null;
  lastConvertedAt: number | null;
}

export interface EngineTelemetryState {
  startupAt: number;
  lastCycleStartedAt: number | null;
  lastCycleCompletedAt: number | null;
  cycleInProgress: boolean;
  totalCycles: number;
  lastDetectError: string | null;
  lastSlotScans: SlotScanRecord[];
  perStrategy: Record<string, StrategyTelemetrySlice>;
}

function emptyStrategySlice(): StrategyTelemetrySlice {
  return {
    totalGeneratedSinceStartup: 0,
    lastSignalAt: null,
    lastRejectedAt: null,
    lastConvertedAt: null,
  };
}

function defaultState(): EngineTelemetryState {
  return {
    startupAt: Date.now(),
    lastCycleStartedAt: null,
    lastCycleCompletedAt: null,
    cycleInProgress: false,
    totalCycles: 0,
    lastDetectError: null,
    lastSlotScans: [],
    perStrategy: {},
  };
}

function notifyTelemetryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ENGINE_TELEMETRY_EVENT));
}

export function loadEngineTelemetry(): EngineTelemetryState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as EngineTelemetryState;
    return { ...defaultState(), ...parsed, perStrategy: parsed.perStrategy ?? {} };
  } catch {
    return defaultState();
  }
}

function saveEngineTelemetry(state: EngineTelemetryState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    notifyTelemetryChanged();
  } catch {
    // ignore
  }
}

function touchStrategy(
  state: EngineTelemetryState,
  strategy: string,
  patch: Partial<StrategyTelemetrySlice>
): void {
  const current = state.perStrategy[strategy] ?? emptyStrategySlice();
  state.perStrategy[strategy] = { ...current, ...patch };
}

export function markEngineCycleStart(): void {
  const state = loadEngineTelemetry();
  state.cycleInProgress = true;
  state.lastCycleStartedAt = Date.now();
  saveEngineTelemetry(state);
}

export function markEngineCycleComplete(): void {
  const state = loadEngineTelemetry();
  state.cycleInProgress = false;
  state.lastCycleCompletedAt = Date.now();
  state.totalCycles += 1;
  saveEngineTelemetry(state);
}

export function recordStrategySignalSeen(strategy: string): void {
  const state = loadEngineTelemetry();
  const now = Date.now();
  const current = state.perStrategy[strategy] ?? emptyStrategySlice();
  touchStrategy(state, strategy, {
    lastSignalAt: now,
    totalGeneratedSinceStartup: current.totalGeneratedSinceStartup + 1,
  });
  saveEngineTelemetry(state);
}

export function recordStrategyRejected(strategy: string): void {
  const state = loadEngineTelemetry();
  touchStrategy(state, strategy, { lastRejectedAt: Date.now() });
  saveEngineTelemetry(state);
}

export function recordStrategyConverted(strategy: string): void {
  const state = loadEngineTelemetry();
  touchStrategy(state, strategy, { lastConvertedAt: Date.now() });
  saveEngineTelemetry(state);
}

export function recordSlotScan(scan: Omit<SlotScanRecord, "at">): void {
  const state = loadEngineTelemetry();
  const entry: SlotScanRecord = { ...scan, at: Date.now() };
  state.lastSlotScans = [entry, ...state.lastSlotScans.filter((s) => s.chartSlot !== scan.chartSlot)].slice(
    0,
    8
  );

  for (const strategy of scan.strategiesFired) {
    const current = state.perStrategy[strategy] ?? emptyStrategySlice();
    touchStrategy(state, strategy, {
      lastSignalAt: Date.now(),
      totalGeneratedSinceStartup: current.totalGeneratedSinceStartup + 1,
    });
  }

  if (scan.pickedStrategy && !scan.strategiesFired.includes(scan.pickedStrategy)) {
    const current = state.perStrategy[scan.pickedStrategy] ?? emptyStrategySlice();
    touchStrategy(state, scan.pickedStrategy, {
      lastSignalAt: Date.now(),
      totalGeneratedSinceStartup: current.totalGeneratedSinceStartup + 1,
    });
  }

  saveEngineTelemetry(state);
}

export function recordDetectError(message: string): void {
  const state = loadEngineTelemetry();
  state.lastDetectError = message;
  saveEngineTelemetry(state);
}

export function clearDetectError(): void {
  const state = loadEngineTelemetry();
  if (!state.lastDetectError) return;
  state.lastDetectError = null;
  saveEngineTelemetry(state);
}

export function isEngineCurrentlyRunning(): boolean {
  const state = loadEngineTelemetry();
  if (state.cycleInProgress) return true;
  if (!state.lastCycleCompletedAt) return false;
  return Date.now() - state.lastCycleCompletedAt <= ENGINE_POLL_MS * 2 + 5000;
}

export function isStrategyInActivePreset(
  strategyId: string,
  presetStrategyIds: string[]
): boolean {
  return presetStrategyIds.includes(strategyId);
}

export function mergeStrategyTelemetry(
  strategyId: string,
  presetStrategyIds: string[],
  telemetry: EngineTelemetryState
): {
  totalGeneratedSinceStartup: number;
  lastSignalAt: number | null;
  lastRejectedAt: number | null;
  lastConvertedAt: number | null;
  engineActive: boolean;
} {
  const slice = telemetry.perStrategy[strategyId] ?? emptyStrategySlice();
  const inPreset = isStrategyInActivePreset(strategyId, presetStrategyIds);
  return {
    totalGeneratedSinceStartup: slice.totalGeneratedSinceStartup,
    lastSignalAt: slice.lastSignalAt,
    lastRejectedAt: slice.lastRejectedAt,
    lastConvertedAt: slice.lastConvertedAt,
    engineActive: inPreset && isEngineCurrentlyRunning(),
  };
}

export function noteBarSignals(signals: Signal[]): void {
  const state = loadEngineTelemetry();
  const now = Date.now();
  for (const signal of signals) {
    const current = state.perStrategy[signal.strategy] ?? emptyStrategySlice();
    touchStrategy(state, signal.strategy, {
      lastSignalAt: now,
      totalGeneratedSinceStartup: current.totalGeneratedSinceStartup + 1,
    });
  }
  saveEngineTelemetry(state);
}
