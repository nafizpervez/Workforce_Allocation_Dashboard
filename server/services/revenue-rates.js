const REVENUE_DESIGNATIONS = Object.freeze([
  'Team Lead',
  'Senior Consultant',
  'Consultant',
  'Junior Consultant',
  'Analyst',
]);

const REVENUE_RATE_FIELDS = Object.freeze([
  'intrasourcing_rate',
  'local_rate',
  'cost_rate',
]);

const REVENUE_RATE_BASELINE_DATE = '1900-01-01';
const REVENUE_RATE_CHANGE_MODES = Object.freeze(['future', 'all']);

function getTableColumns(db, tableName) {
  return new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name),
  );
}

function addRevenueRateColumn(db, columnName) {
  const columns = getTableColumns(db, 'designation_revenue_rates');
  if (columns.has(columnName)) return false;

  db.prepare(`
    ALTER TABLE designation_revenue_rates
    ADD COLUMN ${columnName} REAL NOT NULL DEFAULT 0 CHECK (${columnName} >= 0)
  `).run();
  return true;
}

function normalizeEffectiveDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return null;
  }
  return text;
}

function ensureRevenueRateHistoryTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS designation_revenue_rate_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      designation TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      intrasourcing_rate REAL NOT NULL DEFAULT 0,
      local_rate REAL NOT NULL DEFAULT 0,
      cost_rate REAL NOT NULL DEFAULT 0,
      change_scope TEXT NOT NULL DEFAULT 'all',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (intrasourcing_rate >= 0),
      CHECK (local_rate >= 0),
      CHECK (cost_rate >= 0),
      CHECK (change_scope IN ('future', 'all')),
      UNIQUE (designation, effective_from)
    )
  `).run();

  const historyColumns = getTableColumns(db, 'designation_revenue_rate_history');
  if (!historyColumns.has('cost_rate')) {
    db.prepare(`
      ALTER TABLE designation_revenue_rate_history
      ADD COLUMN cost_rate REAL NOT NULL DEFAULT 0 CHECK (cost_rate >= 0)
    `).run();
  }

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_designation_revenue_rate_history_lookup
    ON designation_revenue_rate_history(designation, effective_from)
  `).run();
}

function ensureRevenueRatesTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS designation_revenue_rates (
      designation TEXT PRIMARY KEY,
      professional_service_rate REAL NOT NULL DEFAULT 0,
      intrasourcing_rate REAL NOT NULL DEFAULT 0,
      local_rate REAL NOT NULL DEFAULT 0,
      cost_rate REAL NOT NULL DEFAULT 0,
      pre_sale_rate REAL NOT NULL DEFAULT 0,
      training_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (professional_service_rate >= 0),
      CHECK (intrasourcing_rate >= 0),
      CHECK (local_rate >= 0),
      CHECK (cost_rate >= 0),
      CHECK (pre_sale_rate >= 0),
      CHECK (training_rate >= 0)
    )
  `).run();

  const intrasourcingAdded = addRevenueRateColumn(db, 'intrasourcing_rate');
  const localAdded = addRevenueRateColumn(db, 'local_rate');
  addRevenueRateColumn(db, 'cost_rate');
  addRevenueRateColumn(db, 'pre_sale_rate');
  addRevenueRateColumn(db, 'training_rate');

  if (intrasourcingAdded) {
    db.prepare(`
      UPDATE designation_revenue_rates
      SET intrasourcing_rate = professional_service_rate
    `).run();
  }

  if (localAdded) {
    db.prepare(`
      UPDATE designation_revenue_rates
      SET local_rate = pre_sale_rate
    `).run();
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO designation_revenue_rates (
      designation,
      professional_service_rate,
      intrasourcing_rate,
      local_rate,
      cost_rate,
      pre_sale_rate,
      training_rate
    ) VALUES (?, 0, 0, 0, 0, 0, 0)
  `);

  db.transaction(() => {
    REVENUE_DESIGNATIONS.forEach(designation => insert.run(designation));
  })();

  ensureRevenueRateHistoryTable(db);

  const insertBaseline = db.prepare(`
    INSERT OR IGNORE INTO designation_revenue_rate_history (
      designation,
      effective_from,
      intrasourcing_rate,
      local_rate,
      cost_rate,
      change_scope
    )
    SELECT designation, ?, intrasourcing_rate, local_rate, cost_rate, 'all'
    FROM designation_revenue_rates
    WHERE designation = ?
  `);

  db.transaction(() => {
    REVENUE_DESIGNATIONS.forEach(designation => {
      const count = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM designation_revenue_rate_history
        WHERE designation = ?
      `).get(designation)?.count) || 0;
      if (count === 0) insertBaseline.run(REVENUE_RATE_BASELINE_DATE, designation);
    });
  })();
}

function listRevenueRates(db) {
  ensureRevenueRatesTable(db);
  const rows = db.prepare(`
    SELECT
      designation,
      intrasourcing_rate,
      local_rate,
      cost_rate,
      updated_at
    FROM designation_revenue_rates
  `).all();
  const historyRows = db.prepare(`
    SELECT
      id,
      designation,
      effective_from,
      intrasourcing_rate,
      local_rate,
      cost_rate,
      change_scope,
      created_at
    FROM designation_revenue_rate_history
    ORDER BY designation, effective_from, id
  `).all();

  const rowMap = new Map(rows.map(row => [row.designation, row]));
  const historyMap = new Map(REVENUE_DESIGNATIONS.map(designation => [designation, []]));
  historyRows.forEach(row => {
    if (!historyMap.has(row.designation)) historyMap.set(row.designation, []);
    historyMap.get(row.designation).push(row);
  });

  return REVENUE_DESIGNATIONS.map(designation => ({
    ...(rowMap.get(designation) || {
      designation,
      intrasourcing_rate: 0,
      local_rate: 0,
      cost_rate: 0,
      updated_at: null,
    }),
    history: historyMap.get(designation) || [],
  }));
}

function ratesEqual(left, right) {
  return REVENUE_RATE_FIELDS.every(field => Number(left?.[field]) === Number(right?.[field]));
}

function getLatestHistoryRate(db, designation) {
  return db.prepare(`
    SELECT designation, effective_from, intrasourcing_rate, local_rate, cost_rate
    FROM designation_revenue_rate_history
    WHERE designation = ?
    ORDER BY effective_from DESC, id DESC
    LIMIT 1
  `).get(designation);
}

function updateRevenueRateSnapshot(db, designation) {
  const latest = getLatestHistoryRate(db, designation);
  if (!latest) return;

  db.prepare(`
    INSERT INTO designation_revenue_rates (
      designation,
      professional_service_rate,
      intrasourcing_rate,
      local_rate,
      cost_rate,
      pre_sale_rate,
      training_rate,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(designation) DO UPDATE SET
      professional_service_rate = excluded.professional_service_rate,
      intrasourcing_rate = excluded.intrasourcing_rate,
      local_rate = excluded.local_rate,
      cost_rate = excluded.cost_rate,
      pre_sale_rate = excluded.pre_sale_rate,
      training_rate = excluded.training_rate,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    designation,
    latest.intrasourcing_rate,
    latest.intrasourcing_rate,
    latest.local_rate,
    latest.cost_rate,
    latest.local_rate,
    latest.local_rate,
  );
}

function saveRevenueRates(db, rates, options = {}) {
  ensureRevenueRatesTable(db);

  const applyMode = String(options.applyMode || 'all').trim().toLowerCase();
  if (!REVENUE_RATE_CHANGE_MODES.includes(applyMode)) {
    throw new Error('Invalid revenue-rate change mode.');
  }

  const effectiveDate = applyMode === 'future'
    ? normalizeEffectiveDate(options.effectiveDate)
    : REVENUE_RATE_BASELINE_DATE;
  if (!effectiveDate) throw new Error('A valid effective date is required for future-only rate changes.');

  const currentMap = new Map(listRevenueRates(db).map(rate => [rate.designation, rate]));
  const deleteHistory = db.prepare(`
    DELETE FROM designation_revenue_rate_history
    WHERE designation = ?
  `);
  const upsertHistory = db.prepare(`
    INSERT INTO designation_revenue_rate_history (
      designation,
      effective_from,
      intrasourcing_rate,
      local_rate,
      cost_rate,
      change_scope,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(designation, effective_from) DO UPDATE SET
      intrasourcing_rate = excluded.intrasourcing_rate,
      local_rate = excluded.local_rate,
      cost_rate = excluded.cost_rate,
      change_scope = excluded.change_scope,
      created_at = CURRENT_TIMESTAMP
  `);

  db.transaction(() => {
    rates.forEach(rate => {
      const current = currentMap.get(rate.designation);
      if (current && ratesEqual(current, rate)) return;

      if (applyMode === 'all') deleteHistory.run(rate.designation);
      upsertHistory.run(
        rate.designation,
        effectiveDate,
        rate.intrasourcing_rate,
        rate.local_rate,
        rate.cost_rate,
        applyMode,
      );
      updateRevenueRateSnapshot(db, rate.designation);
    });
  })();

  return listRevenueRates(db);
}

module.exports = {
  REVENUE_DESIGNATIONS,
  REVENUE_RATE_BASELINE_DATE,
  REVENUE_RATE_CHANGE_MODES,
  REVENUE_RATE_FIELDS,
  ensureRevenueRatesTable,
  listRevenueRates,
  normalizeEffectiveDate,
  saveRevenueRates,
};
