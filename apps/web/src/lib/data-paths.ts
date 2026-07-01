import fs from "fs";
import path from "path";

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function isRenderDiskPath(dir: string): boolean {
  return dir === "/var/data" || dir.startsWith("/var/data/");
}

function normalizeDataDir(dir: string): string {
  if (dir === "/var/data/data" || dir.startsWith("/var/data/data/")) {
    return "/var/data";
  }
  return dir;
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

  const dataDir = normalizeDataDir(configured);

  if (isNextProductionBuild()) {
    return process.cwd();
  }

  // Render mounts the disk at /var/data — the mount already exists; do not mkdir it.
  if (!isRenderDiskPath(dataDir) && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
