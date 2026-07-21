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
]);

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

function ensureRevenueRatesTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS designation_revenue_rates (
      designation TEXT PRIMARY KEY,
      professional_service_rate REAL NOT NULL DEFAULT 0,
      intrasourcing_rate REAL NOT NULL DEFAULT 0,
      local_rate REAL NOT NULL DEFAULT 0,
      pre_sale_rate REAL NOT NULL DEFAULT 0,
      training_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (professional_service_rate >= 0),
      CHECK (intrasourcing_rate >= 0),
      CHECK (local_rate >= 0),
      CHECK (pre_sale_rate >= 0),
      CHECK (training_rate >= 0)
    )
  `).run();

  const intrasourcingAdded = addRevenueRateColumn(db, 'intrasourcing_rate');
  const localAdded = addRevenueRateColumn(db, 'local_rate');
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
      pre_sale_rate,
      training_rate
    ) VALUES (?, 0, 0, 0, 0, 0)
  `);

  db.transaction(() => {
    REVENUE_DESIGNATIONS.forEach(designation => insert.run(designation));
  })();
}

function listRevenueRates(db) {
  ensureRevenueRatesTable(db);
  const rows = db.prepare(`
    SELECT
      designation,
      intrasourcing_rate,
      local_rate,
      updated_at
    FROM designation_revenue_rates
  `).all();
  const rowMap = new Map(rows.map(row => [row.designation, row]));

  return REVENUE_DESIGNATIONS.map(designation => rowMap.get(designation) || {
    designation,
    intrasourcing_rate: 0,
    local_rate: 0,
    updated_at: null,
  });
}

function saveRevenueRates(db, rates) {
  ensureRevenueRatesTable(db);
  const update = db.prepare(`
    INSERT INTO designation_revenue_rates (
      designation,
      professional_service_rate,
      intrasourcing_rate,
      local_rate,
      pre_sale_rate,
      training_rate,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(designation) DO UPDATE SET
      professional_service_rate = excluded.professional_service_rate,
      intrasourcing_rate = excluded.intrasourcing_rate,
      local_rate = excluded.local_rate,
      pre_sale_rate = excluded.pre_sale_rate,
      training_rate = excluded.training_rate,
      updated_at = CURRENT_TIMESTAMP
  `);

  db.transaction(() => {
    rates.forEach(rate => update.run(
      rate.designation,
      rate.intrasourcing_rate,
      rate.intrasourcing_rate,
      rate.local_rate,
      rate.local_rate,
      rate.local_rate,
    ));
  })();

  return listRevenueRates(db);
}

module.exports = {
  REVENUE_DESIGNATIONS,
  REVENUE_RATE_FIELDS,
  ensureRevenueRatesTable,
  listRevenueRates,
  saveRevenueRates,
};
