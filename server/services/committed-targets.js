const COMMITTED_REVENUE_TARGET_KEYS = Object.freeze([
  'intrasourcing',
  'local',
]);

const PIPELINE_PLANNING_TARGET_KEYS = Object.freeze([
  'local_pipeline',
]);

const COMMITTED_TARGET_KEYS = Object.freeze([
  ...COMMITTED_REVENUE_TARGET_KEYS,
  ...PIPELINE_PLANNING_TARGET_KEYS,
]);

function ensureCommittedTargetsTable(db) {
  // Preserve the existing committed-target table and its original two-key
  // constraint. The planning-only Local Pipeline Target is intentionally kept
  // in a separate table so it can never be included in the Committed Target sum.
  db.prepare(`
    CREATE TABLE IF NOT EXISTS committed_revenue_targets (
      target_key TEXT PRIMARY KEY,
      amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
      updated_at TEXT,
      CHECK (target_key IN ('intrasourcing', 'local'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pipeline_planning_targets (
      target_key TEXT PRIMARY KEY,
      amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
      updated_at TEXT,
      CHECK (target_key IN ('local_pipeline'))
    )
  `).run();

  const insertCommitted = db.prepare(`
    INSERT OR IGNORE INTO committed_revenue_targets (
      target_key,
      amount,
      updated_at
    ) VALUES (?, 0, NULL)
  `);
  const insertPipeline = db.prepare(`
    INSERT OR IGNORE INTO pipeline_planning_targets (
      target_key,
      amount,
      updated_at
    ) VALUES (?, 0, NULL)
  `);

  db.transaction(() => {
    COMMITTED_REVENUE_TARGET_KEYS.forEach(key => insertCommitted.run(key));
    PIPELINE_PLANNING_TARGET_KEYS.forEach(key => insertPipeline.run(key));
  })();
}

function listCommittedTargets(db) {
  ensureCommittedTargetsTable(db);
  const committedRows = db.prepare(`
    SELECT target_key, amount, updated_at
    FROM committed_revenue_targets
  `).all();
  const pipelineRows = db.prepare(`
    SELECT target_key, amount, updated_at
    FROM pipeline_planning_targets
  `).all();
  const rowByKey = new Map(
    [...committedRows, ...pipelineRows].map(row => [row.target_key, row]),
  );

  return COMMITTED_TARGET_KEYS.map(targetKey => rowByKey.get(targetKey) || {
    target_key: targetKey,
    amount: 0,
    updated_at: null,
  });
}

function saveTargetRow(db, tableName, targetKey, amount) {
  db.prepare(`
    INSERT INTO ${tableName} (
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
    FROM ${tableName}
    WHERE target_key = ?
  `).get(targetKey);
}

function saveCommittedTarget(db, targetKey, amount) {
  ensureCommittedTargetsTable(db);

  if (PIPELINE_PLANNING_TARGET_KEYS.includes(targetKey)) {
    return saveTargetRow(db, 'pipeline_planning_targets', targetKey, amount);
  }
  return saveTargetRow(db, 'committed_revenue_targets', targetKey, amount);
}

module.exports = {
  COMMITTED_REVENUE_TARGET_KEYS,
  COMMITTED_TARGET_KEYS,
  PIPELINE_PLANNING_TARGET_KEYS,
  ensureCommittedTargetsTable,
  listCommittedTargets,
  saveCommittedTarget,
};
