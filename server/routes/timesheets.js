const express = require('express');
const { getAppDb } = require('../database');
const { canonicalPersonName, personIdentityKey } = require('../services/person-identity');
const { canonicalDesignationDisplay } = require('../services/designations');
const {
  normalizeTimesheetDetailPayloadRows,
  normalizeTimesheetPayloadRows,
} = require('../services/timesheet-normalizer');
const { cleanText, safeNum } = require('../services/values');

const router = express.Router();
const db = getAppDb();

function monthSortValue(month, fallbackDate = '') {
  const dateValue = Date.parse(`${fallbackDate || ''}T00:00:00Z`);
  if (Number.isFinite(dateValue)) return dateValue;

  const match = String(month || '').trim().match(/^([A-Za-z]{3,9})\s+(\d{2}|\d{4})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const monthIndex = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ].indexOf(match[1].slice(0, 3).toLowerCase());
  if (monthIndex < 0) return Number.MAX_SAFE_INTEGER;

  let year = Number(match[2]);
  if (year < 100) year += 2000;
  return Date.UTC(year, monthIndex, 1);
}

function suggestedReportLabels(project) {
  const projectName = cleanText(project.projectName || project.project_name);
  const hierarchy = cleanText(project.projectHierarchy || project.project_hierarchy);
  const customer = cleanText(project.customer);

  if (/ju?pem/i.test(projectName) && /my projects/i.test(hierarchy)) {
    return {
      projectLabel: 'Intrasourcing Esri MY for JUPEM',
      customerLabel: 'Esri MY',
    };
  }

  return {
    projectLabel: projectName || hierarchy || 'Time Sheet Project',
    customerLabel: customer || 'Customer',
  };
}

router.get('/api/timesheet-summary', (_, res) => {
  const rows = db.prepare(`
    SELECT
      month,
      worker,
      work_type AS workType,
      project_name AS projectName,
      qty,
      source_file,
      sheet_name,
      updated_at
    FROM timesheet_entries
    ORDER BY month, worker, work_type, project_name
  `).all().map(row => ({
    ...row,
    worker: canonicalPersonName(row.worker),
  }));

  const meta = db.prepare(`
    SELECT source_file, sheet_name, updated_at
    FROM timesheet_entries
    ORDER BY datetime(updated_at) DESC
    LIMIT 1
  `).get();

  const months = db.prepare(`
    SELECT DISTINCT month
    FROM timesheet_entries
    ORDER BY month
  `).all().map(r => r.month);

  const totalHours = rows.reduce((sum, r) => sum + safeNum(r.qty, 0), 0);

  res.json({
    rows,
    months,
    total_hours: +totalHours.toFixed(2),
    last_source_file: meta?.source_file || '',
    last_sheet_name: meta?.sheet_name || '',
    last_updated_at: meta?.updated_at || '',
  });
});

router.get('/api/timesheet-report/options', (_, res) => {
  const rows = db.prepare(`
    SELECT
      month,
      project_hierarchy AS projectHierarchy,
      project_name AS projectName,
      customer,
      MIN(work_date) AS firstWorkDate,
      MAX(work_date) AS lastWorkDate,
      COUNT(*) AS rowCount,
      SUM(qty) AS totalHours
    FROM timesheet_detail_entries
    WHERE TRIM(project_name) != ''
    GROUP BY month, project_hierarchy, project_name, customer
  `).all();

  const monthMap = new Map();

  for (const row of rows) {
    if (!monthMap.has(row.month)) {
      monthMap.set(row.month, {
        month: row.month,
        firstWorkDate: row.firstWorkDate || '',
        projects: [],
      });
    }

    const labels = suggestedReportLabels(row);
    monthMap.get(row.month).projects.push({
      projectHierarchy: row.projectHierarchy || '',
      projectName: row.projectName || '',
      customer: row.customer || '',
      projectLabel: labels.projectLabel,
      customerLabel: labels.customerLabel,
      rowCount: Number(row.rowCount) || 0,
      totalHours: +(Number(row.totalHours) || 0).toFixed(2),
    });
  }

  const months = [...monthMap.values()]
    .map(month => ({
      ...month,
      projects: month.projects.sort((a, b) => (
        b.totalHours - a.totalHours || a.projectName.localeCompare(b.projectName)
      )),
    }))
    .sort((a, b) => (
      monthSortValue(a.month, a.firstWorkDate) - monthSortValue(b.month, b.firstWorkDate)
    ));

  res.json({ months });
});

router.get('/api/timesheet-report/data', (req, res) => {
  const month = cleanText(req.query.month);
  const projectName = cleanText(req.query.projectName || req.query.project_name);

  if (!month || !projectName) {
    return res.status(400).json({ error: 'Month and Project are required.' });
  }

  const rows = db.prepare(`
    SELECT
      month,
      work_date AS workDate,
      worker,
      work_type AS workType,
      worker_cost_center AS workerCostCenter,
      qty,
      status,
      time_entry_code AS timeEntryCode,
      billable,
      project_hierarchy AS projectHierarchy,
      project_id AS projectId,
      external_project_reference AS externalProjectReference,
      project_name AS projectName,
      customer,
      project_phase_name AS projectPhaseName,
      project_task AS projectTask,
      custom_task_name AS customTaskName,
      project_role AS projectRole,
      comment,
      source_row_no AS sourceRowNo
    FROM timesheet_detail_entries
    WHERE month = ? AND project_name = ?
    ORDER BY work_date, source_row_no, id
  `).all(month, projectName).map(row => ({
    ...row,
    worker: canonicalPersonName(row.worker),
  }));

  if (!rows.length) {
    return res.status(404).json({
      error: 'No detailed Time Sheet rows are available for the selected month and project. Re-upload that month to save report details.',
    });
  }

  const employeeRows = db.prepare(`
    SELECT name, designation
    FROM employees
    WHERE active IS NULL OR active != 0
  `).all();
  const designationByWorker = Object.fromEntries(employeeRows.map(employee => [
    personIdentityKey(employee.name),
    canonicalDesignationDisplay(cleanText(employee.designation)),
  ]));

  const first = rows[0];
  const labels = suggestedReportLabels(first);

  res.json({
    month,
    projectName,
    projectHierarchy: first.projectHierarchy || '',
    customer: first.customer || '',
    suggestedProjectLabel: labels.projectLabel,
    suggestedCustomerLabel: labels.customerLabel,
    designations: designationByWorker,
    rows,
  });
});

router.post('/api/timesheet-summary/bulk', (req, res) => {
  const body = req.body || {};
  const fileName = cleanText(body.fileName || body.file_name || '');
  const sheetName = cleanText(body.sheetName || body.sheet_name || '');
  const replaceMonths = body.replaceMonths !== false;
  const rows = normalizeTimesheetPayloadRows(body.rows || []);
  const hasDetailPayload = Array.isArray(body.detailRows || body.detail_rows);
  const detailRows = normalizeTimesheetDetailPayloadRows(body.detailRows || body.detail_rows || []);

  if (!rows.length) {
    return res.status(400).json({
      error: 'No valid Time Sheet rows received.',
    });
  }

  const uploadedMonths = [...new Set(rows.map(r => r.month).filter(Boolean))];

  const delByMonth = db.prepare(`
    DELETE FROM timesheet_entries
    WHERE month = ?
  `);
  const delDetailByMonth = db.prepare(`
    DELETE FROM timesheet_detail_entries
    WHERE month = ?
  `);

  const insertRow = db.prepare(`
    INSERT INTO timesheet_entries (
      month,
      worker,
      work_type,
      project_name,
      qty,
      source_file,
      sheet_name,
      uploaded_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(month, worker, work_type, project_name)
    DO UPDATE SET
      qty = excluded.qty,
      source_file = excluded.source_file,
      sheet_name = excluded.sheet_name,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertDetailRow = db.prepare(`
    INSERT INTO timesheet_detail_entries (
      month,
      work_date,
      worker,
      work_type,
      worker_cost_center,
      qty,
      status,
      time_entry_code,
      billable,
      project_hierarchy,
      project_id,
      external_project_reference,
      project_name,
      customer,
      project_phase_name,
      project_task,
      custom_task_name,
      project_role,
      comment,
      source_row_no,
      source_file,
      sheet_name,
      uploaded_at,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);

  const txn = db.transaction(() => {
    if (replaceMonths) {
      for (const month of uploadedMonths) {
        delByMonth.run(month);
        if (hasDetailPayload) delDetailByMonth.run(month);
      }
    }

    let savedRows = 0;
    let savedDetailRows = 0;

    for (const r of rows) {
      insertRow.run(
        r.month,
        r.worker,
        r.workType,
        r.projectName,
        r.qty,
        fileName,
        sheetName,
      );
      savedRows++;
    }

    for (const r of detailRows) {
      insertDetailRow.run(
        r.month,
        r.workDate,
        r.worker,
        r.workType,
        r.workerCostCenter,
        r.qty,
        r.status,
        r.timeEntryCode,
        r.billable,
        r.projectHierarchy,
        r.projectId,
        r.externalProjectReference,
        r.projectName,
        r.customer,
        r.projectPhaseName,
        r.projectTask,
        r.customTaskName,
        r.projectRole,
        r.comment,
        r.sourceRowNo,
        fileName,
        sheetName,
      );
      savedDetailRows++;
    }

    return { savedRows, savedDetailRows };
  });

  const saved = txn();
  const totalHours = rows.reduce((sum, r) => sum + safeNum(r.qty, 0), 0);

  res.status(201).json({
    ok: true,
    saved_rows: saved.savedRows,
    saved_detail_rows: saved.savedDetailRows,
    replaced_months: replaceMonths ? uploadedMonths : [],
    month_count: uploadedMonths.length,
    total_hours: +totalHours.toFixed(2),
  });
});

router.delete('/api/timesheet-summary', (_, res) => {
  const deleted = db.transaction(() => {
    const summary = db.prepare('DELETE FROM timesheet_entries').run();
    const details = db.prepare('DELETE FROM timesheet_detail_entries').run();
    return { summary: summary.changes, details: details.changes };
  })();

  res.json({
    ok: true,
    deleted_rows: deleted.summary,
    deleted_detail_rows: deleted.details,
  });
});

module.exports = router;
