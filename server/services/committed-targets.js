const COMMITTED_TARGET_KEYS = Object.freeze([
  'intrasourcing',
  'local',
]);

function ensureCommittedTargetsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS committed_revenue_targets (
      target_key TEXT PRIMARY KEY,
      amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
      updated_at TEXT,
      CHECK (target_key IN ('intrasourcing', 'local'))
    )
  `).run();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO committed_revenue_targets (
      target_key,
      amount,
      updated_at
    ) VALUES (?, 0, NULL)
  `);

  db.transaction(() => {
    COMMITTED_TARGET_KEYS.forEach(key => insert.run(key));
  })();
}

function listCommittedTargets(db) {
  ensureCommittedTargetsTable(db);
  const rows = db.prepare(`
    SELECT target_key, amount, updated_at
    FROM committed_revenue_targets
  `).all();
  const rowByKey = new Map(rows.map(row => [row.target_key, row]));

  return COMMITTED_TARGET_KEYS.map(targetKey => rowByKey.get(targetKey) || {
    target_key: targetKey,
    amount: 0,
    updated_at: null,
  });
}

function saveCommittedTarget(db, targetKey, amount) {
  ensureCommittedTargetsTable(db);
  db.prepare(`
    INSERT INTO committed_revenue_targets (
      target_key,
      amount,
      updated_at
    ) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(target_key) DO UPDATE SET
      amount = excluded.amount,
      updated_at = CURRENT_TIMESTAMP
  `).run(targetKey, amount);

  return db.prepare(`
    SELECT target_key, amount, updated_at
    FROM committed_revenue_targets
    WHERE target_key = ?
  `).get(targetKey);
}

module.exports = {
  COMMITTED_TARGET_KEYS,
  ensureCommittedTargetsTable,
  listCommittedTargets,
  saveCommittedTarget,
};
