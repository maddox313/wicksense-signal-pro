import path from "path";

export const PRODUCTION_DB_FILENAME = "wicksense.db";

function resolveWebRoot(): string {
  if (process.env.WICKSENSE_WEB_ROOT?.trim()) {
    return path.resolve(process.env.WICKSENSE_WEB_ROOT.trim());
  }
  return process.cwd();
}

function resolveDatabaseFile(): string {
  if (process.env.WICKSENSE_DB_FILE?.trim()) {
    return path.resolve(process.env.WICKSENSE_DB_FILE.trim());
  }
  return path.join(resolveWebRoot(), PRODUCTION_DB_FILENAME);
}

function toDatabaseUrl(databaseFile: string): string {
  const normalized = databaseFile.replace(/\\/g, "/");
  return `file:${normalized}`;
}

/** Production always uses apps/web/wicksense.db; ignores stale Render dashboard env. */
export function getDatabaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return toDatabaseUrl(resolveDatabaseFile());
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}
