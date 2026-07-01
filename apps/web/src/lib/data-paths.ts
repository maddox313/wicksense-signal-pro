import fs from "fs";
import path from "path";

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function isRenderDiskPath(dir: string): boolean {
  return dir === "/var/data" || dir.startsWith("/var/data/");
}

/**
 * Writable data directory for SQLite, engine config, and *.local.json files.
 * Set WICKSENSE_DATA_DIR=/var/data on Render (persistent disk mount path).
 */
export function getDataDir(): string {
  const configured = process.env.WICKSENSE_DATA_DIR?.trim();
  if (!configured) {
    return process.cwd();
  }

  if (isNextProductionBuild()) {
    return process.cwd();
  }

  // Render mounts the disk at /var/data — the mount already exists; do not mkdir it.
  if (!isRenderDiskPath(configured) && !fs.existsSync(configured)) {
    fs.mkdirSync(configured, { recursive: true });
  }

  return configured;
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
