const path = require("node:path");
const fs = require("node:fs");

const DEFAULT_DB_FILENAME = "wicksense.db";

function resolveWebRoot(explicitRoot) {
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }
  if (process.env.WICKSENSE_WEB_ROOT?.trim()) {
    return path.resolve(process.env.WICKSENSE_WEB_ROOT.trim());
  }
  return path.resolve(__dirname);
}

function resolveDatabaseFile(webRoot) {
  if (process.env.WICKSENSE_DB_FILE?.trim()) {
    return path.resolve(process.env.WICKSENSE_DB_FILE.trim());
  }
  return path.join(webRoot, DEFAULT_DB_FILENAME);
}

function toDatabaseUrl(databaseFile) {
  const normalized = databaseFile.replace(/\\/g, "/");
  return `file:${normalized}`;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function readDevDatabaseUrl(webRoot) {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) {
    return toDatabaseUrl(resolveDatabaseFile(webRoot));
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    return toDatabaseUrl(resolveDatabaseFile(webRoot));
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

/** Production always uses apps/web/wicksense.db; ignores stale Render dashboard env. */
function getDatabaseUrl(webRoot) {
  const root = resolveWebRoot(webRoot);
  if (isProduction()) {
    return toDatabaseUrl(resolveDatabaseFile(root));
  }
  return readDevDatabaseUrl(root);
}

function applyProductionEnv(webRoot) {
  const root = resolveWebRoot(webRoot);
  process.env.WICKSENSE_WEB_ROOT = root;

  if (!isProduction()) {
    return;
  }

  const databaseFile = resolveDatabaseFile(root);
  const databaseUrl = toDatabaseUrl(databaseFile);
  const previous = process.env.DATABASE_URL;

  process.env.WICKSENSE_DB_FILE = databaseFile;
  process.env.DATABASE_URL = databaseUrl;

  if (previous && previous !== databaseUrl) {
    console.warn(
      `[database-url] Ignoring DATABASE_URL=${previous}; using ${databaseUrl} in production`
    );
  }
}

module.exports = {
  DEFAULT_DB_FILENAME,
  getDatabaseUrl,
  applyProductionEnv,
  resolveWebRoot,
};
