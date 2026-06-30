#!/usr/bin/env node
/**
 * Standalone trade-engine worker — polls the secured cron endpoint every 30s.
 * Use when the web process should not run the in-process worker (e.g. separate Render worker).
 *
 * Env: APP_URL, CRON_SECRET
 */
const POLL_MS = 30_000;

const appUrl = (process.env.APP_URL ?? process.env.INTERNAL_APP_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("[trade-engine-worker] CRON_SECRET is required");
  process.exit(1);
}

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(`${appUrl}/api/cron/trade-engine`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    console.log(
      `[trade-engine-worker] ${res.ok ? "ok" : "error"} ${Date.now() - started}ms`,
      data
    );
  } catch (err) {
    console.error(
      "[trade-engine-worker] request failed:",
      err instanceof Error ? err.message : err
    );
  }
}

console.log(`[trade-engine-worker] Polling ${appUrl}/api/cron/trade-engine every ${POLL_MS / 1000}s`);
void tick();
setInterval(() => void tick(), POLL_MS);
