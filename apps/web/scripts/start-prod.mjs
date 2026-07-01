#!/usr/bin/env node
/**
 * Production startup for Render: verify disk, run prisma db push, start Next.js.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const RENDER_DISK = "/var/data";

function normalizeRenderDataEnv() {
  let dataDir = process.env.WICKSENSE_DATA_DIR?.trim();
  let databaseUrl = process.env.DATABASE_URL?.trim();

  if (dataDir === `${RENDER_DISK}/data` || dataDir === `${RENDER_DISK}/data/`) {
    console.warn(
      `[start-prod] WICKSENSE_DATA_DIR=${dataDir} is invalid on Render; using ${RENDER_DISK}`
    );
    dataDir = RENDER_DISK;
  }

  if (databaseUrl?.includes("/var/data/data/")) {
    const fixed = databaseUrl.replace("/var/data/data/", "/var/data/");
    console.warn(`[start-prod] DATABASE_URL corrected: ${fixed}`);
    databaseUrl = fixed;
  }

  if (dataDir) {
    process.env.WICKSENSE_DATA_DIR = dataDir;
  }
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  return { dataDir, databaseUrl };
}

function verifyDataDir(dataDir) {
  if (!dataDir) {
    return;
  }

  if (!fs.existsSync(dataDir)) {
    console.error(
      `[start-prod] ${dataDir} does not exist. Attach a Render persistent disk mounted at ${RENDER_DISK}.`
    );
    process.exit(1);
  }

  const probe = path.join(dataDir, `.write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[start-prod] ${dataDir} is not writable: ${message}`);
    process.exit(1);
  }

  console.log(`[start-prod] data dir writable: ${dataDir}`);
}

function runPrismaDbPush() {
  console.log(`[start-prod] prisma db push (DATABASE_URL=${process.env.DATABASE_URL ?? "unset"})`);
  const result = spawnSync("npx", ["prisma", "db", "push"], {
    cwd: webRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function startNext() {
  const localNext = path.resolve(webRoot, "node_modules/next/dist/bin/next");
  const rootNext = path.resolve(webRoot, "../../node_modules/next/dist/bin/next");
  const nextBin = fs.existsSync(localNext) ? localNext : rootNext;
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
}

const { dataDir, databaseUrl } = normalizeRenderDataEnv();
console.log(
  `[start-prod] boot (WICKSENSE_DATA_DIR=${dataDir ?? "cwd"}, DATABASE_URL=${databaseUrl ?? "unset"})`
);
verifyDataDir(dataDir);
runPrismaDbPush();
startNext();
