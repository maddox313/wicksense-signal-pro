import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function detectWebRoot(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fromModule = path.resolve(here, "..", "..");
    if (fs.existsSync(path.join(fromModule, "prisma", "schema.prisma"))) {
      return fromModule;
    }
  } catch {
    /* import.meta.url unavailable in some bundles */
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "prisma", "schema.prisma"))) {
    return cwd;
  }

  const nested = path.join(cwd, "apps", "web");
  if (fs.existsSync(path.join(nested, "prisma", "schema.prisma"))) {
    return nested;
  }

  return cwd;
}

const PACKAGE_WEB_ROOT = detectWebRoot();

/** Resolve apps/web — stable even when npm is started from the monorepo root. */
export function resolveWebRoot(): string {
  if (process.env.WICKSENSE_WEB_ROOT?.trim()) {
    return path.resolve(process.env.WICKSENSE_WEB_ROOT.trim());
  }
  return PACKAGE_WEB_ROOT;
}

/** Writable directory for engine config and *.local.json files. */
export function getDataDir(): string {
  return resolveWebRoot();
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
