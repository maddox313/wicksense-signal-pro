import fs from "fs";
import type {
  EngineTelemetryState,
  SlotScanRecord,
  StrategyTelemetrySlice,
} from "@/lib/strategy-engine-telemetry";

import { dataFile } from "@/lib/data-paths";

const TELEMETRY_PATH = dataFile("engine-telemetry.local.json");
const ENGINE_POLL_MS = 30_000;

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

function touchStrategy(
  state: EngineTelemetryState,
  strategy: string,
  patch: Partial<StrategyTelemetrySlice>
): void {
  const current = state.perStrategy[strategy] ?? emptyStrategySlice();
  state.perStrategy[strategy] = { ...current, ...patch };
}

export function loadServerEngineTelemetry(): EngineTelemetryState {
  try {
    if (!fs.existsSync(TELEMETRY_PATH)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(TELEMETRY_PATH, "utf8")) as EngineTelemetryState;
    return { ...defaultState(), ...parsed, perStrategy: parsed.perStrategy ?? {} };
  } catch {
    return defaultState();
  }
}

function saveServerEngineTelemetry(state: EngineTelemetryState): void {
  fs.writeFileSync(TELEMETRY_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function markServerEngineCycleStart(): void {
  const state = loadServerEngineTelemetry();
  state.cycleInProgress = true;
  state.lastCycleStartedAt = Date.now();
  saveServerEngineTelemetry(state);
}

export function markServerEngineCycleComplete(): void {
  const state = loadServerEngineTelemetry();
  state.cycleInProgress = false;
  state.lastCycleCompletedAt = Date.now();
  state.totalCycles += 1;
  saveServerEngineTelemetry(state);
}

export function recordServerSlotScan(scan: Omit<SlotScanRecord, "at">): void {
  const state = loadServerEngineTelemetry();
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

  saveServerEngineTelemetry(state);
}

export function recordServerStrategyRejected(strategy: string): void {
  const state = loadServerEngineTelemetry();
  touchStrategy(state, strategy, { lastRejectedAt: Date.now() });
  saveServerEngineTelemetry(state);
}

export function recordServerStrategyConverted(strategy: string): void {
  const state = loadServerEngineTelemetry();
  touchStrategy(state, strategy, { lastConvertedAt: Date.now() });
  saveServerEngineTelemetry(state);
}

export function recordServerDetectError(message: string): void {
  const state = loadServerEngineTelemetry();
  state.lastDetectError = message;
  saveServerEngineTelemetry(state);
}

export function clearServerDetectError(): void {
  const state = loadServerEngineTelemetry();
  if (!state.lastDetectError) return;
  state.lastDetectError = null;
  saveServerEngineTelemetry(state);
}

export function clearServerScheduleBlockedScans(): void {
  const state = loadServerEngineTelemetry();
  const filtered = state.lastSlotScans.filter((scan) => scan.outcome !== "schedule_blocked");
  if (filtered.length === state.lastSlotScans.length) return;
  state.lastSlotScans = filtered;
  saveServerEngineTelemetry(state);
}

export function recordServerScheduleBlocked(chartSlots: string[], reason?: string): void {
  const state = loadServerEngineTelemetry();
  const at = Date.now();
  const detail = reason ?? "Outside allowed trading hours";
  const blockedScans: SlotScanRecord[] = chartSlots.map((chartSlot) => ({
    at,
    chartSlot,
    symbol: "—",
    timeframe: "—",
    barCount: 0,
    presetId: null,
    presetStrategies: [],
    barSignalCount: 0,
    strategiesFired: [],
    pickedStrategy: null,
    outcome: "schedule_blocked",
    detail,
  }));

  if (blockedScans.length === 0) {
    blockedScans.push({
      at,
      chartSlot: "engine",
      symbol: "—",
      timeframe: "—",
      barCount: 0,
      presetId: null,
      presetStrategies: [],
      barSignalCount: 0,
      strategiesFired: [],
      pickedStrategy: null,
      outcome: "schedule_blocked",
      detail,
    });
  }

  for (const scan of blockedScans) {
    state.lastSlotScans = [
      scan,
      ...state.lastSlotScans.filter((s) => s.chartSlot !== scan.chartSlot),
    ].slice(0, 8);
  }

  saveServerEngineTelemetry(state);
}

export function isServerEngineCurrentlyRunning(): boolean {
  const state = loadServerEngineTelemetry();
  if (state.cycleInProgress) return true;
  if (!state.lastCycleCompletedAt) return false;
  return Date.now() - state.lastCycleCompletedAt <= ENGINE_POLL_MS * 2 + 5000;
}

export function createServerSlotCycleTelemetryHooks() {
  return {
    recordSlotScan: (scan: Record<string, unknown>) =>
      recordServerSlotScan(scan as Omit<SlotScanRecord, "at">),
    recordSignalRejected: (_signal: { strategy: string }, reason: string) => {
      void reason;
      recordServerStrategyRejected(_signal.strategy);
    },
    recordSignalConverted: (signal: { strategy: string }) =>
      recordServerStrategyConverted(signal.strategy),
    recordDetectError: recordServerDetectError,
    clearDetectError: clearServerDetectError,
  };
}

export const SERVER_ENGINE_TELEMETRY_PATH = TELEMETRY_PATH;
