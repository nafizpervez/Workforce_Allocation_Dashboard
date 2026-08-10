const express = require('express');
const { getAppDb } = require('../database');
const { calcDealStatuses, isDealAcquisitionChartEligible } = require('../services/project-analytics');
const {
  getCurrentFiscalYearEnd,
  getFiscalPeriodFromDate,
  getProjectFiscalPeriod,
  normalizeFiscalPeriod,
} = require('../services/fiscal');
const { assignUniqueProjectColors, projectColorForIndex } = require('../services/project-colors');
const {
  getProjectImportFiscalYearEnd,
  normalizeImportedProjectRows,
  normalizeProjectImportMode,
  projectImportPartitionLabel,
  projectMatchesImportMode,
} = require('../services/project-import');
const { safeNum } = require('../services/values');
const router = express.Router();
const db = getAppDb();

/* ─── projects ────────────────────────────────────────────────── */
const PROJECT_FIELDS = [
  'code', 'name', 'client', 'budget', 'spent_pct', 'end_date', 'stage', 'progress', 'color', 'priority',
  'product_amount', 'account_name', 'product_name', 'product_family', 'opportunity_owner', 'opp_amount', 'probability',
  'created_date', 'fiscal_period', 'project_closing_date', 'not_local_project',
];

router.get('/api/projects', (_, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const statusMap = calcDealStatuses(rows);
  res.json(rows.map(r => ({
    ...r,
    fiscal_period: getProjectFiscalPeriod(r) || null,
    deal_status: statusMap[r.id] || 'NEW LOGO',
    acquisition_chart_eligible: isDealAcquisitionChartEligible(r),
  })));
});

router.post('/api/projects', (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name are required' });
  if (safeNum(b.progress, 0) >= 100 && !String(b.project_closing_date || '').trim()) {
    return res.status(400).json({ error: 'Project Closing Date is required before Progress can be set to 100%.' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
        product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
        created_date,fiscal_period,project_closing_date,import_row_no,not_local_project)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.code, b.name, b.client || b.account_name || null,
      safeNum(b.budget ?? b.opp_amount, 0), safeNum(b.spent_pct, 0),
      b.end_date || null, b.stage || 'Prospect', safeNum(b.progress, 0),
      b.color || projectColorForIndex(db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0), b.priority || 'Medium',
      safeNum(b.product_amount, 0), b.account_name || null, b.product_name || null,
      b.product_family || null,
      b.opportunity_owner || null, safeNum(b.opp_amount, 0), safeNum(b.probability, 0),
      b.created_date || null,
      getFiscalPeriodFromDate(b.end_date) || normalizeFiscalPeriod(b.fiscal_period) || null,
      b.project_closing_date || null,
      null,
      b.not_local_project ? 1 : 0,
    );
    const saved = db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid);
    const statusMap = calcDealStatuses(db.prepare('SELECT * FROM projects ORDER BY id').all());
    res.status(201).json({
      ...saved,
      fiscal_period: getProjectFiscalPeriod(saved) || null,
      deal_status: statusMap[saved.id] || 'NEW LOGO',
      acquisition_chart_eligible: isDealAcquisitionChartEligible(saved),
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'project code must be unique' });
    throw e;
  }
});

function normalizeProjectMatchValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function projectImportResultRow(project, extra = {}) {
  return {
    id: project.id ?? null,
    code: project.code,
    name: project.name,
    product_name: project.product_name,
    product_amount: safeNum(project.product_amount, 0),
    fiscal_period: project.fiscal_period,
    import_row_no: project.import_row_no || null,
    ...extra,
  };
}

function findProjectImportMatch(incoming, existingRows, consumedIds) {
  const available = existingRows.filter(project => !consumedIds.has(Number(project.id)));
  const incomingCode = normalizeProjectMatchValue(incoming.code);
  const incomingName = normalizeProjectMatchValue(incoming.name);
  const incomingProduct = normalizeProjectMatchValue(incoming.product_name);
  const value = (project, field) => normalizeProjectMatchValue(project?.[field]);
  const first = predicate => available.find(predicate) || null;

  return (
    first(project => (
      value(project, 'code') === incomingCode &&
      value(project, 'name') === incomingName &&
      value(project, 'product_name') === incomingProduct
    )) ||
    (incomingProduct ? first(project => (
      value(project, 'code') === incomingCode &&
      value(project, 'product_name') === incomingProduct
    )) : null) ||
    first(project => (
      value(project, 'code') === incomingCode &&
      value(project, 'name') === incomingName
    )) ||
    (incomingProduct ? first(project => (
      value(project, 'name') === incomingName &&
      value(project, 'product_name') === incomingProduct
    )) : null) ||
    (() => {
      const sameName = available.filter(project => value(project, 'name') === incomingName);
      return sameName.length === 1 ? sameName[0] : null;
    })()
  );
}

router.post('/api/projects/import', (req, res) => {
  const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const normalizedRows = normalizeImportedProjectRows(incomingRows);
  const importMode = normalizeProjectImportMode(req.body?.mode);
  const currentFiscalYearEnd = getCurrentFiscalYearEnd();
  const partitionLabel = projectImportPartitionLabel(importMode, currentFiscalYearEnd);

  if (!normalizedRows.length) {
    return res.status(400).json({ error: 'No valid project rows found in uploaded Excel.' });
  }

  const rows = [];
  const excluded = [];
  for (const project of normalizedRows) {
    const fiscalYearEnd = getProjectImportFiscalYearEnd(project);
    if (fiscalYearEnd === null) {
      excluded.push(projectImportResultRow(project, {
        reason: 'Fiscal Period or Close Date is required to determine the project fiscal year.',
      }));
    } else if (!projectMatchesImportMode(project, importMode, currentFiscalYearEnd)) {
      excluded.push(projectImportResultRow(project, {
        reason: importMode === 'historical'
          ? `FY${fiscalYearEnd} belongs to the current FY${currentFiscalYearEnd} forecast partition.`
          : `FY${fiscalYearEnd} is outside the current FY${currentFiscalYearEnd} forecast partition.`,
      }));
    } else {
      rows.push(project);
    }
  }

  if (!rows.length) {
    return res.status(400).json({
      error: `No rows matched ${partitionLabel}. Check the Fiscal Period or Close Date values in the Excel file.`,
      mode: importMode,
      current_fiscal_year: currentFiscalYearEnd,
      excluded_count: excluded.length,
      excluded,
    });
  }

  const beforeProjectCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0;
  const beforeAssignmentCount = db.prepare('SELECT COUNT(*) AS c FROM assignments').get().c || 0;
  const allExistingProjects = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const existingPartitionRows = allExistingProjects.filter(project => (
    projectMatchesImportMode(project, importMode, currentFiscalYearEnd)
  ));

  const insertProject = db.prepare(`
    INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
      product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
      created_date,fiscal_period,project_closing_date,import_row_no)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const updateProject = db.prepare(`
    UPDATE projects SET
      code=?, name=?, client=?, budget=?, spent_pct=?, end_date=?, stage=?, progress=?, priority=?,
      product_amount=?, account_name=?, product_name=?, product_family=?, opportunity_owner=?, opp_amount=?, probability=?,
      created_date=?, fiscal_period=?, project_closing_date=?, import_row_no=?
    WHERE id=?
  `);
  const assignmentCountForProject = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE project_id=?');
  const deleteProject = db.prepare('DELETE FROM projects WHERE id=?');

  const inserted = [];
  const updated = [];
  const deletedUnassigned = [];
  const retainedAssigned = [];
  const failed = [];
  const consumedExistingIds = new Set();

  const projectValues = project => [
    project.code,
    project.name,
    project.client || project.account_name || null,
    safeNum(project.budget ?? project.opp_amount, 0),
    safeNum(project.spent_pct, 0),
    project.end_date || null,
    project.stage || 'Prospect',
    safeNum(project.progress, 0),
    project.priority || 'Medium',
    safeNum(project.product_amount, 0),
    project.account_name || null,
    project.product_name || null,
    project.product_family || null,
    project.opportunity_owner || null,
    safeNum(project.opp_amount, 0),
    safeNum(project.probability, 0),
    project.created_date || null,
    project.fiscal_period || null,
    project.project_closing_date || null,
    project.import_row_no || null,
  ];

  const txn = db.transaction(() => {
    for (const project of rows) {
      const existing = findProjectImportMatch(project, existingPartitionRows, consumedExistingIds);
      if (existing) consumedExistingIds.add(Number(existing.id));

      try {
        if (existing) {
          updateProject.run(...projectValues(project), Number(existing.id));
          updated.push(projectImportResultRow(project, {
            id: Number(existing.id),
            previous_code: existing.code,
            previous_name: existing.name,
          }));
        } else {
          const info = insertProject.run(
            project.code,
            project.name,
            project.client || project.account_name || null,
            safeNum(project.budget ?? project.opp_amount, 0),
            safeNum(project.spent_pct, 0),
            project.end_date || null,
            project.stage || 'Prospect',
            safeNum(project.progress, 0),
            project.color || '#8B5CF6',
            project.priority || 'Medium',
            safeNum(project.product_amount, 0),
            project.account_name || null,
            project.product_name || null,
            project.product_family || null,
            project.opportunity_owner || null,
            safeNum(project.opp_amount, 0),
            safeNum(project.probability, 0),
            project.created_date || null,
            project.fiscal_period || null,
            project.project_closing_date || null,
            project.import_row_no || null,
          );
          inserted.push(projectImportResultRow(project, { id: info.lastInsertRowid }));
        }
      } catch (error) {
        failed.push(projectImportResultRow(project, {
          error: error.message,
          reason: error.message || 'Database import failed.',
        }));
      }
    }

    for (const existing of existingPartitionRows) {
      if (consumedExistingIds.has(Number(existing.id))) continue;
      const assignmentCount = assignmentCountForProject.get(Number(existing.id)).c || 0;
      if (assignmentCount > 0) {
        retainedAssigned.push(projectImportResultRow(existing, {
          assignment_count: assignmentCount,
          reason: 'Retained because existing assignments still reference this project.',
        }));
      } else {
        deleteProject.run(Number(existing.id));
        deletedUnassigned.push(projectImportResultRow(existing));
      }
    }
  });

  txn();

  const recoloredProjectCount = assignUniqueProjectColors();
  const afterProjectCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0;
  const afterAssignmentCount = db.prepare('SELECT COUNT(*) AS c FROM assignments').get().c || 0;

  res.status(201).json({
    ok: true,
    mode: 'replace_project_partition',
    import_mode: importMode,
    partition_label: partitionLabel,
    current_fiscal_year: currentFiscalYearEnd,
    parsed_rows: incomingRows.length,
    normalized_rows: normalizedRows.length,
    project_rows_ready: rows.length,
    excluded_count: excluded.length,
    before_project_count: beforeProjectCount,
    after_project_count: afterProjectCount,
    before_assignment_count: beforeAssignmentCount,
    after_assignment_count: afterAssignmentCount,
    deleted_project_count: deletedUnassigned.length,
    deleted_assignment_count: 0,
    inserted_count: inserted.length,
    updated_existing_count: updated.length,
    retained_assigned_count: retainedAssigned.length,
    failed_count: failed.length,
    recolored_project_count: recoloredProjectCount,
    inserted,
    updated,
    deleted_unassigned: deletedUnassigned,
    retained_assigned: retainedAssigned,
    excluded,
    failed,
    import_behavior: 'Only the selected fiscal-year partition is refreshed. Matching projects are updated in place so project IDs and assignment relationships remain stable. Unmatched assigned projects are retained; unmatched unassigned projects in the selected partition are removed.',
    note: 'No assignments were deleted. Projects outside the selected fiscal-year partition were not changed.',
  });
});

router.put('/api/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const body = req.body || {};
  const has = field => Object.prototype.hasOwnProperty.call(body, field);
  const updates = [];
  const params = [];

  for (const field of PROJECT_FIELDS) {
    if (field === 'fiscal_period' || !has(field)) continue;
    updates.push(`${field}=?`);
    params.push(field === 'not_local_project' ? (body[field] ? 1 : 0) : body[field]);
  }

  const nextProgress = has('progress') ? safeNum(body.progress, existing.progress) : safeNum(existing.progress, 0);
  const nextProjectClosingDate = has('project_closing_date')
    ? body.project_closing_date
    : existing.project_closing_date;
  if (nextProgress >= 100 && !String(nextProjectClosingDate || '').trim()) {
    return res.status(400).json({ error: 'Project Closing Date is required before Progress can be set to 100%.' });
  }
  const completingProject = has('progress') && nextProgress >= 100;

  if (has('end_date') || has('fiscal_period') || completingProject) {
    const nextEndDate = has('end_date') ? body.end_date : existing.end_date;
    const suppliedPeriod = has('fiscal_period') ? body.fiscal_period : existing.fiscal_period;
    updates.push('fiscal_period=?');
    params.push(getFiscalPeriodFromDate(nextEndDate) || normalizeFiscalPeriod(suppliedPeriod) || null);
  }

  if (updates.length) {
    params.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(',')} WHERE id=?`).run(...params);
  }

  const saved = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
  const statusMap = calcDealStatuses(db.prepare('SELECT * FROM projects ORDER BY id').all());
  res.json({
    ...saved,
    fiscal_period: getProjectFiscalPeriod(saved) || null,
    deal_status: statusMap[saved.id] || 'NEW LOGO',
    acquisition_chart_eligible: isDealAcquisitionChartEligible(saved),
  });
});

router.delete('/api/projects/:id', (req, res) => {
  const info = db.prepare('DELETE FROM projects WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

module.exports = router;
