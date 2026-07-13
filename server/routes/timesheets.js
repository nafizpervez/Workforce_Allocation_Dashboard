const express = require('express');
const { getAppDb } = require('../database');
const { normalizeTimesheetPayloadRows } = require('../services/timesheet-normalizer');
const { cleanText, safeNum } = require('../services/values');
const router = express.Router();
const db = getAppDb();

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
  `).all();

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

router.post('/api/timesheet-summary/bulk', (req, res) => {
  const body = req.body || {};
  const fileName = cleanText(body.fileName || body.file_name || '');
  const sheetName = cleanText(body.sheetName || body.sheet_name || '');
  const replaceMonths = body.replaceMonths !== false;
  const rows = normalizeTimesheetPayloadRows(body.rows || []);

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

  const txn = db.transaction(() => {
    if (replaceMonths) {
      for (const month of uploadedMonths) {
        delByMonth.run(month);
      }
    }

    let savedRows = 0;

    for (const r of rows) {
      insertRow.run(
        r.month,
        r.worker,
        r.workType,
        r.projectName,
        r.qty,
        fileName,
        sheetName
      );
      savedRows++;
    }

    return savedRows;
  });

  const savedRows = txn();
  const totalHours = rows.reduce((sum, r) => sum + safeNum(r.qty, 0), 0);

  res.status(201).json({
    ok: true,
    saved_rows: savedRows,
    replaced_months: replaceMonths ? uploadedMonths : [],
    month_count: uploadedMonths.length,
    total_hours: +totalHours.toFixed(2),
  });
});

router.delete('/api/timesheet-summary', (_, res) => {
  const info = db.prepare('DELETE FROM timesheet_entries').run();

  res.json({
    ok: true,
    deleted_rows: info.changes,
  });
});


module.exports = router;
