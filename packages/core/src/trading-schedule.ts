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

function isWeekday(weekdayKey: WeekdayKey): boolean {
  return weekdayKey !== "sun" && weekdayKey !== "sat";
}

/** Last 5 minutes of regular session — force flat day trades before the close. */
export function isNearUsEquitySessionEnd(date: Date = new Date(), leadMinutes = 5): boolean {
  const { weekdayKey, minutes } = getEasternParts(date);
  if (!isWeekday(weekdayKey)) return false;
  const flatStart = POST_MARKET_START - leadMinutes;
  return minutes >= flatStart && minutes < POST_MARKET_START;
}

/** US regular session: Mon–Fri 9:30 AM – 4:00 PM Eastern. */
export function isRegularUsEquitySession(date: Date = new Date()): boolean {
  const { weekdayKey, minutes } = getEasternParts(date);
  if (!isWeekday(weekdayKey)) return false;
  return minutes >= PRE_MARKET_END && minutes < POST_MARKET_START;
}

/** Pre-market, after-hours, or overnight (not regular RTH). */
export function isExtendedUsEquitySession(date: Date = new Date()): boolean {
  const { weekdayKey, minutes } = getEasternParts(date);
  if (isRegularUsEquitySession(date)) return false;

  if (isWeekday(weekdayKey)) {
    if (isBetween(minutes, PRE_MARKET_START, PRE_MARKET_END - 1)) return true;
    if (isBetween(minutes, POST_MARKET_START, POST_MARKET_END)) return true;
  }

  if (isBetween(minutes, OVERNIGHT_START, 24 * 60 - 1)) return true;
  if (isBetween(minutes, 0, OVERNIGHT_END)) return true;

  return false;
}

/**
 * Alpaca extended_hours flag — only when outside regular hours and schedule allows it.
 * Unrestricted allows trading anytime but still uses market orders during RTH.
 */
export function shouldSendExtendedHoursOrders(
  settings: TradingScheduleSettings,
  date: Date = new Date()
): boolean {
  if (!isExtendedUsEquitySession(date)) {
    return false;
  }
  return settings.unrestricted || settings.allowAfterHours || settings.allowOvernight;
}

/** 8:00 PM – 4:00 AM Eastern (overnight session). */
export function isOvernightUsEquitySession(date: Date = new Date()): boolean {
  const { minutes } = getEasternParts(date);
  return isBetween(minutes, OVERNIGHT_START, 24 * 60 - 1) || isBetween(minutes, 0, OVERNIGHT_END);
}

/** Alpaca extended-hours TIF: overnight prefers GTC; pre/after-market uses DAY. */
export function alpacaExtendedHoursTimeInForce(date: Date = new Date()): "day" | "gtc" {
  return isOvernightUsEquitySession(date) ? "gtc" : "day";
}

/** After 8:00 PM Eastern — post-market close, end of the US equity trading day. */
export function isPastUsEquityPostMarketClose(date: Date = new Date()): boolean {
  const { minutes } = getEasternParts(date);
  return minutes >= POST_MARKET_END;
}

/** True when entry and current time fall on different Eastern calendar days. */
export function isOvernightDayTrade(entryTime: number, date: Date = new Date()): boolean {
  return getEasternDayKey(new Date(entryTime)) !== getEasternDayKey(date);
}

/**
 * Day trades must not span sessions unattended.
 * Force flat when: overnight, past 8 PM ET, or in the last 5 minutes of RTH.
 */
export function shouldForceFlatDayTrade(entryTime: number, date: Date = new Date()): boolean {
  if (isOvernightDayTrade(entryTime, date)) return true;
  if (isPastUsEquityPostMarketClose(date)) return true;
  if (isNearUsEquitySessionEnd(date)) return true;
  return false;
}

/**
 * Whether closed trades should be auto-archived for the current Eastern calendar day.
 * Runs once per day after post-market close (8 PM ET), or on the next morning if missed.
 */
export function shouldRunEndOfDayTradeArchive(
  lastArchiveDayKey: string | undefined,
  date: Date = new Date()
): boolean {
  const dayKey = getEasternDayKey(date);
  if (lastArchiveDayKey === dayKey) return false;
  if (isPastUsEquityPostMarketClose(date)) return true;
  return lastArchiveDayKey != null && lastArchiveDayKey < dayKey;
}

export function getEasternDayKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
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
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const hour = hourRaw === 24 ? 0 : hourRaw;
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

  // End time is exclusive — e.g. end 16:00 means trading stops at 4:00 PM ET.
  if (start < end) {
    let effectiveStart = start;
    let effectiveEnd = end;

    // When extended sessions are off, clamp to regular US market hours (9:30 AM – 4:00 PM ET).
    if (!settings.allowAfterHours && !settings.allowOvernight) {
      effectiveStart = Math.max(effectiveStart, PRE_MARKET_END);
      effectiveEnd = Math.min(effectiveEnd, POST_MARKET_START);
    }

    if (effectiveStart < effectiveEnd && minutes >= effectiveStart && minutes < effectiveEnd) {
      return { allowed: true };
    }
  } else if (isBetween(minutes, start, end)) {
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

/**
 * Whether a new buy entry is allowed under the user's schedule.
 * Unrestricted / after-hours / overnight settings override the RTH-only entry guard.
 */
export function canEnterNewPositions(
  settings: TradingScheduleSettings,
  date: Date = new Date()
): TradingScheduleEvaluation {
  const schedule = evaluateTradingSchedule(settings, date);
  if (!schedule.allowed) {
    return schedule;
  }

  if (settings.unrestricted || settings.allowAfterHours || settings.allowOvernight) {
    return { allowed: true };
  }

  if (!isRegularUsEquitySession(date)) {
    return {
      allowed: false,
      reason: "New entries only during regular market hours (9:30 AM – 4:00 PM ET)",
    };
  }

  return { allowed: true };
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
