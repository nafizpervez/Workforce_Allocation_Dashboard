const { normalizeAssignmentText } = require('./assignment-metadata');

function ensurePreSaleProductsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS presale_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_presale_products_name ON presale_products(name)').run();
}

function listPreSaleProducts(db) {
  ensurePreSaleProductsTable(db);
  return db.prepare(`
    SELECT id, name, amount, created_at, updated_at
    FROM presale_products
    ORDER BY name COLLATE NOCASE, id
  `).all().map(product => ({
    ...product,
    amount: Number(product.amount) || 0,
  }));
}

function findPreSaleProductByName(db, name) {
  const normalizedName = normalizeAssignmentText(name);
  if (!normalizedName) return null;

  ensurePreSaleProductsTable(db);
  return db.prepare(`
    SELECT id, name, amount, created_at, updated_at
    FROM presale_products
    WHERE name = ? COLLATE NOCASE
  `).get(normalizedName) || null;
}

function normalizeProductRows(products) {
  if (!Array.isArray(products)) {
    const error = new Error('products must be an array');
    error.statusCode = 400;
    throw error;
  }

  const normalizedNames = new Set();
  return products.map((product, index) => {
    const id = product?.id === null || product?.id === undefined || product?.id === ''
      ? null
      : Number(product.id);
    const name = normalizeAssignmentText(product?.name);
    const amount = Number(product?.amount);

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

    const nameKey = name.toLocaleLowerCase('en-US');
    if (normalizedNames.has(nameKey)) {
      const error = new Error(`Duplicate PreSale Product Name: ${name}`);
      error.statusCode = 400;
      throw error;
    }
    normalizedNames.add(nameKey);

    return { id, name, amount: +amount.toFixed(2) };
  });
}

function savePreSaleProducts(db, products) {
  ensurePreSaleProductsTable(db);
  const rows = normalizeProductRows(products);
  const existingRows = listPreSaleProducts(db);
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
    SET name = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const updateAssignmentsByName = db.prepare(`
    UPDATE assignments
    SET product_name = ?
    WHERE TRIM(COALESCE(product_name, '')) = ? COLLATE NOCASE
  `);
  const deleteProduct = db.prepare('DELETE FROM presale_products WHERE id = ?');
  const insertProduct = db.prepare(`
    INSERT INTO presale_products(name, amount)
    VALUES (?, ?)
  `);
  const updateProductFinal = db.prepare(`
    UPDATE presale_products
    SET name = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    const temporaryNames = new Map();

    for (const product of rows.filter(item => item.id !== null)) {
      const existing = existingById.get(product.id);
      const temporaryName = `__presale_product_${product.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      temporaryNames.set(product.id, temporaryName);
      updateAssignmentsByName.run(temporaryName, existing.name);
      updateProductToTemporaryName.run(temporaryName, existing.amount, product.id);
    }

    for (const product of removedRows) deleteProduct.run(product.id);

    const savedRows = [];
    for (const product of rows) {
      if (product.id === null) {
        const info = insertProduct.run(product.name, product.amount);
        savedRows.push({ ...product, id: Number(info.lastInsertRowid) });
        continue;
      }

      updateProductFinal.run(product.name, product.amount, product.id);
      updateAssignmentsByName.run(product.name, temporaryNames.get(product.id));
      savedRows.push(product);
    }

    return savedRows;
  });

  transaction();
  return listPreSaleProducts(db);
}

module.exports = {
  ensurePreSaleProductsTable,
  findPreSaleProductByName,
  listPreSaleProducts,
  normalizeProductRows,
  savePreSaleProducts,
};
