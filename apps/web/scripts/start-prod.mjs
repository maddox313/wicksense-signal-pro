#!/usr/bin/env node
/**
 * Production Next.js server — binds 0.0.0.0 on PORT (Render injects PORT).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require("../render-data-env.cjs").applyRenderEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const localNext = path.resolve(webRoot, "node_modules/next/dist/bin/next");
const rootNext = path.resolve(webRoot, "../../node_modules/next/dist/bin/next");
const nextBin = existsSync(localNext) ? localNext : rootNext;
const host = "0.0.0.0";
const port = process.env.PORT ?? "3000";

console.log(`[start-prod] next start -H ${host} -p ${port}`);

const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  cwd: webRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("[start-prod] Failed to start Next.js:", err);
  process.exit(1);
});
