const express = require('express');
const { getAppDb } = require('../database');
const { buildAssignmentImportResolvers, normalizeAssignmentImportRows } = require('../services/assignment-import');
const { FISCAL_WHERE, fiscalParams } = require('../services/fiscal');
const { assignUniqueProjectColors } = require('../services/project-colors');
const {
  getAssignmentProject,
  isPreSaleProjectName,
  resolveAssignmentMetadata,
} = require('../services/assignment-metadata');
const { findPreSaleProductByName } = require('../services/presale-products');
const { safeNum } = require('../services/values');

const router = express.Router();
const db = getAppDb();

const ASSIGNMENT_SELECT = `
  SELECT
    a.id,
    a.employee_id,
    a.project_id,
    a.year,
    a.month,
    a.week,
    a.percentage,
    a.customer_name AS assignment_customer_name,
    a.product_name AS assignment_product_name,
    p.code AS project_code,
    p.name AS project_name,
    p.color AS project_color,
    COALESCE(
      NULLIF(a.customer_name, ''),
      NULLIF(p.account_name, ''),
      NULLIF(p.client, ''),
      p.name
    ) AS account_name,
    COALESCE(
      NULLIF(a.product_name, ''),
      NULLIF(p.product_name, ''),
      ''
    ) AS product_name
  FROM assignments a
  JOIN projects p ON p.id = a.project_id
`;

function getAssignmentById(id) {
  return db.prepare(`${ASSIGNMENT_SELECT} WHERE a.id = ?`).get(Number(id));
}

function validateSlot(year, month, week) {
  return Boolean(year) && month >= 1 && month <= 12 && week >= 1 && week <= 4;
}

function resolveProjectMetadata(projectId, body, fallback = {}) {
  const project = getAssignmentProject(db, projectId);
  if (!project) return { project: null, customerName: null, productName: null };

  const metadata = resolveAssignmentMetadata(project, body, fallback);
  if (!isPreSaleProjectName(project.name)) {
    return { project, ...metadata };
  }

  const product = findPreSaleProductByName(db, metadata.productName);
  if (!product) {
    return {
      project,
      ...metadata,
      error: 'Select a Product Name from the saved PreSale Product master.',
    };
  }

  return {
    project,
    ...metadata,
    productName: product.name,
    productAmount: Number(product.amount) || 0,
  };
}

router.get('/api/assignments', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  res.json(db.prepare(`
    ${ASSIGNMENT_SELECT}
    WHERE ${FISCAL_WHERE}
  `).all(...fiscalParams(fy)));
});

router.post('/api/assignments', (req, res) => {
  const { employee_id, project_id, year, month, week, percentage } = req.body || {};
  if (!employee_id || !project_id || !year || !month || !week) {
    return res.status(400).json({ error: 'missing fields' });
  }
  if (!validateSlot(year, month, week)) {
    return res.status(400).json({ error: 'invalid month/week' });
  }

  const metadata = resolveProjectMetadata(project_id, req.body);
  if (!metadata.project) return res.status(404).json({ error: 'project not found' });
  if (metadata.error) return res.status(400).json({ error: metadata.error });

  const info = db.prepare(`
    INSERT INTO assignments(
      employee_id, project_id, year, month, week, percentage,
      customer_name, product_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    employee_id,
    project_id,
    year,
    month,
    week,
    safeNum(percentage, 0),
    metadata.customerName,
    metadata.productName,
  );

  res.status(201).json(getAssignmentById(info.lastInsertRowid));
});

router.post('/api/assignments/bulk', (req, res) => {
  const { employee_id, project_id, percentage, slots } = req.body || {};
  if (!employee_id || !project_id || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const metadata = resolveProjectMetadata(project_id, req.body);
  if (!metadata.project) return res.status(404).json({ error: 'project not found' });
  if (metadata.error) return res.status(400).json({ error: metadata.error });

  const pct = safeNum(percentage, 0);
  const insert = db.prepare(`
    INSERT INTO assignments(
      employee_id, project_id, year, month, week, percentage,
      customer_name, product_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(items => {
    let created = 0;

    for (const slot of items) {
      const year = safeNum(slot.year, 0);
      const month = safeNum(slot.month, 0);
      const week = safeNum(slot.week, 0);
      if (!validateSlot(year, month, week)) continue;

      insert.run(
        employee_id,
        project_id,
        year,
        month,
        week,
        pct,
        metadata.customerName,
        metadata.productName,
      );
      created += 1;
    }

    return created;
  });

  res.status(201).json({ created: transaction(slots) });
});

router.post('/api/assignments/import', (req, res) => {
  const body = req.body || {};
  const fiscalYear = Math.trunc(safeNum(body.fiscalYear, new Date().getFullYear()));
  const replaceFiscalYear = body.replaceFiscalYear !== false;
  const rows = normalizeAssignmentImportRows(body.rows || []);

  if (!rows.length) {
    return res.status(400).json({ error: 'No valid assignment rows found in uploaded Excel.' });
  }

  const { resolveEmployee, resolveProject } = buildAssignmentImportResolvers();
  const toInsert = [];
  const skipped = [];

  for (const row of rows) {
    if (!row.employee_code && !row.employee_name) {
      skipped.push({ ...row, reason: 'Missing Resource ID/Resource Name.' });
      continue;
    }
    if (!row.project_code && !row.project_name) {
      skipped.push({ ...row, reason: 'Missing Opportunity Number/Project Name.' });
      continue;
    }
    if (!validateSlot(row.year, row.month, row.week)) {
      skipped.push({ ...row, reason: 'Invalid Year, Month Number, or Week.' });
      continue;
    }
    if (row.percentage < 0) {
      skipped.push({ ...row, reason: 'Allocation percentage cannot be negative.' });
      continue;
    }

    const employeeResult = resolveEmployee(row);
    if (!employeeResult.employee) {
      skipped.push({ ...row, reason: employeeResult.reason || 'Employee could not be resolved.' });
      continue;
    }

    const projectResult = resolveProject(row);
    if (!projectResult.project) {
      skipped.push({ ...row, reason: projectResult.reason || 'Project could not be resolved.' });
      continue;
    }

    toInsert.push({
      ...row,
      employee_id: employeeResult.employee.id,
      project_id: projectResult.project.id,
      employee_code: employeeResult.employee.employee_code || row.employee_code,
      employee_name: employeeResult.employee.name || row.employee_name,
      project_code: projectResult.project.code || row.project_code,
      project_name: projectResult.project.name || row.project_name,
    });
  }

  const imported = [];
  const failed = [];
  let deletedCount = 0;

  const insertAssignment = db.prepare(`
    INSERT INTO assignments(employee_id, project_id, year, month, week, percentage)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    if (replaceFiscalYear) {
      const deleted = db.prepare(`
        DELETE FROM assignments
        WHERE ((year = ? AND month >= 4) OR (year = ? AND month <= 3))
      `).run(fiscalYear, fiscalYear + 1);
      deletedCount = deleted.changes || 0;
    }

    for (const row of toInsert) {
      try {
        const info = insertAssignment.run(
          row.employee_id,
          row.project_id,
          row.year,
          row.month,
          row.week,
          safeNum(row.percentage, 0),
        );

        imported.push({
          id: info.lastInsertRowid,
          source_row: row.source_row,
          employee_code: row.employee_code,
          employee_name: row.employee_name,
          project_id: row.project_id,
          project_code: row.project_code,
          project_name: row.project_name,
          year: row.year,
          month: row.month,
          week: row.week,
          percentage: row.percentage,
        });
      } catch (error) {
        failed.push({
          ...row,
          error: error.message,
          reason: 'Database insert failed.',
        });
      }
    }
  });

  transaction();

  const recoloredProjectCount = assignUniqueProjectColors(
    [...new Set(imported.map(row => row.project_id).filter(Boolean))],
  );

  res.status(201).json({
    ok: true,
    fiscal_year: fiscalYear,
    replace_fiscal_year: replaceFiscalYear,
    received_rows: rows.length,
    deleted_count: deletedCount,
    imported_count: imported.length,
    recolored_project_count: recoloredProjectCount,
    skipped_count: skipped.length,
    failed_count: failed.length,
    imported,
    skipped,
    failed,
    restore_matching: {
      employee: 'Resource ID, then Resource Name',
      project: 'Backup row ID / old project ID first, then Opportunity Number, Project Name, Product Name, and Product Amount fallback. Duplicates are allowed; first best match is used.',
    },
  });
});

router.put('/api/assignments/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const projectId = req.body?.project_id ?? existing.project_id;
  const metadata = resolveProjectMetadata(projectId, req.body, existing);
  if (!metadata.project) return res.status(404).json({ error: 'project not found' });
  if (metadata.error) return res.status(400).json({ error: metadata.error });

  const fields = ['employee_id', 'project_id', 'year', 'month', 'week', 'percentage'];
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }

  updates.push('customer_name = ?', 'product_name = ?');
  params.push(metadata.customerName, metadata.productName, id);
  db.prepare(`UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json(getAssignmentById(id));
});

router.post('/api/assignments/:id/reschedule', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { employee_id, project_id, percentage, slots } = req.body || {};
  if (!employee_id || !project_id || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const validSlots = slots
    .map(slot => ({
      year: safeNum(slot.year, 0),
      month: safeNum(slot.month, 0),
      week: safeNum(slot.week, 0),
    }))
    .filter(slot => validateSlot(slot.year, slot.month, slot.week));

  if (!validSlots.length) return res.status(400).json({ error: 'invalid date range' });

  const metadata = resolveProjectMetadata(project_id, req.body, existing);
  if (!metadata.project) return res.status(404).json({ error: 'project not found' });
  if (metadata.error) return res.status(400).json({ error: metadata.error });

  const pct = safeNum(percentage, 0);
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
    const insert = db.prepare(`
      INSERT INTO assignments(
        employee_id, project_id, year, month, week, percentage,
        customer_name, product_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let created = 0;
    for (const slot of validSlots) {
      insert.run(
        employee_id,
        project_id,
        slot.year,
        slot.month,
        slot.week,
        pct,
        metadata.customerName,
        metadata.productName,
      );
      created += 1;
    }
    return created;
  });

  res.json({ ok: true, deleted: id, created: transaction() });
});

router.delete('/api/assignments/:id', (req, res) => {
  const info = db.prepare('DELETE FROM assignments WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

module.exports = router;
