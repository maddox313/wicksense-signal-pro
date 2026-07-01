/**
 * Correct stale Render env vars that point at /var/data/data (invalid).
 * Never mkdir — only normalize paths read from the environment.
 */
function normalizeDatabaseUrl(url) {
  if (!url || !url.includes("/var/data/data")) {
    return url;
  }
  return url.replaceAll("/var/data/data", "/var/data");
}

function normalizeDataDir(dir) {
  if (!dir) {
    return dir;
  }
  const trimmed = dir.trim();
  if (trimmed === "/var/data/data" || trimmed.startsWith("/var/data/data/")) {
    return "/var/data";
  }
  return trimmed;
}

function applyRenderEnv() {
  if (process.env.DATABASE_URL) {
    const fixed = normalizeDatabaseUrl(process.env.DATABASE_URL);
    if (fixed !== process.env.DATABASE_URL) {
      console.warn(`[render-data-env] DATABASE_URL corrected to ${fixed}`);
      process.env.DATABASE_URL = fixed;
    }
  }

  if (process.env.WICKSENSE_DATA_DIR) {
    const fixed = normalizeDataDir(process.env.WICKSENSE_DATA_DIR);
    if (fixed !== process.env.WICKSENSE_DATA_DIR) {
      console.warn(`[render-data-env] WICKSENSE_DATA_DIR corrected to ${fixed}`);
      process.env.WICKSENSE_DATA_DIR = fixed;
    }
  }
}

module.exports = { applyRenderEnv, normalizeDatabaseUrl, normalizeDataDir };
