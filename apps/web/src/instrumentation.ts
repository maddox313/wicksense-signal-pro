export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resolveWebRoot } = await import("./lib/data-paths");
    const webRoot = resolveWebRoot();
    process.env.WICKSENSE_WEB_ROOT = webRoot;

    console.log(
      `[wicksense] Booting server (NODE_ENV=${process.env.NODE_ENV ?? "unknown"}, cwd=${process.cwd()}, dataDir=${webRoot})`
    );
    const { startTradeEngineWorker } = await import("./lib/trade-engine-worker");
    startTradeEngineWorker();
  }
}
