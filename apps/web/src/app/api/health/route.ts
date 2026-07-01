import { NextResponse } from "next/server";
import { hasPaperCredentials, fetchAlpacaAccount } from "@/lib/alpaca";
import { prisma } from "@/lib/db";
import { getDataDir } from "@/lib/data-paths";
import { getDatabaseUrl } from "@/lib/database-url";
import { isTradeEngineEnabled } from "@/lib/server-trade-engine";
import { loadServerEngineTelemetry } from "@/lib/server-engine-telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const telemetry = loadServerEngineTelemetry();
    const engineEnabled = isTradeEngineEnabled();
    const paperMode = process.env.ALPACA_PAPER !== "false";
    const alpacaConfigured = hasPaperCredentials();
    let alpacaConnected = false;
    let alpacaError: string | undefined;
    if (alpacaConfigured && paperMode) {
      const { account, error } = await fetchAlpacaAccount(true);
      alpacaConnected = account !== null;
      alpacaError = error;
    }

    return NextResponse.json({
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - started,
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local",
      dataDir: getDataDir(),
      database: getDatabaseUrl(),
      tradeEngine: {
        enabled: engineEnabled,
        runsInProcess: true,
        pollIntervalMs: 30_000,
        totalCycles: telemetry.totalCycles,
        lastCycleAt: telemetry.lastCycleCompletedAt,
        cycleInProgress: telemetry.cycleInProgress,
      },
      alpaca: {
        paper: paperMode,
        configured: alpacaConfigured,
        connected: alpacaConnected,
        ...(alpacaError ? { error: alpacaError } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: message,
      },
      { status: 503 }
    );
  }
}
