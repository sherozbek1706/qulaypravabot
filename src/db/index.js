const knex = require("knex");

const config = require("../shared/config");

/**
 *
 */
const db = knex.knex({
  client: "postgresql",
  connection: {
    database: config.db.database,
    user: config.db.username,
    password: config.db.password,
    port: config.db.port,
  },
});

const testdb = knex.knex({
  client: "postgresql",
  connection: {
    host: config.testdb.host,
    database: config.testdb.database,
    user: config.testdb.username,
    password: config.testdb.password,
    port: config.testdb.port,
  },
});

module.exports = { db, testdb };
