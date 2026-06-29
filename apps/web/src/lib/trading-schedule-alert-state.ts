import fs from "fs";
import path from "path";

export type ScheduleAlertEvent = "started" | "stopped";

interface SessionAlertState {
  lastStartedDay?: string;
  lastStoppedDay?: string;
  actionRequiredDays?: Record<string, string>;
}

const STATE_PATH = path.join(process.cwd(), "trading-schedule-alert-state.local.json");

function loadState(): SessionAlertState {
  try {
    if (!fs.existsSync(STATE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as SessionAlertState;
  } catch {
    return {};
  }
}

function saveState(state: SessionAlertState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function getEasternDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shouldSendScheduleAlert(event: ScheduleAlertEvent, date: Date = new Date()): boolean {
  const dayKey = getEasternDayKey(date);
  const state = loadState();
  const field = event === "started" ? "lastStartedDay" : "lastStoppedDay";
  return state[field] !== dayKey;
}

export function markScheduleAlertSent(event: ScheduleAlertEvent, date: Date = new Date()): void {
  const dayKey = getEasternDayKey(date);
  const state = loadState();
  if (event === "started") {
    state.lastStartedDay = dayKey;
  } else {
    state.lastStoppedDay = dayKey;
  }
  saveState(state);
}

export function shouldSendActionRequiredAlert(reasonCode: string, date: Date = new Date()): boolean {
  const dayKey = getEasternDayKey(date);
  const state = loadState();
  const sentDay = state.actionRequiredDays?.[reasonCode];
  return sentDay !== dayKey;
}

export function markActionRequiredAlertSent(reasonCode: string, date: Date = new Date()): void {
  const dayKey = getEasternDayKey(date);
  const state = loadState();
  state.actionRequiredDays = { ...state.actionRequiredDays, [reasonCode]: dayKey };
  saveState(state);
}
