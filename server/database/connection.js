const path = require('path');
const Database = require('../../sqlite-driver');

const DB_PATH = path.join(__dirname, '..', '..', 'workforce.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

module.exports = { DB_PATH, getDb };
