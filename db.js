const database = require('./server/database');

module.exports = database;

if (require.main === module) {
  const db = database.getDb();
  database.createSchema(db);
  database.runMigrations(db);
  const args = process.argv.slice(2);
  if (args.includes('--reset') && !args.includes('--seed')) {
    database.resetDatabase(db);
    console.log('Database reset.');
  }
  if (args.includes('--seed') || args.includes('--reset')) database.seed(db);
  db.close();
}
