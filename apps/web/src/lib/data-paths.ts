import fs from "fs";
import path from "path";

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Writable data directory for SQLite, engine config, and *.local.json files.
 * Set WICKSENSE_DATA_DIR=/var/data/data on Render (child of persistent disk mount).
 */
export function getDataDir(): string {
  const configured = process.env.WICKSENSE_DATA_DIR?.trim();
  if (configured) {
    try {
      fs.mkdirSync(configured, { recursive: true });
    } catch (error) {
      // Render's persistent disk is mounted at runtime, not during `next build`.
      if (isNextProductionBuild()) {
        return process.cwd();
      }
      throw error;
    }
    return configured;
  }
  return process.cwd();
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
