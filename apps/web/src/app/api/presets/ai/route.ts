import { NextRequest, NextResponse } from "next/server";
import { generateAiPreset } from "@wicksense/core";
import type { TradingStyle } from "@wicksense/core";

export async function POST(req: NextRequest) {
  const { style } = (await req.json()) as { style: TradingStyle };
  const preset = generateAiPreset(style);
  return NextResponse.json({ preset });
}
