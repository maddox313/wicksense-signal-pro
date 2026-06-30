import { NextRequest, NextResponse } from "next/server";
import {
  loadEngineConfig,
  saveEngineConfig,
  type EngineConfig,
  type EngineSlotConfig,
} from "@/lib/engine-config";

export async function GET() {
  return NextResponse.json(loadEngineConfig());
}

export async function POST(req: NextRequest) {
  let body: Partial<EngineConfig> & {
    slotId?: string;
    slotPatch?: Partial<EngineSlotConfig>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.slotId && body.slotPatch) {
    const current = loadEngineConfig();
    if (body.slotId === "main") {
      saveEngineConfig({ main: { ...current.main, ...body.slotPatch } });
    } else if (current.multi[body.slotId]) {
      saveEngineConfig({
        multi: {
          ...current.multi,
          [body.slotId]: { ...current.multi[body.slotId], ...body.slotPatch },
        },
      });
    }
    return NextResponse.json(loadEngineConfig());
  }

  const saved = saveEngineConfig(body);
  return NextResponse.json(saved);
}
