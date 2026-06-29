import type { TradingScheduleSettings, WeekdayKey } from "./types";

const WEEKDAY_KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const WEEKDAY_TO_KEY: Record<string, WeekdayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

/** US equity session windows in Eastern Time (minutes from midnight). */
const PRE_MARKET_START = 4 * 60;
const PRE_MARKET_END = 9 * 60 + 30;
const POST_MARKET_START = 16 * 60;
const POST_MARKET_END = 20 * 60;
const OVERNIGHT_START = 20 * 60;
const OVERNIGHT_END = 4 * 60;

export interface TradingScheduleEvaluation {
  allowed: boolean;
  reason?: string;
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isBetween(minutes: number, start: number, end: number): boolean {
  if (start <= end) return minutes >= start && minutes <= end;
  return minutes >= start || minutes <= end;
}

function getEasternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  return {
    weekdayKey: WEEKDAY_TO_KEY[weekday] ?? "mon",
    minutes: hour * 60 + minute,
  };
}

export function evaluateTradingSchedule(
  settings: TradingScheduleSettings,
  date: Date = new Date()
): TradingScheduleEvaluation {
  if (settings.unrestricted) {
    return { allowed: true };
  }

  const { weekdayKey, minutes } = getEasternParts(date);

  if (!settings.days[weekdayKey]) {
    return {
      allowed: false,
      reason: "Trading is not allowed on this day (Eastern Time)",
    };
  }

  const start = parseTimeToMinutes(settings.startTime);
  const end = parseTimeToMinutes(settings.endTime);
  if (start === null || end === null) {
    return { allowed: false, reason: "Invalid trading hours configuration" };
  }

  if (isBetween(minutes, start, end)) {
    return { allowed: true };
  }

  if (settings.allowAfterHours) {
    if (isBetween(minutes, PRE_MARKET_START, PRE_MARKET_END)) {
      return { allowed: true };
    }
    if (isBetween(minutes, POST_MARKET_START, POST_MARKET_END)) {
      return { allowed: true };
    }
  }

  if (settings.allowOvernight) {
    if (isBetween(minutes, OVERNIGHT_START, 24 * 60 - 1) || isBetween(minutes, 0, OVERNIGHT_END)) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: "Outside your allowed trading hours (Eastern Time)",
  };
}

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

export function formatTradingScheduleSummary(settings: TradingScheduleSettings): string {
  if (settings.unrestricted) {
    return "Unrestricted (24/7 trading)";
  }

  const activeDays = WEEKDAY_KEYS.filter((key) => settings.days[key])
    .map((key) => WEEKDAY_LABELS[key])
    .join(", ");
  const daysLabel = activeDays || "No days selected";
  let summary = `${settings.startTime}–${settings.endTime} ET on ${daysLabel}`;

  const extras: string[] = [];
  if (settings.allowAfterHours) extras.push("after-hours sessions");
  if (settings.allowOvernight) extras.push("overnight sessions");
  if (extras.length > 0) {
    summary += `; includes ${extras.join(" and ")}`;
  }

  return summary;
}

export function buildScheduleAlertMessage(
  event: "started" | "stopped",
  settings: TradingScheduleSettings,
  evaluation?: TradingScheduleEvaluation
): string {
  const schedule = formatTradingScheduleSummary(settings);

  if (event === "started") {
    return `WickSense has started trading for you. Your trading window is active per your user settings: ${schedule}.`;
  }

  const reason = evaluation?.reason ?? "Outside your allowed trading hours (Eastern Time)";
  return `WickSense has stopped trading for the day. Reason: ${reason}. This is based on your user settings (${schedule}).`;
}

export function normalizeTradingSchedule(
  raw: Partial<TradingScheduleSettings> | undefined
): TradingScheduleSettings {
  const days = {} as TradingScheduleSettings["days"];
  for (const key of WEEKDAY_KEYS) {
    days[key] = Boolean(raw?.days?.[key]);
  }

  if (!WEEKDAY_KEYS.some((key) => days[key])) {
    days.mon = true;
    days.tue = true;
    days.wed = true;
    days.thu = true;
    days.fri = true;
  }

  const startTime =
    typeof raw?.startTime === "string" && parseTimeToMinutes(raw.startTime) !== null
      ? raw.startTime
      : "09:30";
  const endTime =
    typeof raw?.endTime === "string" && parseTimeToMinutes(raw.endTime) !== null
      ? raw.endTime
      : "16:00";

  return {
    unrestricted: Boolean(raw?.unrestricted),
    allowOvernight: Boolean(raw?.allowOvernight),
    allowAfterHours: Boolean(raw?.allowAfterHours),
    days,
    startTime,
    endTime,
  };
}
