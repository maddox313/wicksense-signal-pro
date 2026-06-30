import fs from "fs";
import path from "path";

/**
 * Writable data directory for SQLite, engine config, and *.local.json files.
 * Set WICKSENSE_DATA_DIR=/var/data on Render (persistent disk mount).
 */
export function getDataDir(): string {
  const configured = process.env.WICKSENSE_DATA_DIR?.trim();
  if (configured) {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  }
  return process.cwd();
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
