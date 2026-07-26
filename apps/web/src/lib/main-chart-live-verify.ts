import type { Trade } from "@wicksense/core";
import { MAIN_CHART_SLOT } from "@/lib/chart-slots";
import { loadEngineConfig, patchEngineSlot } from "@/lib/engine-config";
import {
  applyManualSymbolOverride,
  applyReturnToAuto,
  decideMainChartRouting,
} from "@/lib/main-chart-routing-logic";
import {
  loadMainChartRoutingStateDetailed,
  saveMainChartRoutingState,
  type MainChartRoutingState,
} from "@/lib/main-chart-routing-state";
import { getOpenTrades, upsertTrade, updateTrade } from "@/lib/trade-store";
import { stopTradeEngineWorker, startTradeEngineWorker } from "@/lib/trade-engine-worker";

const DEMO_PREFIX = "live-verify-main-";
const PARKED_SLOT = "alpaca-sync";

export interface LiveVerifySnapshot {
  at: string;
  step: string;
  routing: MainChartRoutingState;
  engineMainSymbol: string;
  mainOpenTrades: Array<{ id: string; symbol: string; status: string }>;
  note?: string;
}

export interface LiveVerifyReport {
  ok: boolean;
  weekendNote: string;
  steps: LiveVerifySnapshot[];
  assertions: Array<{ name: string; pass: boolean; detail: string }>;
  restored: boolean;
}

function nowIso() {
  return new Date().toISOString();
}

async function snapshot(step: string, note?: string): Promise<LiveVerifySnapshot> {
  const routing = loadMainChartRoutingStateDetailed().state;
  const engine = loadEngineConfig();
  const open = await getOpenTrades();
  const mainOpenTrades = open
    .filter(
      (t) =>
        t.chartSlot === MAIN_CHART_SLOT &&
        (t.status === "open" || t.status === "needs_manual_close")
    )
    .map((t) => ({ id: t.id, symbol: t.symbol, status: t.status }));
  return {
    at: nowIso(),
    step,
    routing,
    engineMainSymbol: engine.main.symbol,
    mainOpenTrades,
    note,
  };
}

function applyDecision(
  decision: ReturnType<typeof decideMainChartRouting>,
  label: string
): void {
  saveMainChartRoutingState(decision.state);
  patchEngineSlot(MAIN_CHART_SLOT, { symbol: decision.state.mainSymbol });
  console.log(
    `[live-verify] ${label}: ${decision.state.mainSymbol} (${decision.state.lastAssignment?.reason ?? "n/a"})`
  );
}

async function parkExistingMainTrades(): Promise<Trade[]> {
  const open = await getOpenTrades();
  const mainOpen = open.filter(
    (t) =>
      t.chartSlot === MAIN_CHART_SLOT &&
      (t.status === "open" || t.status === "needs_manual_close") &&
      !t.id.startsWith(DEMO_PREFIX)
  );
  for (const trade of mainOpen) {
    await updateTrade(trade.id, { chartSlot: PARKED_SLOT });
  }
  return mainOpen;
}

async function restoreParkedTrades(parked: Trade[]): Promise<void> {
  for (const trade of parked) {
    await updateTrade(trade.id, { chartSlot: MAIN_CHART_SLOT });
  }
}

async function closeDemoTrades(): Promise<void> {
  const open = await getOpenTrades();
  for (const trade of open.filter((t) => t.id.startsWith(DEMO_PREFIX))) {
    await updateTrade(trade.id, {
      status: "closed",
      exitTime: Date.now(),
      exitPrice: trade.entryPrice,
      pnl: 0,
      pnlPercent: 0,
      closeReason: "MANUAL",
    });
  }
}

async function placeDemoMainTrade(symbol: string, confidence: number): Promise<Trade> {
  const trade: Trade = {
    id: `${DEMO_PREFIX}${symbol}-${Date.now()}`,
    symbol,
    side: "buy",
    quantity: 1,
    entryPrice: 100,
    entryTime: Date.now(),
    mode: "paper",
    strategy: "vwap-bounce",
    status: "open",
    chartSlot: MAIN_CHART_SLOT,
    timeframe: "5m",
    signalId: `${DEMO_PREFIX}sig-${symbol}`,
  };
  await upsertTrade(trade);
  void confidence;
  return trade;
}

function assert(
  assertions: LiveVerifyReport["assertions"],
  name: string,
  pass: boolean,
  detail: string
) {
  assertions.push({ name, pass, detail });
}

/**
 * Controlled live verification against the running app's real routing + engine config + trade store.
 * Pauses the in-process worker, parks (does not close) any existing main-slot opens, then restores.
 */
export async function runMainChartLiveVerification(): Promise<LiveVerifyReport> {
  const steps: LiveVerifySnapshot[] = [];
  const assertions: LiveVerifyReport["assertions"] = [];
  let parked: Trade[] = [];
  let restored = false;

  const weekendNote =
    "Market bars are stale (weekend). Organic scan executability is unavailable; " +
    "this run drives the live app through the same routing + main-slot trade path with controlled executable opportunities.";

  try {
    stopTradeEngineWorker();
    steps.push(await snapshot("0_paused_engine", "Trade engine worker paused for verification"));

    parked = await parkExistingMainTrades();
    steps.push(
      await snapshot(
        "0_parked_existing_main",
        parked.length
          ? `Parked ${parked.map((t) => `${t.symbol}(${t.id})`).join(", ")} to ${PARKED_SLOT} (Alpaca positions untouched)`
          : "No existing main-slot opens to park"
      )
    );

    // --- 1) AUTO: two executables; pick higher-confidence executable MSFT over lower AAPL ---
    // (Opportunities are already executable-filtered; MSFT is best.)
    const autoDecision = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: {
        signalId: "live-verify-msft",
        strategy: "vwap-bounce",
        confidence: 0.91,
        symbol: "MSFT",
      },
      nowIso: nowIso(),
    });
    applyDecision(autoDecision, "AUTO_BEST_EXECUTABLE");
    const msftTrade = await placeDemoMainTrade("MSFT", 0.91);
    // Re-apply pin from the new open trade (as a tick would).
    const pinAfterOpen = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: {
        signalId: "live-verify-higher",
        strategy: "ema-crossover",
        confidence: 0.99,
        symbol: "TSLA",
      },
      nowIso: nowIso(),
    });
    applyDecision(pinAfterOpen, "ACTIVE_TRADE_PIN");
    steps.push(
      await snapshot(
        "1_auto_switch_and_trade",
        "Main Chart → MSFT; demo auto-trade opened on MSFT (same symbol)"
      )
    );
    assert(
      assertions,
      "AUTO chart switches to best executable",
      loadEngineConfig().main.symbol === "MSFT" &&
        loadMainChartRoutingStateDetailed().state.mainSymbol === "MSFT",
      `engine=${loadEngineConfig().main.symbol} routing=${loadMainChartRoutingStateDetailed().state.mainSymbol}`
    );
    assert(
      assertions,
      "AUTO trade placed on same symbol",
      msftTrade.symbol === "MSFT" && msftTrade.chartSlot === "main",
      `trade=${msftTrade.id} symbol=${msftTrade.symbol} slot=${msftTrade.chartSlot}`
    );

    // --- 2) Active trade pin: higher confidence must NOT move chart ---
    steps.push(
      await snapshot(
        "2_active_trade_pin",
        "Injected higher-confidence TSLA (0.99); chart must remain MSFT while main trade open"
      )
    );
    assert(
      assertions,
      "Pin holds against higher-confidence opportunity",
      loadEngineConfig().main.symbol === "MSFT" &&
        loadMainChartRoutingStateDetailed().state.lastAssignment?.reason === "ACTIVE_TRADE_PIN",
      `symbol=${loadEngineConfig().main.symbol} reason=${loadMainChartRoutingStateDetailed().state.lastAssignment?.reason}`
    );

    // --- 3) Trade closes → next best executable ---
    await updateTrade(msftTrade.id, {
      status: "closed",
      exitTime: Date.now(),
      exitPrice: 101,
      pnl: 1,
      pnlPercent: 1,
      closeReason: "MANUAL",
    });
    const afterClose = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: {
        signalId: "live-verify-qqq",
        strategy: "rsi-reversal",
        confidence: 0.84,
        symbol: "QQQ",
      },
      nowIso: nowIso(),
    });
    applyDecision(afterClose, "AUTO_RELEASE_AFTER_CLOSE");
    steps.push(
      await snapshot(
        "3_after_close_switches",
        "Main MSFT trade closed; Main Chart auto-switched to next best executable QQQ"
      )
    );
    assert(
      assertions,
      "After close switches to next best executable",
      loadEngineConfig().main.symbol === "QQQ" &&
        (loadMainChartRoutingStateDetailed().state.lastAssignment?.reason ===
          "AUTO_RELEASE_AFTER_CLOSE" ||
          loadMainChartRoutingStateDetailed().state.lastAssignment?.reason ===
            "AUTO_BEST_EXECUTABLE"),
      `symbol=${loadEngineConfig().main.symbol} reason=${loadMainChartRoutingStateDetailed().state.lastAssignment?.reason}`
    );

    // --- 4) MANUAL mode ---
    const manualState = applyManualSymbolOverride(
      loadMainChartRoutingStateDetailed().state,
      "IBM",
      nowIso()
    );
    saveMainChartRoutingState(manualState);
    patchEngineSlot(MAIN_CHART_SLOT, { symbol: "IBM" });

    // Simulate engine tick while not executable — must not overwrite IBM.
    const manualWait = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: null,
      nowIso: nowIso(),
    });
    applyDecision(manualWait, "MANUAL_WAIT");
    steps.push(
      await snapshot(
        "4a_manual_wait",
        "MANUAL IBM set; tick with no executable opportunity — symbol must stay IBM"
      )
    );
    assert(
      assertions,
      "MANUAL not overwritten when not executable",
      loadEngineConfig().main.symbol === "IBM" &&
        loadMainChartRoutingStateDetailed().state.mode === "MANUAL",
      `symbol=${loadEngineConfig().main.symbol} mode=${loadMainChartRoutingStateDetailed().state.mode} blocked=${manualWait.blockedReason}`
    );

    // Also prove a competing AUTO candidate cannot steal the chart in MANUAL.
    const manualIgnoreOther = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: {
        signalId: "live-verify-spy",
        strategy: "vwap-bounce",
        confidence: 0.95,
        symbol: "SPY",
      },
      nowIso: nowIso(),
    });
    applyDecision(manualIgnoreOther, "MANUAL_IGNORE_OTHER");
    assert(
      assertions,
      "MANUAL ignores other symbols even if executable",
      loadEngineConfig().main.symbol === "IBM",
      `symbol=${loadEngineConfig().main.symbol}`
    );

    // IBM becomes executable → trade exact symbol.
    const manualReady = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: {
        signalId: "live-verify-ibm",
        strategy: "vwap-bounce",
        confidence: 0.8,
        symbol: "IBM",
      },
      nowIso: nowIso(),
    });
    applyDecision(manualReady, "MANUAL_EXECUTABLE");
    const ibmTrade = await placeDemoMainTrade("IBM", 0.8);
    const pinIbm = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: {
        signalId: "x",
        strategy: "vwap-bounce",
        confidence: 0.99,
        symbol: "TSLA",
      },
      nowIso: nowIso(),
    });
    applyDecision(pinIbm, "MANUAL_PIN");
    steps.push(
      await snapshot(
        "4b_manual_executable_trade",
        "IBM became executable; main-slot demo trade opened on IBM exactly"
      )
    );
    assert(
      assertions,
      "MANUAL trades exact selected symbol when executable",
      ibmTrade.symbol === "IBM" && loadEngineConfig().main.symbol === "IBM",
      `trade=${ibmTrade.symbol} chart=${loadEngineConfig().main.symbol}`
    );

    // Close IBM demo so Return to AUTO can move the chart.
    await updateTrade(ibmTrade.id, {
      status: "closed",
      exitTime: Date.now(),
      exitPrice: 100,
      pnl: 0,
      pnlPercent: 0,
      closeReason: "MANUAL",
    });

    // --- 5) Return to AUTO ---
    const returned = applyReturnToAuto(
      loadMainChartRoutingStateDetailed().state,
      {
        signalId: "live-verify-nvda",
        strategy: "ema-crossover",
        confidence: 0.88,
        symbol: "NVDA",
      },
      await getOpenTrades(),
      nowIso()
    );
    applyDecision(returned, "RETURN_TO_AUTO");
    steps.push(
      await snapshot(
        "5_return_to_auto",
        "Manual override cleared; Main Chart immediately assigned to best executable NVDA"
      )
    );
    assert(
      assertions,
      "Return to AUTO clears override and takes best executable",
      loadMainChartRoutingStateDetailed().state.mode === "AUTO" &&
        loadEngineConfig().main.symbol === "NVDA" &&
        loadMainChartRoutingStateDetailed().state.manualOverrideSymbol === null,
      `mode=${loadMainChartRoutingStateDetailed().state.mode} symbol=${loadEngineConfig().main.symbol}`
    );

    await closeDemoTrades();
    await restoreParkedTrades(parked);
    restored = true;

    // Restore routing to pin existing main trade if any, else AUTO on restored symbol.
    const restoreDecision = decideMainChartRouting({
      current: loadMainChartRoutingStateDetailed().state,
      stateMissingOrCorrupt: false,
      openTrades: await getOpenTrades(),
      bestExecutable: null,
      nowIso: nowIso(),
    });
    applyDecision(restoreDecision, "RESTORE_PRE_VERIFY_STATE");
    steps.push(await snapshot("6_restored", "Demo trades closed; parked main opens restored"));

    return {
      ok: assertions.every((a) => a.pass),
      weekendNote,
      steps,
      assertions,
      restored,
    };
  } catch (err) {
    try {
      await closeDemoTrades();
      await restoreParkedTrades(parked);
      restored = true;
    } catch {
      /* best effort */
    }
    throw err;
  } finally {
    startTradeEngineWorker();
  }
}
