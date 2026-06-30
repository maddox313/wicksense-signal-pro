const fs = require("node:fs");
const path = require("node:path");

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return "";
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    return "";
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

module.exports = {
  schema: "prisma/schema.prisma",
  datasource: {
    url: readDatabaseUrl(),
  },
};
