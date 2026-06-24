import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TRADING_SCHEDULE } from "./types.ts";
import { evaluateTradingSchedule, normalizeTradingSchedule } from "./trading-schedule.ts";

describe("evaluateTradingSchedule", () => {
  it("allows all times when unrestricted", () => {
    const result = evaluateTradingSchedule(
      { ...DEFAULT_TRADING_SCHEDULE, unrestricted: true },
      new Date("2026-06-23T03:00:00Z")
    );
    assert.equal(result.allowed, true);
  });

  it("blocks outside custom hours on weekdays", () => {
    const settings = normalizeTradingSchedule({
      ...DEFAULT_TRADING_SCHEDULE,
      days: { sun: false, mon: true, tue: true, wed: true, thu: true, fri: true, sat: false },
      startTime: "09:30",
      endTime: "16:00",
    });
    const mondayMorning = new Date("2026-06-22T14:00:00Z"); // 10:00 ET Monday
    const mondayNight = new Date("2026-06-23T02:00:00Z"); // 22:00 ET Monday

    assert.equal(evaluateTradingSchedule(settings, mondayMorning).allowed, true);
    assert.equal(evaluateTradingSchedule(settings, mondayNight).allowed, false);
  });

  it("allows after hours when enabled", () => {
    const settings = normalizeTradingSchedule({
      ...DEFAULT_TRADING_SCHEDULE,
      allowAfterHours: true,
      startTime: "09:30",
      endTime: "16:00",
    });
    const preMarket = new Date("2026-06-23T12:00:00Z"); // 08:00 ET Tuesday
    assert.equal(evaluateTradingSchedule(settings, preMarket).allowed, true);
  });

  it("allows overnight when enabled", () => {
    const settings = normalizeTradingSchedule({
      ...DEFAULT_TRADING_SCHEDULE,
      allowOvernight: true,
      startTime: "09:30",
      endTime: "16:00",
    });
    const overnight = new Date("2026-06-23T02:00:00Z"); // 22:00 ET Monday
    assert.equal(evaluateTradingSchedule(settings, overnight).allowed, true);
  });
});
