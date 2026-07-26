import fs from "fs";
import { dataFile } from "@/lib/data-paths";
import {
  DEFAULT_MAIN_CHART_ROUTING_SYMBOL,
  defaultMainChartRoutingState,
  type MainChartActiveTradePin,
  type MainChartAssignmentReason,
  type MainChartRoutingMode,
  type MainChartRoutingState,
  type MainChartSelectedOpportunity,
  type MainChartLastAssignment,
} from "@/lib/main-chart-routing-types";

export type {
  MainChartActiveTradePin,
  MainChartAssignmentReason,
  MainChartRoutingMode,
  MainChartRoutingState,
  MainChartSelectedOpportunity,
  MainChartLastAssignment,
};
export { defaultMainChartRoutingState, DEFAULT_MAIN_CHART_ROUTING_SYMBOL };

const STATE_PATH = dataFile("main-chart-routing.local.json");

function normalizeSymbol(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const s = value.trim().toUpperCase();
  return s.length > 0 ? s : fallback;
}

export function loadMainChartRoutingStateDetailed(): {
  state: MainChartRoutingState;
  missingOrCorrupt: boolean;
} {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return {
        state: defaultMainChartRoutingState(),
        missingOrCorrupt: true,
      };
    }
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as Partial<MainChartRoutingState>;
    if (!raw || typeof raw !== "object" || (raw.mode !== "AUTO" && raw.mode !== "MANUAL")) {
      return {
        state: defaultMainChartRoutingState(),
        missingOrCorrupt: true,
      };
    }
    const mode: MainChartRoutingMode = raw.mode === "MANUAL" ? "MANUAL" : "AUTO";
    const mainSymbol = normalizeSymbol(raw.mainSymbol, DEFAULT_MAIN_CHART_ROUTING_SYMBOL);
    const manualOverrideSymbol =
      mode === "MANUAL"
        ? normalizeSymbol(raw.manualOverrideSymbol ?? raw.mainSymbol, mainSymbol)
        : null;

    let activeTradePin: MainChartActiveTradePin | null = null;
    if (
      raw.activeTradePin &&
      typeof raw.activeTradePin === "object" &&
      typeof raw.activeTradePin.tradeId === "string" &&
      typeof raw.activeTradePin.symbol === "string"
    ) {
      activeTradePin = {
        tradeId: raw.activeTradePin.tradeId,
        symbol: normalizeSymbol(raw.activeTradePin.symbol, mainSymbol),
        pinnedAt:
          typeof raw.activeTradePin.pinnedAt === "string"
            ? raw.activeTradePin.pinnedAt
            : new Date().toISOString(),
      };
    }

    return {
      missingOrCorrupt: false,
      state: {
        mode,
        mainSymbol:
          mode === "MANUAL" && manualOverrideSymbol ? manualOverrideSymbol : mainSymbol,
        manualOverrideSymbol,
        activeTradePin,
        selectedOpportunity:
          raw.selectedOpportunity &&
          typeof raw.selectedOpportunity.signalId === "string" &&
          typeof raw.selectedOpportunity.symbol === "string"
            ? {
                signalId: raw.selectedOpportunity.signalId,
                strategy: String(raw.selectedOpportunity.strategy ?? ""),
                confidence: Number(raw.selectedOpportunity.confidence) || 0,
                symbol: normalizeSymbol(raw.selectedOpportunity.symbol, mainSymbol),
              }
            : null,
        lastAssignment: raw.lastAssignment ?? null,
      },
    };
  } catch {
    return {
      state: defaultMainChartRoutingState(),
      missingOrCorrupt: true,
    };
  }
}

export function loadMainChartRoutingState(): MainChartRoutingState {
  return loadMainChartRoutingStateDetailed().state;
}

export function saveMainChartRoutingState(state: MainChartRoutingState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function logMainChartRouterDiagnostic(fields: {
  mode: MainChartRoutingMode;
  previousSymbol: string;
  nextSymbol: string;
  reason: MainChartAssignmentReason | string;
  strategy?: string | null;
  signalId?: string | null;
  confidence?: number | null;
  executable?: boolean;
  activeTradeId?: string | null;
  manualOverride?: boolean;
}): void {
  console.log(
    "[main-chart-router]\n" +
      `mode=${fields.mode}\n` +
      `previousSymbol=${fields.previousSymbol}\n` +
      `nextSymbol=${fields.nextSymbol}\n` +
      `reason=${fields.reason}\n` +
      `strategy=${fields.strategy ?? ""}\n` +
      `signalId=${fields.signalId ?? ""}\n` +
      `confidence=${fields.confidence ?? ""}\n` +
      `executable=${fields.executable ?? ""}\n` +
      `activeTradeId=${fields.activeTradeId ?? ""}\n` +
      `manualOverride=${fields.manualOverride ?? false}\n` +
      `timestamp=${new Date().toISOString()}`
  );
}
