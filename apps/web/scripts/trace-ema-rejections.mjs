/**
 * Find every ema-crossover signal in 20-bar lookback per slot and trace /api/trades/execute.
 * Run: node scripts/trace-ema-rejections.mjs (dev server on :3000)
 */

const SLOTS = [
  { chartSlot: "main", symbol: "AAPL", timeframe: "5m" },
  { chartSlot: "multi-1", symbol: "AAPL", timeframe: "5m" },
  { chartSlot: "multi-2", symbol: "MSFT", timeframe: "5m" },
  { chartSlot: "multi-3", symbol: "GOOGL", timeframe: "5m" },
  { chartSlot: "multi-4", symbol: "NVDA", timeframe: "5m" },
];

const PRESET_STRATEGIES = [
  "vwap-bounce",
  "wick-rejection",
  "ema-crossover",
  "rsi-reversal",
];

const DEFAULT_RISK = {
  maxConsecutiveLosses: 3,
  positionSizeMinPercent: 1,
  positionSizeMaxPercent: 5,
  riskPercentMin: 0.5,
  riskPercentMax: 2,
  maxOpenPositions: 5,
};

const DEFAULT_ALERTS = {
  emailEnabled: false,
  smsEnabled: false,
  pushEnabled: true,
  onBuy: true,
  onSell: true,
  onStopLoss: true,
  onTakeProfit: true,
  onSafetyStop: true,
  onActionRequired: true,
  onTradingSchedule: true,
};

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function collectEmaSignals(symbol, bars, timeframe) {
  const MIN_BARS = 30;
  const lookback = 20;
  const start = Math.max(MIN_BARS - 1, bars.length - lookback);
  const byId = new Map();
  let picked = null;

  for (let i = start; i < bars.length; i++) {
    const slice = bars.slice(0, i + 1);
    const detectRes = await fetchJson("http://localhost:3000/api/signals/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        bars: slice,
        strategyIds: PRESET_STRATEGIES,
        style: "day",
        timeframe,
      }),
    });

    if (detectRes.data?.signal?.strategy === "ema-crossover") {
      picked = detectRes.data.signal;
    }

    for (const signal of detectRes.data?.barSignals ?? []) {
      if (signal.strategy === "ema-crossover") {
        byId.set(signal.id, signal);
      }
    }
  }

  return {
    picked,
    emaSignals: [...byId.values()].sort((a, b) => a.time - b.time),
  };
}

async function main() {
  const autoTrade = await fetchJson("http://localhost:3000/api/settings/auto-trade");
  const schedule = await fetchJson("http://localhost:3000/api/settings/trading-schedule");

  const traced = [];

  for (const slot of SLOTS) {
    const barsRes = await fetchJson(
      `http://localhost:3000/api/market/bars?symbol=${slot.symbol}&timeframe=${slot.timeframe}`
    );
    const bars = barsRes.data.bars ?? [];
    const { picked, emaSignals } = await collectEmaSignals(slot.symbol, bars, slot.timeframe);

    for (const signal of emaSignals) {
      const exec = await fetchJson("http://localhost:3000/api/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: slot.symbol,
          side: signal.side,
          price: signal.price,
          strategy: signal.strategy,
          mode: "paper",
          riskSettings: DEFAULT_RISK,
          alertSettings: DEFAULT_ALERTS,
          signalId: signal.id,
          chartSlot: slot.chartSlot,
          timeframe: slot.timeframe,
          signalReason: signal.reason,
          signalBarTime: signal.time,
        }),
      });

      const rejectionReason = exec.data.skipped
        ? exec.data.reason
        : exec.ok
          ? null
          : exec.data.error ?? "Trade failed";

      traced.push({
        chartSlot: slot.chartSlot,
        symbol: slot.symbol,
        signalId: signal.id,
        side: signal.side,
        barTime: signal.time,
        isPickedNow: picked?.id === signal.id,
        skipped: Boolean(exec.data.skipped),
        ok: exec.ok && !exec.data.skipped,
        rejectionReason,
      });
    }
  }

  const rejected = traced.filter((t) => t.rejectionReason);
  const byReason = rejected.reduce((acc, row) => {
    const key = row.rejectionReason;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        note: "Live trace via /api/trades/execute — Strategy Performance count comes from browser localStorage",
        autoTradeEnabled: autoTrade.data?.slots,
        tradingSchedule: schedule.data?.settings,
        tradingAllowedNow: schedule.data?.tradingAllowedNow,
        uniqueEmaSignalsTraced: traced.length,
        emaCrossoverRejectedInTrace: rejected.length,
        byReason,
        traced,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
