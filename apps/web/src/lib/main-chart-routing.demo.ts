/**
 * Demo script for Main Chart routing decisions (no live broker / strategies).
 * Run: npx --yes tsx src/lib/main-chart-routing.demo.ts
 */
import {
  applyManualSymbolOverride,
  applyReturnToAuto,
  decideMainChartRouting,
} from "./main-chart-routing-logic.ts";
import { defaultMainChartRoutingState } from "./main-chart-routing-types.ts";
import type { Trade } from "@wicksense/core";

const NOW = "2026-07-22T20:00:00.000Z";

function openTrade(id: string, symbol: string, chartSlot: string): Trade {
  return {
    id,
    symbol,
    chartSlot,
    side: "buy",
    status: "open",
    mode: "paper",
    entryPrice: 100,
    quantity: 1,
    strategy: "vwap-bounce",
    entryTime: Date.now(),
    timeframe: "15m",
  };
}

function show(title: string, decision: ReturnType<typeof decideMainChartRouting>) {
  console.log(`\n=== ${title} ===`);
  console.log(
    JSON.stringify(
      {
        mode: decision.state.mode,
        mainSymbol: decision.state.mainSymbol,
        reason: decision.state.lastAssignment?.reason,
        executable: decision.state.lastAssignment?.executable,
        pin: decision.state.activeTradePin,
        blockedReason: decision.blockedReason ?? null,
      },
      null,
      2
    )
  );
}

// 1) AUTO routing — best executable (MSFT), not highest-confidence DIA that failed gates
show(
  "AUTO routing",
  decideMainChartRouting({
    current: defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
    stateMissingOrCorrupt: false,
    openTrades: [],
    bestExecutable: {
      signalId: "sig-MSFT",
      strategy: "vwap-bounce",
      confidence: 0.72,
      symbol: "MSFT",
    },
    nowIso: NOW,
  })
);

// 2) ACTIVE TRADE pinning — main open on NVDA; multi DIA must not pin
show(
  "ACTIVE TRADE pinning",
  decideMainChartRouting({
    current: defaultMainChartRoutingState({ mainSymbol: "MSFT" }),
    stateMissingOrCorrupt: false,
    openTrades: [
      openTrade("multi-dia", "DIA", "multi-1"),
      openTrade("main-nvda", "NVDA", "main"),
    ],
    bestExecutable: {
      signalId: "ignore",
      strategy: "vwap-bounce",
      confidence: 0.99,
      symbol: "TSLA",
    },
    nowIso: NOW,
  })
);

// 3) MANUAL mode — user IBM, not executable → wait (symbol preserved)
const manual = applyManualSymbolOverride(
  defaultMainChartRoutingState({ mainSymbol: "AAPL" }),
  "IBM",
  NOW
);
show(
  "MANUAL mode (wait)",
  decideMainChartRouting({
    current: manual,
    stateMissingOrCorrupt: false,
    openTrades: [],
    bestExecutable: null,
    nowIso: NOW,
  })
);

// 4) Return to AUTO
show(
  "Return to AUTO",
  applyReturnToAuto(
    manual,
    {
      signalId: "sig-QQQ",
      strategy: "ema-crossover",
      confidence: 0.8,
      symbol: "QQQ",
    },
    [],
    NOW
  )
);
