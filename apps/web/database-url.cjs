const PRODUCTION_DATABASE_URL = "file:./wicksense.db";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function readDevDatabaseUrl() {
  const fs = require("node:fs");
  const path = require("node:path");

  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return PRODUCTION_DATABASE_URL;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    return PRODUCTION_DATABASE_URL;
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

/** Production always uses local SQLite; ignores stale Render dashboard env. */
function getDatabaseUrl() {
  if (isProduction()) {
    return PRODUCTION_DATABASE_URL;
  }
  return readDevDatabaseUrl();
}

function applyProductionDatabaseUrl() {
  if (!isProduction()) {
    return;
  }

  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = PRODUCTION_DATABASE_URL;
  if (previous && previous !== PRODUCTION_DATABASE_URL) {
    console.warn(
      `[database-url] Ignoring DATABASE_URL=${previous}; using ${PRODUCTION_DATABASE_URL} in production`
    );
  }
}

module.exports = {
  PRODUCTION_DATABASE_URL,
  getDatabaseUrl,
  applyProductionDatabaseUrl,
};
