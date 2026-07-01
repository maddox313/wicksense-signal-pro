const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DATABASE_URL = "file:./wicksense.db";

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return DEFAULT_DATABASE_URL;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    return DEFAULT_DATABASE_URL;
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

module.exports = {
  schema: "prisma/schema.prisma",
  datasource: {
    url: readDatabaseUrl(),
  },
};
