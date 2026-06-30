import { NextResponse } from "next/server";
import { computePerformanceStats } from "@wicksense/core";
import {
  closeArchivedLegacyPaperTrades,
  getLegacyCleanupSummary,
} from "@/lib/legacy-paper-cleanup";
import { getArchivedTrades } from "@/lib/trade-store";

export async function POST() {
  try {
    const result = await closeArchivedLegacyPaperTrades();
    const summary = await getLegacyCleanupSummary();
    const archived = await getArchivedTrades();
    const stillPending = archived.filter(
      (t) => t.mode === "paper" && t.status === "needs_manual_close"
    );

    return NextResponse.json({
      ok: stillPending.length === 0 && result.remainingPositions.length === 0,
      result,
      summary,
      stillPendingCount: stillPending.length,
      performance: computePerformanceStats(
        archived.filter((t) => !t.archived || t.status === "closed")
      ),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[archive/close-all]", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
