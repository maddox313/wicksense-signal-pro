import { NextRequest, NextResponse } from "next/server";
import { loadEngineConfig } from "@/lib/engine-config";
import { resolveServerActivePreset } from "@/lib/presets-server";
import {
  getMainChartRoutingSnapshot,
  setMainChartManualSymbol,
  setMainChartReturnToAuto,
} from "@/lib/main-chart-router";
import { getAllTrades } from "@/lib/trade-store";

export async function GET() {
  return NextResponse.json(getMainChartRoutingSnapshot());
}

export async function POST(req: NextRequest) {
  let body: {
    mode?: "AUTO" | "MANUAL";
    symbol?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.mode === "MANUAL") {
    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    if (!symbol) {
      return NextResponse.json({ error: "symbol required for MANUAL mode" }, { status: 400 });
    }
    return NextResponse.json(setMainChartManualSymbol(symbol));
  }

  if (body.mode === "AUTO") {
    const engine = loadEngineConfig();
    const preset = resolveServerActivePreset(engine.activePresetId);
    if (!preset) {
      return NextResponse.json({ error: "No strategy preset available" }, { status: 400 });
    }
    const openTrades = await getAllTrades();
    const state = await setMainChartReturnToAuto({ preset, openTrades });
    return NextResponse.json(state);
  }

  return NextResponse.json({ error: "mode must be AUTO or MANUAL" }, { status: 400 });
}
