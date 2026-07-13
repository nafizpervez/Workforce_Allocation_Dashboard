const { DB_PATH, getDb } = require('./connection');
const { createSchema } = require('./schema');
const { runMigrations } = require('./migrations');
const { resetDatabase, seed } = require('./seeder');

let appDb;
function getAppDb() {
  if (!appDb) {
    appDb = getDb();
    createSchema(appDb);
    runMigrations(appDb);
  }
  return appDb;
}

module.exports = { DB_PATH, createSchema, getAppDb, getDb, resetDatabase, runMigrations, seed };
