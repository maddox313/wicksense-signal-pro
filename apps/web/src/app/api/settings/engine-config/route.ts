import { NextRequest, NextResponse } from "next/server";
import {
  loadEngineConfig,
  saveEngineConfig,
  type EngineConfig,
  type EngineSlotConfig,
} from "@/lib/engine-config";
import { loadMainChartRoutingState } from "@/lib/main-chart-routing-state";

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

  const routing = loadMainChartRoutingState();
  // In AUTO (and while pinned), Main Chart symbol is owned by the server router.
  // UI must not overwrite it. MANUAL mode accepts symbol changes via routing API.
  const protectMainSymbol = routing.mode === "AUTO" || Boolean(routing.activeTradePin);

  if (body.slotId && body.slotPatch) {
    const current = loadEngineConfig();
    if (body.slotId === "main") {
      const patch = { ...body.slotPatch };
      if (protectMainSymbol) {
        delete patch.symbol;
      }
      saveEngineConfig({ main: { ...current.main, ...patch } });
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

  if (protectMainSymbol && body.main) {
    const { symbol: _ignored, ...mainRest } = body.main;
    body = { ...body, main: { ...loadEngineConfig().main, ...mainRest } };
  }

  const saved = saveEngineConfig(body);
  return NextResponse.json(saved);
}
