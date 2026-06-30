import { NextResponse } from "next/server";
import { refreshLegacyPaperBlockFromAlpaca } from "@/lib/legacy-paper-cleanup";

export async function POST() {
  try {
    const result = await refreshLegacyPaperBlockFromAlpaca();
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.cleared
        ? "Legacy symbol block cleared — new paper buys allowed for previously blocked symbols."
        : "No legacy block file was present.",
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
