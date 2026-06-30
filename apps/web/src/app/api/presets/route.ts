import { NextResponse } from "next/server";
import { loadStrategyPresets } from "@/lib/presets-server";

export async function GET() {
  return NextResponse.json({ presets: loadStrategyPresets() });
}
