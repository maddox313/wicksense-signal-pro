import {
  AUTO_TRADE_POLL_MS,
  isTradeEngineEnabled,
  runTradeEngineTick,
} from "@/lib/server-trade-engine";

type WorkerGlobal = typeof globalThis & {
  __wicksenseTradeEngineInterval?: ReturnType<typeof setInterval>;
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function clearWorkerInterval(): void {
  const g = globalThis as WorkerGlobal;
  if (g.__wicksenseTradeEngineInterval) {
    clearInterval(g.__wicksenseTradeEngineInterval);
    g.__wicksenseTradeEngineInterval = undefined;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function startTradeEngineWorker(): void {
  if (!isTradeEngineEnabled()) {
    console.log("[trade-engine] Worker disabled (set TRADE_ENGINE_ENABLED=false to disable)");
    return;
  }

  clearWorkerInterval();

  console.log(`[trade-engine] Starting server worker (every ${AUTO_TRADE_POLL_MS / 1000}s)`);

  void runTradeEngineTick().then((result) => {
    console.log("[trade-engine] Initial tick:", result);
  });

  intervalHandle = setInterval(() => {
    void runTradeEngineTick().then((result) => {
      if (!result.ok && !result.skipped && result.reason) {
        console.warn("[trade-engine] Tick error:", result.reason);
      }
    });
  }, AUTO_TRADE_POLL_MS);

  (globalThis as WorkerGlobal).__wicksenseTradeEngineInterval = intervalHandle;
}

export function stopTradeEngineWorker(): void {
  clearWorkerInterval();
}
