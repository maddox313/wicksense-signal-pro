export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTradeEngineWorker } = await import("./lib/trade-engine-worker");
    startTradeEngineWorker();
  }
}
