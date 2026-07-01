#!/usr/bin/env node
/**
 * Ensure WICKSENSE_DATA_DIR exists before Prisma opens SQLite.
 * On Render, the disk mount is /var/data — app data must live in a child dir.
 */
import fs from "node:fs";

const dir = process.env.WICKSENSE_DATA_DIR?.trim();
if (!dir) {
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });
console.log(`[ensure-data-dir] ready: ${dir}`);
