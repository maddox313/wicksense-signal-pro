import fs from "fs";
import { getEasternDayKey, shouldRunEndOfDayTradeArchive } from "@wicksense/core";
import { dataFile } from "@/lib/data-paths";
import { archiveTrades } from "@/lib/trade-store";

const STATE_PATH = dataFile("trade-archive-schedule-state.local.json");

interface DailyArchiveState {
  lastAutoArchiveDayKey?: string;
}

function loadState(): DailyArchiveState {
  try {
    if (!fs.existsSync(STATE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as DailyArchiveState;
  } catch {
    return {};
  }
}

function saveState(state: DailyArchiveState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export interface DailyTradeArchiveResult {
  ran: boolean;
  archived: number;
  dayKey?: string;
}

/** Archive all closed trades once per Eastern day (after 8 PM ET, or next morning if missed). */
export async function runDailyTradeArchiveIfDue(
  date: Date = new Date()
): Promise<DailyTradeArchiveResult> {
  const state = loadState();
  if (!shouldRunEndOfDayTradeArchive(state.lastAutoArchiveDayKey, date)) {
    return { ran: false, archived: 0 };
  }

  const dayKey = getEasternDayKey(date);
  const { archived } = await archiveTrades({ archiveAllClosed: true });
  saveState({ lastAutoArchiveDayKey: dayKey });

  if (archived > 0) {
    console.log(
      `[trade-archive] End-of-day archive: moved ${archived} closed trade${archived === 1 ? "" : "s"} to Trade Archive (${dayKey} ET)`
    );
  }

  return { ran: true, archived, dayKey };
}
