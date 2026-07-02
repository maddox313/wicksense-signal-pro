import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TRADING_SCHEDULE } from "./types.ts";
import {
  evaluateTradingSchedule,
  getEasternDayKey,
  isOvernightDayTrade,
  normalizeTradingSchedule,
  shouldForceFlatDayTrade,
  shouldRunEndOfDayTradeArchive,
} from "./trading-schedule.ts";

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
    const mondayPremarket = new Date("2026-06-22T13:15:00Z"); // 09:15 ET Monday
    assert.equal(evaluateTradingSchedule(settings, mondayPremarket).allowed, false);
    const monday4pm = new Date("2026-06-22T20:00:00Z"); // 16:00 ET Monday
    assert.equal(evaluateTradingSchedule(settings, monday4pm).allowed, false);
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

describe("shouldRunEndOfDayTradeArchive", () => {
  it("does not archive during the trading day", () => {
    const afternoon = new Date("2026-07-01T18:30:00Z"); // 2:30 PM ET
    assert.equal(shouldRunEndOfDayTradeArchive(undefined, afternoon), false);
    assert.equal(shouldRunEndOfDayTradeArchive("2026-07-01", afternoon), false);
  });

  it("archives after post-market close", () => {
    const evening = new Date("2026-07-02T00:30:00Z"); // 8:30 PM ET July 1
    assert.equal(getEasternDayKey(evening), "2026-07-01");
    assert.equal(shouldRunEndOfDayTradeArchive(undefined, evening), true);
    assert.equal(shouldRunEndOfDayTradeArchive("2026-07-01", evening), false);
  });

  it("catches up the next morning if the prior evening run was missed", () => {
    const morning = new Date("2026-07-02T13:00:00Z"); // 9:00 AM ET July 2
    assert.equal(shouldRunEndOfDayTradeArchive("2026-07-01", morning), true);
    assert.equal(shouldRunEndOfDayTradeArchive("2026-07-02", morning), false);
  });
});

describe("day trade session guards", () => {
  it("detects overnight holds across Eastern calendar days", () => {
    const entry = new Date("2026-07-01T21:18:18.711Z").getTime(); // 5:18 PM ET
    const nextMorning = new Date("2026-07-02T14:59:11.615Z"); // 10:59 AM ET next day
    assert.equal(isOvernightDayTrade(entry, nextMorning), true);
    assert.equal(shouldForceFlatDayTrade(entry, nextMorning), true);
  });

  it("requires force-flat after 8 PM ET same day", () => {
    const entry = new Date("2026-07-01T21:18:18.711Z").getTime();
    const sameNight = new Date("2026-07-02T00:30:00Z"); // 8:30 PM ET July 1
    assert.equal(shouldForceFlatDayTrade(entry, sameNight), true);
  });
});
