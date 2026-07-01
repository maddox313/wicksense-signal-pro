const { getDatabaseUrl } = require("./database-url.cjs");

module.exports = {
  schema: "prisma/schema.prisma",
  datasource: {
    url: getDatabaseUrl(),
  },
};
