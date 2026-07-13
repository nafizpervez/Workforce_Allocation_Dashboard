const REVENUE_DESIGNATIONS = Object.freeze([
  'Team Lead',
  'Senior Consultant',
  'Consultant',
  'Junior Consultant',
  'Analyst',
]);

function ensureRevenueRatesTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS designation_revenue_rates (
      designation TEXT PRIMARY KEY,
      professional_service_rate REAL NOT NULL DEFAULT 0,
      pre_sale_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (professional_service_rate >= 0),
      CHECK (pre_sale_rate >= 0)
    )
  `).run();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO designation_revenue_rates (
      designation,
      professional_service_rate,
      pre_sale_rate
    ) VALUES (?, 0, 0)
  `);

  const seed = db.transaction(() => {
    REVENUE_DESIGNATIONS.forEach(designation => insert.run(designation));
  });

  seed();
}

function listRevenueRates(db) {
  ensureRevenueRatesTable(db);
  const rows = db.prepare(`
    SELECT designation, professional_service_rate, pre_sale_rate, updated_at
    FROM designation_revenue_rates
  `).all();
  const rowMap = new Map(rows.map(row => [row.designation, row]));

  return REVENUE_DESIGNATIONS.map(designation => rowMap.get(designation) || {
    designation,
    professional_service_rate: 0,
    pre_sale_rate: 0,
    updated_at: null,
  });
}

function saveRevenueRates(db, rates) {
  ensureRevenueRatesTable(db);
  const update = db.prepare(`
    INSERT INTO designation_revenue_rates (
      designation,
      professional_service_rate,
      pre_sale_rate,
      updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(designation) DO UPDATE SET
      professional_service_rate = excluded.professional_service_rate,
      pre_sale_rate = excluded.pre_sale_rate,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction(() => {
    rates.forEach(rate => update.run(
      rate.designation,
      rate.professional_service_rate,
      rate.pre_sale_rate,
    ));
  });

  transaction();
  return listRevenueRates(db);
}

module.exports = {
  REVENUE_DESIGNATIONS,
  ensureRevenueRatesTable,
  listRevenueRates,
  saveRevenueRates,
};
