import { NextResponse } from "next/server";
import {
  isServerEngineCurrentlyRunning,
  loadServerEngineTelemetry,
} from "@/lib/server-engine-telemetry";
import { isTradeEngineEnabled } from "@/lib/server-trade-engine";

export async function GET() {
  const telemetry = loadServerEngineTelemetry();
  return NextResponse.json({
    telemetry,
    workerEnabled: isTradeEngineEnabled(),
    engineRunning: isServerEngineCurrentlyRunning(),
    source: "server",
  });
}
