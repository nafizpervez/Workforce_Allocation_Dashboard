const { normalizeAssignmentText } = require('./assignment-metadata');

const DEFAULT_PRESALE_PRODUCT_SETTINGS = Object.freeze({
  securedMinPercent: 90,
  bestCaseMinPercent: 70,
});

function hasTableColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some(column => (
    String(column.name || '').toLowerCase() === String(columnName || '').toLowerCase()
  ));
}

function ensurePreSaleProductsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS presale_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0),
      probability_percent REAL NOT NULL DEFAULT 0 CHECK(probability_percent >= 0 AND probability_percent <= 100),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  if (!hasTableColumn(db, 'presale_products', 'probability_percent')) {
    db.prepare(`
      ALTER TABLE presale_products
      ADD COLUMN probability_percent REAL NOT NULL DEFAULT 0
    `).run();
  }

  db.prepare('CREATE INDEX IF NOT EXISTS idx_presale_products_name ON presale_products(name)').run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS presale_product_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      secured_min_percent REAL NOT NULL DEFAULT 90,
      best_case_min_percent REAL NOT NULL DEFAULT 70,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO presale_product_settings (
      id,
      secured_min_percent,
      best_case_min_percent
    ) VALUES (1, 90, 70)
  `).run();
}

function mapPreSaleProductRow(product) {
  return {
    ...product,
    amount: Number(product.amount) || 0,
    percent: Number(product.percent) || 0,
  };
}

function listPreSaleProducts(db) {
  ensurePreSaleProductsTable(db);
  return db.prepare(`
    SELECT
      id,
      name,
      amount,
      probability_percent AS percent,
      created_at,
      updated_at
    FROM presale_products
    ORDER BY name COLLATE NOCASE, id
  `).all().map(mapPreSaleProductRow);
}

function findPreSaleProductByName(db, name) {
  const normalizedName = normalizeAssignmentText(name);
  if (!normalizedName) return null;

  ensurePreSaleProductsTable(db);
  const product = db.prepare(`
    SELECT
      id,
      name,
      amount,
      probability_percent AS percent,
      created_at,
      updated_at
    FROM presale_products
    WHERE name = ? COLLATE NOCASE
  `).get(normalizedName);

  return product ? mapPreSaleProductRow(product) : null;
}

function normalizeProductRows(products, existingRows = []) {
  if (!Array.isArray(products)) {
    const error = new Error('products must be an array');
    error.statusCode = 400;
    throw error;
  }

  const existingById = new Map(
    (existingRows || []).map(product => [Number(product.id), product]),
  );
  const normalizedNames = new Set();

  return products.map((product, index) => {
    const id = product?.id === null || product?.id === undefined || product?.id === ''
      ? null
      : Number(product.id);
    const name = normalizeAssignmentText(product?.name);
    const amount = Number(product?.amount);
    const existingPercent = id === null
      ? 0
      : Number(existingById.get(id)?.percent) || 0;
    const percentSource = product?.percent ?? product?.percentage ?? existingPercent;
    const percent = Number(percentSource);

    if (id !== null && (!Number.isInteger(id) || id <= 0)) {
      const error = new Error(`Product row ${index + 1} has an invalid id.`);
      error.statusCode = 400;
      throw error;
    }
    if (!name) {
      const error = new Error(`Product row ${index + 1} requires a Product Name.`);
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      const error = new Error(`Product row ${index + 1} requires a non-negative Amount.`);
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      const error = new Error(`Product row ${index + 1} requires a Percent from 0 to 100.`);
      error.statusCode = 400;
      throw error;
    }

    const nameKey = name.toLocaleLowerCase('en-US');
    if (normalizedNames.has(nameKey)) {
      const error = new Error(`Duplicate PreSale Product Name: ${name}`);
      error.statusCode = 400;
      throw error;
    }
    normalizedNames.add(nameKey);

    return {
      id,
      name,
      amount: +amount.toFixed(2),
      percent: +percent.toFixed(2),
    };
  });
}

function normalizePreSaleProductSettings(settings = {}) {
  const securedSource = settings?.securedMinPercent
    ?? settings?.securedMin
    ?? settings?.secured
    ?? DEFAULT_PRESALE_PRODUCT_SETTINGS.securedMinPercent;
  const bestCaseSource = settings?.bestCaseMinPercent
    ?? settings?.bestCaseMin
    ?? settings?.bestCase
    ?? DEFAULT_PRESALE_PRODUCT_SETTINGS.bestCaseMinPercent;
  const securedMinPercent = Number(securedSource);
  const bestCaseMinPercent = Number(bestCaseSource);

  if (!Number.isFinite(securedMinPercent) || securedMinPercent <= 0 || securedMinPercent > 100) {
    const error = new Error('Secured threshold must be greater than 0 and no more than 100.');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(bestCaseMinPercent) || bestCaseMinPercent < 0 || bestCaseMinPercent >= 100) {
    const error = new Error('Best Case threshold must be from 0 to below 100.');
    error.statusCode = 400;
    throw error;
  }
  if (bestCaseMinPercent >= securedMinPercent) {
    const error = new Error('Best Case threshold must be lower than the Secured threshold.');
    error.statusCode = 400;
    throw error;
  }

  return {
    securedMinPercent: +securedMinPercent.toFixed(2),
    bestCaseMinPercent: +bestCaseMinPercent.toFixed(2),
  };
}

function getPreSaleProductSettings(db) {
  ensurePreSaleProductsTable(db);
  const row = db.prepare(`
    SELECT secured_min_percent, best_case_min_percent
    FROM presale_product_settings
    WHERE id = 1
  `).get();

  return normalizePreSaleProductSettings({
    securedMinPercent: row?.secured_min_percent,
    bestCaseMinPercent: row?.best_case_min_percent,
  });
}

function savePreSaleProductSettings(db, settings) {
  ensurePreSaleProductsTable(db);
  const normalized = normalizePreSaleProductSettings(settings);

  db.prepare(`
    INSERT INTO presale_product_settings (
      id,
      secured_min_percent,
      best_case_min_percent,
      updated_at
    ) VALUES (1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      secured_min_percent = excluded.secured_min_percent,
      best_case_min_percent = excluded.best_case_min_percent,
      updated_at = CURRENT_TIMESTAMP
  `).run(normalized.securedMinPercent, normalized.bestCaseMinPercent);

  return getPreSaleProductSettings(db);
}

function savePreSaleProducts(db, products) {
  ensurePreSaleProductsTable(db);
  const existingRows = listPreSaleProducts(db);
  const rows = normalizeProductRows(products, existingRows);
  const existingById = new Map(existingRows.map(product => [Number(product.id), product]));
  const retainedIds = new Set(rows.filter(product => product.id !== null).map(product => product.id));

  for (const product of rows) {
    if (product.id !== null && !existingById.has(product.id)) {
      const error = new Error(`PreSale Product ${product.id} was not found.`);
      error.statusCode = 404;
      throw error;
    }
  }

  const removedRows = existingRows.filter(product => !retainedIds.has(Number(product.id)));
  const referencedCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM assignments
    WHERE TRIM(COALESCE(product_name, '')) = ? COLLATE NOCASE
  `);

  for (const product of removedRows) {
    if (Number(referencedCount.get(product.name)?.count) > 0) {
      const error = new Error(`Cannot remove “${product.name}” because it is selected in one or more assignments.`);
      error.statusCode = 409;
      throw error;
    }
  }

  const updateProductToTemporaryName = db.prepare(`
    UPDATE presale_products
    SET name = ?, amount = ?, probability_percent = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const updateAssignmentsByName = db.prepare(`
    UPDATE assignments
    SET product_name = ?
    WHERE TRIM(COALESCE(product_name, '')) = ? COLLATE NOCASE
  `);
  const deleteProduct = db.prepare('DELETE FROM presale_products WHERE id = ?');
  const insertProduct = db.prepare(`
    INSERT INTO presale_products(name, amount, probability_percent)
    VALUES (?, ?, ?)
  `);
  const updateProductFinal = db.prepare(`
    UPDATE presale_products
    SET name = ?, amount = ?, probability_percent = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    const temporaryNames = new Map();

    for (const product of rows.filter(item => item.id !== null)) {
      const existing = existingById.get(product.id);
      const temporaryName = `__presale_product_${product.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      temporaryNames.set(product.id, temporaryName);
      updateAssignmentsByName.run(temporaryName, existing.name);
      updateProductToTemporaryName.run(
        temporaryName,
        existing.amount,
        existing.percent,
        product.id,
      );
    }

    for (const product of removedRows) deleteProduct.run(product.id);

    const savedRows = [];
    for (const product of rows) {
      if (product.id === null) {
        const info = insertProduct.run(product.name, product.amount, product.percent);
        savedRows.push({ ...product, id: Number(info.lastInsertRowid) });
        continue;
      }

      updateProductFinal.run(product.name, product.amount, product.percent, product.id);
      updateAssignmentsByName.run(product.name, temporaryNames.get(product.id));
      savedRows.push(product);
    }

    return savedRows;
  });

  transaction();
  return listPreSaleProducts(db);
}

module.exports = {
  DEFAULT_PRESALE_PRODUCT_SETTINGS,
  ensurePreSaleProductsTable,
  findPreSaleProductByName,
  getPreSaleProductSettings,
  listPreSaleProducts,
  normalizePreSaleProductSettings,
  normalizeProductRows,
  savePreSaleProductSettings,
  savePreSaleProducts,
};
