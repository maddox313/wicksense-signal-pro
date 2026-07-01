#!/usr/bin/env node
/**
 * Verify WICKSENSE_DATA_DIR is present and writable before Prisma opens SQLite.
 * On Render, /var/data is the persistent disk mount — never mkdir it or subdirs here.
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.env.WICKSENSE_DATA_DIR?.trim();
if (!dir) {
  process.exit(0);
}

if (!fs.existsSync(dir)) {
  console.error(
    `[ensure-data-dir] ${dir} does not exist. Confirm the Render persistent disk is mounted at /var/data.`
  );
  process.exit(1);
}

const probe = path.join(dir, `.write-probe-${process.pid}`);
try {
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ensure-data-dir] ${dir} is not writable: ${message}`);
  process.exit(1);
}

console.log(`[ensure-data-dir] writable: ${dir}`);
