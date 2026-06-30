import { NextResponse } from "next/server";
import { computePerformanceStats } from "@wicksense/core";
import {
  cleanupLegacyPaperTrades,
  getLegacyCleanupSummary,
} from "@/lib/legacy-paper-cleanup";
import { getAllTrades, getArchivedTrades } from "@/lib/trade-store";

export async function POST() {
  try {
    const result = await cleanupLegacyPaperTrades();
    const trades = await getAllTrades();
    const summary = await getLegacyCleanupSummary();

    return NextResponse.json({
      ok: true,
      result,
      summary,
      trades,
      performance: computePerformanceStats(trades),
      message:
        summary.openPaperCount === 0
          ? "Legacy paper cleanup complete. Auto-exit applies to new trades only."
          : `${summary.openPaperCount} open paper trade(s) still remain — check needs_manual_close in Trade Archive.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[cleanup-legacy-paper]", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export async function GET() {
  const summary = await getLegacyCleanupSummary();
  const trades = await getAllTrades();
  const archived = await getArchivedTrades();
  return NextResponse.json({
    summary,
    openPaperTrades: trades.filter((t) => t.mode === "paper" && t.status === "open"),
    needsManualClose: archived.filter(
      (t) => t.mode === "paper" && t.status === "needs_manual_close"
    ),
  });
}
