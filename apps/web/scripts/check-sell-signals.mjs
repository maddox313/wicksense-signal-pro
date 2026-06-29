/** Check whether sell signals exist for open app positions */
async function checkSymbol(symbol, timeframe, strategies) {
  const barsRes = await fetch(
    `http://localhost:3001/api/market/bars?symbol=${symbol}&timeframe=${timeframe}`
  );
  const barsData = await barsRes.json();
  const bars = barsData.bars ?? [];
  if (bars.length < 30) {
    console.log(`${symbol} ${timeframe}: only ${bars.length} bars`);
    return;
  }

  const detectRes = await fetch("http://localhost:3001/api/signals/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      bars,
      strategyIds: strategies,
      style: "day",
      timeframe,
    }),
  });
  const data = await detectRes.json();
  const recent = data.signal;
  const sells = (data.barSignals ?? []).filter((s) => s.side === "sell");
  const buys = (data.barSignals ?? []).filter((s) => s.side === "buy");

  console.log(`\n=== ${symbol} (${timeframe}) ===`);
  console.log(`Recent signal: ${recent ? `${recent.side} ${recent.strategy} @ bar ${recent.time} conf ${recent.confidence.toFixed(2)} id ${recent.id}` : "none"}`);
  console.log(`Current bar: ${buys.length} buy, ${sells.length} sell`);
  if (sells.length) {
    for (const s of sells) {
      console.log(`  SELL ${s.strategy} conf ${s.confidence.toFixed(2)} bar ${s.time} id ${s.id}`);
    }
  }
}

const strategies = ["vwap-bounce", "wick-rejection", "ema-crossover", "rsi-reversal"];

async function main() {
  await checkSymbol("QQQ", "1m", strategies);
  await checkSymbol("NVDA", "5m", strategies);
  await checkSymbol("DIS", "5m", strategies);
}

main().catch(console.error);
