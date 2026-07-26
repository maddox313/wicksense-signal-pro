export type MainChartRoutingMode = "AUTO" | "MANUAL";

export type MainChartAssignmentReason =
  | "AUTO_BEST_EXECUTABLE"
  | "ACTIVE_TRADE_PIN"
  | "MANUAL_USER_OVERRIDE"
  | "RESTORE_ACTIVE_POSITION"
  | "AUTO_RELEASE_AFTER_CLOSE";

export interface MainChartSelectedOpportunity {
  signalId: string;
  strategy: string;
  confidence: number;
  symbol: string;
}

export interface MainChartActiveTradePin {
  tradeId: string;
  symbol: string;
  pinnedAt: string;
}

export interface MainChartLastAssignment {
  reason: MainChartAssignmentReason;
  previousSymbol: string;
  nextSymbol: string;
  at: string;
  executable: boolean;
  activeTradeId: string | null;
  manualOverride: boolean;
  strategy?: string | null;
  signalId?: string | null;
  confidence?: number | null;
}

export interface MainChartRoutingState {
  mode: MainChartRoutingMode;
  mainSymbol: string;
  manualOverrideSymbol: string | null;
  activeTradePin: MainChartActiveTradePin | null;
  selectedOpportunity: MainChartSelectedOpportunity | null;
  lastAssignment: MainChartLastAssignment | null;
}

export const DEFAULT_MAIN_CHART_ROUTING_SYMBOL = "AAPL";

export function defaultMainChartRoutingState(
  overrides?: Partial<MainChartRoutingState>
): MainChartRoutingState {
  return {
    mode: "AUTO",
    mainSymbol: DEFAULT_MAIN_CHART_ROUTING_SYMBOL,
    manualOverrideSymbol: null,
    activeTradePin: null,
    selectedOpportunity: null,
    lastAssignment: null,
    ...overrides,
  };
}
