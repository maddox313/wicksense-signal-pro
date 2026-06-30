export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(
      `[wicksense] Booting server (NODE_ENV=${process.env.NODE_ENV ?? "unknown"}, data=${process.env.WICKSENSE_DATA_DIR ?? "cwd"})`
    );
    const { startTradeEngineWorker } = await import("./lib/trade-engine-worker");
    startTradeEngineWorker();
  }
}