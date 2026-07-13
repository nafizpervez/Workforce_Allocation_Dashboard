const express = require('express');
const { getAppDb } = require('../database');
const { buildAssignmentImportResolvers, normalizeAssignmentImportRows } = require('../services/assignment-import');
const { FISCAL_WHERE, fiscalParams } = require('../services/fiscal');
const { assignUniqueProjectColors } = require('../services/project-colors');
const { safeNum } = require('../services/values');
const router = express.Router();
const db = getAppDb();

router.get('/api/assignments', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  res.json(db.prepare(`
    SELECT a.id, a.employee_id, a.project_id, a.year, a.month, a.week, a.percentage,
           p.code AS project_code, p.name AS project_name, p.color AS project_color,
           COALESCE(p.account_name, p.client, p.name) AS account_name
      FROM assignments a JOIN projects p ON p.id=a.project_id
     WHERE ${FISCAL_WHERE}
  `).all(...fiscalParams(fy)));
});

router.post('/api/assignments', (req, res) => {
  const { employee_id, project_id, year, month, week, percentage } = req.body || {};
  if (!employee_id || !project_id || !year || !month || !week) return res.status(400).json({ error: 'missing fields' });
  if (month < 1 || month > 12 || week < 1 || week > 4) return res.status(400).json({ error: 'invalid month/week' });
  const info = db.prepare('INSERT INTO assignments(employee_id,project_id,year,month,week,percentage) VALUES(?,?,?,?,?,?)')
    .run(employee_id, project_id, year, month, week, safeNum(percentage, 0));
  const row = db.prepare('SELECT a.*, p.code AS project_code, p.name AS project_name, p.color AS project_color FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.id=?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.post('/api/assignments/bulk', (req, res) => {
  const { employee_id, project_id, percentage, slots } = req.body || {};
  if (!employee_id || !project_id || !Array.isArray(slots) || !slots.length) return res.status(400).json({ error: 'missing fields' });
  const pct = safeNum(percentage, 0);
  const ins = db.prepare('INSERT INTO assignments(employee_id,project_id,year,month,week,percentage) VALUES(?,?,?,?,?,?)');
  const txn = db.transaction(arr => {
    let n = 0;
    for (const s of arr) {
      const y = safeNum(s.year, 0), m = safeNum(s.month, 0), w = safeNum(s.week, 0);
      if (!y || m < 1 || m > 12 || w < 1 || w > 4) continue;
      ins.run(employee_id, project_id, y, m, w, pct); n++;
    }
    return n;
  });
  res.status(201).json({ created: txn(slots) });
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

    if (!row.year || row.month < 1 || row.month > 12 || row.week < 1 || row.week > 4) {
      skipped.push({ ...row, reason: 'Invalid Year, Month Number, or Week.' });
      continue;
    }

    if (row.percentage < 0) {
      skipped.push({ ...row, reason: 'Allocation percentage cannot be negative.' });
      continue;
    }

    const empResolved = resolveEmployee(row);
    if (!empResolved.employee) {
      skipped.push({ ...row, reason: empResolved.reason || 'Employee could not be resolved.' });
      continue;
    }

    const projectResolved = resolveProject(row);
    if (!projectResolved.project) {
      skipped.push({ ...row, reason: projectResolved.reason || 'Project could not be resolved.' });
      continue;
    }

    toInsert.push({
      ...row,
      employee_id: empResolved.employee.id,
      project_id: projectResolved.project.id,
      employee_code: empResolved.employee.employee_code || row.employee_code,
      employee_name: empResolved.employee.name || row.employee_name,
      project_code: projectResolved.project.code || row.project_code,
      project_name: projectResolved.project.name || row.project_name,
    });
  }

  const imported = [];
  const failed = [];
  let deletedCount = 0;

  const insertAssignment = db.prepare(`
    INSERT INTO assignments(employee_id, project_id, year, month, week, percentage)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    if (replaceFiscalYear) {
      const del = db.prepare(`
        DELETE FROM assignments
        WHERE ((year = ? AND month >= 4) OR (year = ? AND month <= 3))
      `).run(fiscalYear, fiscalYear + 1);
      deletedCount = del.changes || 0;
    }

    for (const row of toInsert) {
      try {
        const info = insertAssignment.run(
          row.employee_id,
          row.project_id,
          row.year,
          row.month,
          row.week,
          safeNum(row.percentage, 0)
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
      } catch (e) {
        failed.push({
          ...row,
          error: e.message,
          reason: 'Database insert failed.',
        });
      }
    }
  });

  txn();

  const recoloredProjectCount = assignUniqueProjectColors(
    [...new Set(imported.map(row => row.project_id).filter(Boolean))]
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
  if (!db.prepare('SELECT id FROM assignments WHERE id=?').get(id)) return res.status(404).json({ error: 'not found' });
  const fields = ['employee_id', 'project_id', 'year', 'month', 'week', 'percentage'];
  const updates = [], params = [];
  for (const f of fields) if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) { updates.push(`${f}=?`); params.push(req.body[f]); }
  if (updates.length) { params.push(id); db.prepare(`UPDATE assignments SET ${updates.join(',')} WHERE id=?`).run(...params); }
  const row = db.prepare('SELECT a.*, p.code AS project_code, p.name AS project_name, p.color AS project_color FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.id=?').get(id);
  res.json(row);
});


router.post('/api/assignments/:id/reschedule', (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT id FROM assignments WHERE id=?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });

  const { employee_id, project_id, percentage, slots } = req.body || {};
  if (!employee_id || !project_id || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const validSlots = slots
    .map(s => ({ year: safeNum(s.year, 0), month: safeNum(s.month, 0), week: safeNum(s.week, 0) }))
    .filter(s => s.year && s.month >= 1 && s.month <= 12 && s.week >= 1 && s.week <= 4);

  if (!validSlots.length) return res.status(400).json({ error: 'invalid date range' });

  const pct = safeNum(percentage, 0);
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM assignments WHERE id=?').run(id);
    const ins = db.prepare('INSERT INTO assignments(employee_id,project_id,year,month,week,percentage) VALUES(?,?,?,?,?,?)');
    let created = 0;
    for (const s of validSlots) {
      ins.run(employee_id, project_id, s.year, s.month, s.week, pct);
      created++;
    }
    return created;
  });

  res.json({ ok: true, deleted: id, created: txn() });
});

router.delete('/api/assignments/:id', (req, res) => {
  const info = db.prepare('DELETE FROM assignments WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});


module.exports = router;
