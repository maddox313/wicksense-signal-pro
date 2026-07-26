import type { Signal, Trade } from "@wicksense/core";
import {
  defaultMainChartRoutingState,
  type MainChartAssignmentReason,
  type MainChartRoutingMode,
  type MainChartRoutingState,
  type MainChartSelectedOpportunity,
} from "./main-chart-routing-types";
import { isUnresolvedMainSlotTrade } from "./slot-entry-gates";

export interface MainChartRoutingDecisionInput {
  current: MainChartRoutingState;
  /** True when file was missing or JSON/parse failed. */
  stateMissingOrCorrupt: boolean;
  openTrades: Trade[];
  /** Best executable opportunity in AUTO (null = keep current / wait). */
  bestExecutable: MainChartSelectedOpportunity | null;
  nowIso?: string;
}

export interface MainChartRoutingDecision {
  state: MainChartRoutingState;
  changed: boolean;
  blockedReason?: string;
}

function findUnresolvedMainTrade(trades: Trade[]): Trade | null {
  return trades.find(isUnresolvedMainSlotTrade) ?? null;
}

function assignment(
  reason: MainChartAssignmentReason,
  previousSymbol: string,
  nextSymbol: string,
  extras: Partial<MainChartRoutingState["lastAssignment"]> & {
    executable: boolean;
    activeTradeId: string | null;
    manualOverride: boolean;
  },
  nowIso: string
): NonNullable<MainChartRoutingState["lastAssignment"]> {
  return {
    reason,
    previousSymbol,
    nextSymbol,
    at: nowIso,
    executable: extras.executable,
    activeTradeId: extras.activeTradeId,
    manualOverride: extras.manualOverride,
    strategy: extras.strategy ?? null,
    signalId: extras.signalId ?? null,
    confidence: extras.confidence ?? null,
  };
}

/**
 * Pure Main Chart routing decision. Authoritative for AUTO / MANUAL / pin.
 * Does not touch multi-slot routing.
 */
export function decideMainChartRouting(
  input: MainChartRoutingDecisionInput
): MainChartRoutingDecision {
  const nowIso = input.nowIso ?? new Date().toISOString();
  let current = input.current;
  const previousSymbol = current.mainSymbol;

  if (input.stateMissingOrCorrupt) {
    const restored = findUnresolvedMainTrade(input.openTrades);
    if (restored) {
      const next: MainChartRoutingState = {
        mode: "AUTO",
        mainSymbol: restored.symbol.toUpperCase(),
        manualOverrideSymbol: null,
        activeTradePin: {
          tradeId: restored.id,
          symbol: restored.symbol.toUpperCase(),
          pinnedAt: nowIso,
        },
        selectedOpportunity: null,
        lastAssignment: assignment(
          "RESTORE_ACTIVE_POSITION",
          previousSymbol || "AAPL",
          restored.symbol.toUpperCase(),
          {
            executable: false,
            activeTradeId: restored.id,
            manualOverride: false,
          },
          nowIso
        ),
      };
      return { state: next, changed: true };
    }
    current = defaultMainChartRoutingState({
      mainSymbol: previousSymbol && previousSymbol !== "DIA" ? previousSymbol : "AAPL",
      lastAssignment: assignment(
        "AUTO_BEST_EXECUTABLE",
        previousSymbol || "DIA",
        previousSymbol && previousSymbol !== "DIA" ? previousSymbol : "AAPL",
        {
          executable: false,
          activeTradeId: null,
          manualOverride: false,
        },
        nowIso
      ),
    });
  }

  const mainOpen = findUnresolvedMainTrade(input.openTrades);

  // Only unresolved MAIN slot trades pin the Main Chart.
  if (mainOpen) {
    const pinSymbol = mainOpen.symbol.toUpperCase();
    const next: MainChartRoutingState = {
      ...current,
      mainSymbol: pinSymbol,
      activeTradePin: {
        tradeId: mainOpen.id,
        symbol: pinSymbol,
        pinnedAt: current.activeTradePin?.tradeId === mainOpen.id
          ? current.activeTradePin.pinnedAt
          : nowIso,
      },
      selectedOpportunity: null,
      lastAssignment: assignment(
        current.activeTradePin?.tradeId === mainOpen.id
          ? "ACTIVE_TRADE_PIN"
          : "ACTIVE_TRADE_PIN",
        previousSymbol,
        pinSymbol,
        {
          executable: false,
          activeTradeId: mainOpen.id,
          manualOverride: current.mode === "MANUAL",
        },
        nowIso
      ),
    };
    // MANUAL mode: still pin chart to open main trade symbol, but keep mode.
    if (current.mode === "MANUAL") {
      next.manualOverrideSymbol = current.manualOverrideSymbol ?? pinSymbol;
    }
    const changed =
      next.mainSymbol !== previousSymbol ||
      next.activeTradePin?.tradeId !== current.activeTradePin?.tradeId;
    return {
      state: next,
      changed,
      blockedReason: changed ? undefined : "ACTIVE_TRADE_PIN",
    };
  }

  // Release pin after main close.
  if (current.activeTradePin && !mainOpen) {
    if (current.mode === "MANUAL" && current.manualOverrideSymbol) {
      const manual = current.manualOverrideSymbol.toUpperCase();
      const next: MainChartRoutingState = {
        ...current,
        mainSymbol: manual,
        activeTradePin: null,
        selectedOpportunity: null,
        lastAssignment: assignment(
          "MANUAL_USER_OVERRIDE",
          previousSymbol,
          manual,
          {
            executable: false,
            activeTradeId: null,
            manualOverride: true,
          },
          nowIso
        ),
      };
      return { state: next, changed: next.mainSymbol !== previousSymbol };
    }

    // AUTO after close — assign best executable if available.
    if (input.bestExecutable) {
      const nextSym = input.bestExecutable.symbol.toUpperCase();
      const next: MainChartRoutingState = {
        mode: "AUTO",
        mainSymbol: nextSym,
        manualOverrideSymbol: null,
        activeTradePin: null,
        selectedOpportunity: input.bestExecutable,
        lastAssignment: assignment(
          "AUTO_RELEASE_AFTER_CLOSE",
          previousSymbol,
          nextSym,
          {
            executable: true,
            activeTradeId: null,
            manualOverride: false,
            strategy: input.bestExecutable.strategy,
            signalId: input.bestExecutable.signalId,
            confidence: input.bestExecutable.confidence,
          },
          nowIso
        ),
      };
      return { state: next, changed: true };
    }

    const next: MainChartRoutingState = {
      ...current,
      mode: current.mode === "MANUAL" ? "MANUAL" : "AUTO",
      activeTradePin: null,
      selectedOpportunity: null,
      lastAssignment: assignment(
        "AUTO_RELEASE_AFTER_CLOSE",
        previousSymbol,
        current.mainSymbol,
        {
          executable: false,
          activeTradeId: null,
          manualOverride: current.mode === "MANUAL",
        },
        nowIso
      ),
    };
    return { state: next, changed: true };
  }

  if (current.mode === "MANUAL") {
    const manual = (current.manualOverrideSymbol ?? current.mainSymbol).toUpperCase();
    const next: MainChartRoutingState = {
      ...current,
      mainSymbol: manual,
      manualOverrideSymbol: manual,
      activeTradePin: null,
      selectedOpportunity: null,
      lastAssignment: assignment(
        "MANUAL_USER_OVERRIDE",
        previousSymbol,
        manual,
        {
          executable: Boolean(
            input.bestExecutable &&
              input.bestExecutable.symbol.toUpperCase() === manual
          ),
          activeTradeId: null,
          manualOverride: true,
          strategy: input.bestExecutable?.strategy ?? null,
          signalId: input.bestExecutable?.signalId ?? null,
          confidence: input.bestExecutable?.confidence ?? null,
        },
        nowIso
      ),
    };
    return {
      state: next,
      changed: next.mainSymbol !== previousSymbol,
      blockedReason:
        !input.bestExecutable ||
        input.bestExecutable.symbol.toUpperCase() !== manual
          ? "MANUAL_WAIT_NOT_EXECUTABLE"
          : undefined,
    };
  }

  // AUTO: best executable opportunity (not merely highest confidence).
  if (input.bestExecutable) {
    const nextSym = input.bestExecutable.symbol.toUpperCase();
    const next: MainChartRoutingState = {
      mode: "AUTO",
      mainSymbol: nextSym,
      manualOverrideSymbol: null,
      activeTradePin: null,
      selectedOpportunity: input.bestExecutable,
      lastAssignment: assignment(
        "AUTO_BEST_EXECUTABLE",
        previousSymbol,
        nextSym,
        {
          executable: true,
          activeTradeId: null,
          manualOverride: false,
          strategy: input.bestExecutable.strategy,
          signalId: input.bestExecutable.signalId,
          confidence: input.bestExecutable.confidence,
        },
        nowIso
      ),
    };
    return { state: next, changed: next.mainSymbol !== previousSymbol };
  }

  // No executable candidate — keep current AUTO symbol; do not invent DIA.
  return {
    state: {
      ...current,
      mode: "AUTO",
      activeTradePin: null,
      selectedOpportunity: null,
    },
    changed: false,
    blockedReason: "NO_EXECUTABLE_OPPORTUNITY",
  };
}

export function applyManualSymbolOverride(
  current: MainChartRoutingState,
  symbol: string,
  nowIso = new Date().toISOString()
): MainChartRoutingState {
  const nextSymbol = symbol.trim().toUpperCase();
  return {
    ...current,
    mode: "MANUAL",
    mainSymbol: nextSymbol,
    manualOverrideSymbol: nextSymbol,
    selectedOpportunity: null,
    lastAssignment: assignment(
      "MANUAL_USER_OVERRIDE",
      current.mainSymbol,
      nextSymbol,
      {
        executable: false,
        activeTradeId: current.activeTradePin?.tradeId ?? null,
        manualOverride: true,
      },
      nowIso
    ),
  };
}

export function applyReturnToAuto(
  current: MainChartRoutingState,
  bestExecutable: MainChartSelectedOpportunity | null,
  openTrades: Trade[],
  nowIso = new Date().toISOString()
): MainChartRoutingDecision {
  const released: MainChartRoutingState = {
    ...current,
    mode: "AUTO",
    manualOverrideSymbol: null,
  };
  return decideMainChartRouting({
    current: released,
    stateMissingOrCorrupt: false,
    openTrades,
    bestExecutable,
    nowIso,
  });
}

export type { MainChartRoutingMode, Signal };
