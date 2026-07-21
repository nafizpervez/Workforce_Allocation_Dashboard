const express = require('express');
const { getAppDb } = require('../database');
const { calcDealStatuses } = require('../services/project-analytics');
const { normalizeFiscalPeriod } = require('../services/fiscal');
const { assignUniqueProjectColors, projectColorForIndex } = require('../services/project-colors');
const { normalizeImportedProjectRows } = require('../services/project-import');
const { safeNum } = require('../services/values');
const router = express.Router();
const db = getAppDb();

/* ─── projects ────────────────────────────────────────────────── */
const PROJECT_FIELDS = [
  'code', 'name', 'client', 'budget', 'spent_pct', 'end_date', 'stage', 'progress', 'color', 'priority',
  'product_amount', 'account_name', 'product_name', 'product_family', 'opportunity_owner', 'opp_amount', 'probability',
  'created_date', 'fiscal_period', 'project_closing_date',
];

router.get('/api/projects', (_, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const statusMap = calcDealStatuses(rows);
  res.json(rows.map(r => ({ ...r, deal_status: statusMap[r.id] || 'NEW LOGO' })));
});

router.post('/api/projects', (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name are required' });
  try {
    const info = db.prepare(`
      INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
        product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
        created_date,fiscal_period,project_closing_date,import_row_no)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.code, b.name, b.client || b.account_name || null,
      safeNum(b.budget ?? b.opp_amount, 0), safeNum(b.spent_pct, 0),
      b.end_date || null, b.stage || 'Prospect', safeNum(b.progress, 0),
      b.color || projectColorForIndex(db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0), b.priority || 'Medium',
      safeNum(b.product_amount, 0), b.account_name || null, b.product_name || null,
      b.product_family || null,
      b.opportunity_owner || null, safeNum(b.opp_amount, 0), safeNum(b.probability, 0),
      b.created_date || null, normalizeFiscalPeriod(b.fiscal_period) || null, b.project_closing_date || null, null
    );
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'project code must be unique' });
    throw e;
  }

});

router.post('/api/projects/import', (req, res) => {
  const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const rows = normalizeImportedProjectRows(incomingRows);

  if (!rows.length) {
    return res.status(400).json({ error: 'No valid project rows found in uploaded Excel.' });
  }

  const beforeProjectCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0;
  const beforeAssignmentCount = db.prepare('SELECT COUNT(*) AS c FROM assignments').get().c || 0;

  const insertProject = db.prepare(`
    INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
      product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
      created_date,fiscal_period,project_closing_date,import_row_no)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const inserted = [];
  const failed = [];
  let deletedProjectCount = 0;
  let deletedAssignmentCount = 0;

  const txn = db.transaction(() => {
    // Full replacement mode:
    // Project IDs are regenerated from the uploaded Excel. Existing assignments
    // reference old project IDs, so they must be removed to avoid orphaned data.
    const deletedAssignments = db.prepare('DELETE FROM assignments').run();
    deletedAssignmentCount = deletedAssignments.changes || 0;

    const deletedProjects = db.prepare('DELETE FROM projects').run();
    deletedProjectCount = deletedProjects.changes || 0;

    // Reset autoincrement counters when sqlite_sequence exists.
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('projects', 'assignments')").run();
    } catch (_) { /* sqlite_sequence may not exist in older DBs */ }

    for (const p of rows) {
      try {
        const info = insertProject.run(
          p.code,
          p.name,
          p.client || p.account_name || null,
          safeNum(p.budget ?? p.opp_amount, 0),
          safeNum(p.spent_pct, 0),
          p.end_date || null,
          p.stage || 'Prospect',
          safeNum(p.progress, 0),
          p.color || '#8B5CF6',
          p.priority || 'Medium',
          safeNum(p.product_amount, 0),
          p.account_name || null,
          p.product_name || null,
          p.product_family || null,
          p.opportunity_owner || null,
          safeNum(p.opp_amount, 0),
          safeNum(p.probability, 0),
          p.created_date || null,
          p.fiscal_period || null,
          p.project_closing_date || null,
          p.import_row_no || null
        );

        inserted.push({
          id: info.lastInsertRowid,
          code: p.code,
          name: p.name,
          product_name: p.product_name,
          product_amount: p.product_amount,
          fiscal_period: p.fiscal_period,
          import_row_no: p.import_row_no || null,
        });
      } catch (e) {
        failed.push({
          code: p.code,
          name: p.name,
          product_name: p.product_name,
          product_amount: p.product_amount,
          fiscal_period: p.fiscal_period,
          import_row_no: p.import_row_no || null,
          error: e.message,
          reason: e.message || 'Database insert failed.',
        });
      }
    }
  });

  txn();

  const recoloredProjectCount = assignUniqueProjectColors();

  res.status(201).json({
    ok: true,
    mode: 'replace_all_projects',
    parsed_rows: incomingRows.length,
    project_rows_ready: rows.length,
    before_project_count: beforeProjectCount,
    before_assignment_count: beforeAssignmentCount,
    deleted_project_count: deletedProjectCount,
    deleted_assignment_count: deletedAssignmentCount,
    inserted_count: inserted.length,
    recolored_project_count: recoloredProjectCount,
    skipped_existing_count: 0,
    updated_existing_count: 0,
    failed_count: failed.length,
    inserted,
    import_behavior: 'No project de-duplication. Every valid Excel row is inserted, including duplicate rows. Each imported project receives a unique chart color.',
    skipped_existing: [],
    failed: failed.map(p => ({
      ...p,
      reason: p.reason || p.error || 'Database insert failed.',
    })),
    note: 'Existing project rows were deleted and replaced by the uploaded Excel. Existing assignments were also deleted because they referenced old project IDs. Use Bulk Assign Assignment to restore assignments from backup Excel.',
  });
});

router.put('/api/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) return res.status(404).json({ error: 'not found' });
  const updates = [], params = [];
  for (const f of PROJECT_FIELDS) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f}=?`);
      params.push(f === 'fiscal_period' ? (normalizeFiscalPeriod(req.body[f]) || null) : req.body[f]);
    }
  }
  if (updates.length) { params.push(id); db.prepare(`UPDATE projects SET ${updates.join(',')} WHERE id=?`).run(...params); }
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(id));
});

router.delete('/api/projects/:id', (req, res) => {
  const info = db.prepare('DELETE FROM projects WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

module.exports = router;
