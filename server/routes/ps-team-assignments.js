const express = require('express');
const { getAppDb } = require('../database');
const {
  buildFiscalAssignmentCalendar,
  saveManualAssignment,
} = require('../services/ps-team-assignments');

const router = express.Router();
const db = getAppDb();

router.get('/api/ps-team-assignments', (req, res) => {
  const fiscalYear = Number(req.query.fiscalYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9998) {
    return res.status(400).json({ error: 'A valid fiscalYear is required.' });
  }
  const currentYear = Number(req.query.currentYear);
  const currentMonth = Number(req.query.currentMonth);
  const now = Number.isInteger(currentYear) && Number.isInteger(currentMonth) && currentMonth >= 1 && currentMonth <= 12
    ? new Date(Date.UTC(currentYear, currentMonth - 1, 15))
    : new Date();
  res.json(buildFiscalAssignmentCalendar(db, fiscalYear, now));
});

router.patch('/api/ps-team-assignments/:employeeId', (req, res) => {
  try {
    const updated = saveManualAssignment(
      db,
      Number(req.params.employeeId),
      String(req.body?.assignedTo || '').trim(),
      String(req.body?.effectiveMonth || '').trim(),
    );
    res.json(updated);
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

module.exports = router;
