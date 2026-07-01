require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { getDatabaseUrl } = require("../database-url.cjs");

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: getDatabaseUrl() }),
  });
}

module.exports = { createPrismaClient };
