#!/usr/bin/env node
/**
 * Render production boot: fix stale env, prisma db push, next start.
 * Equivalent to: npx prisma db push && node scripts/start-prod.mjs
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { applyRenderEnv, normalizeDatabaseUrl } = require("../render-data-env.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

applyRenderEnv();

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL ?? "");
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const prismaArgs = ["prisma", "db", "push"];
if (databaseUrl) {
  prismaArgs.push("--url", databaseUrl);
}

console.log(`[run-start-prod] npx ${prismaArgs.join(" ")}`);
const push = spawnSync("npx", prismaArgs, {
  cwd: webRoot,
  stdio: "inherit",
  env: process.env,
});
if (push.status !== 0) {
  process.exit(push.status ?? 1);
}

console.log("[run-start-prod] node scripts/start-prod.mjs");
const start = spawnSync(process.execPath, [path.join(__dirname, "start-prod.mjs")], {
  cwd: webRoot,
  stdio: "inherit",
  env: process.env,
});
process.exit(start.status ?? 0);
