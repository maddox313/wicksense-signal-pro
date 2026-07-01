export const PRODUCTION_DATABASE_URL = "file:./wicksense.db";

/** Production always uses local SQLite; ignores stale Render dashboard env. */
export function getDatabaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_DATABASE_URL;
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}
