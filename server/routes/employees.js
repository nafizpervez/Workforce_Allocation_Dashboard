const express = require('express');
const { DEFAULT_ANNUAL_WORKDAYS } = require('../../config');
const { getAppDb } = require('../database');
const { canonicalPersonName } = require('../services/person-identity');
const { canonicalDesignationDisplay, withCanonicalDesignation } = require('../services/designations');

const router = express.Router();
const db = getAppDb();

const EMPLOYEE_SELECT = `
  SELECT
    id,
    employee_code,
    name,
    dept,
    designation,
    CASE
      WHEN COALESCE(workdays_is_custom, 0) = 0 THEN ${DEFAULT_ANNUAL_WORKDAYS}
      ELSE COALESCE(workdays, ${DEFAULT_ANNUAL_WORKDAYS})
    END AS workdays,
    COALESCE(workdays_is_custom, 0) AS workdays_is_custom,
    email,
    COALESCE(active, 1) AS active,
    created_at
  FROM employees
`;

function normalizeWorkdays(value, fallback = DEFAULT_ANNUAL_WORKDAYS) {
  const isMissing = value === undefined || value === null || value === '';
  if (isMissing && fallback === null) return null;

  const normalized = Number(isMissing ? fallback : value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

function workdaysCustomFlag(workdays) {
  return Number(workdays) === DEFAULT_ANNUAL_WORKDAYS ? 0 : 1;
}

router.get('/api/employees', (_, res) => {
  const employees = db.prepare(`${EMPLOYEE_SELECT} ORDER BY id`).all().map(withCanonicalDesignation);
  res.json(employees);
});

router.post('/api/employees', (req, res) => {
  const {
    employee_code,
    name,
    dept,
    designation,
    workdays = DEFAULT_ANNUAL_WORKDAYS,
    email,
  } = req.body || {};

  const canonicalName = canonicalPersonName(name);
  const normalizedWorkdays = normalizeWorkdays(workdays);

  if (!canonicalName || !dept) {
    return res.status(400).json({ error: 'name and dept are required' });
  }

  if (normalizedWorkdays === null) {
    return res.status(400).json({ error: 'workdays must be a non-negative whole number' });
  }

  const info = db.prepare(`
    INSERT INTO employees (
      employee_code,
      name,
      dept,
      designation,
      workdays,
      workdays_is_custom,
      email
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    employee_code || '',
    canonicalName,
    dept,
    canonicalDesignationDisplay(designation) || '',
    normalizedWorkdays,
    workdaysCustomFlag(normalizedWorkdays),
    email || null,
  );

  const employee = withCanonicalDesignation(db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(info.lastInsertRowid));
  res.status(201).json(employee);
});

router.put('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: 'not found' });
  }

  const {
    employee_code,
    name,
    dept,
    designation,
    workdays,
    email,
  } = req.body || {};

  const hasWorkdays = workdays !== undefined && workdays !== null && workdays !== '';
  const normalizedWorkdays = hasWorkdays ? normalizeWorkdays(workdays) : null;

  if (hasWorkdays && normalizedWorkdays === null) {
    return res.status(400).json({ error: 'workdays must be a non-negative whole number' });
  }

  db.prepare(`
    UPDATE employees
    SET
      employee_code = COALESCE(?, employee_code),
      name = COALESCE(?, name),
      dept = COALESCE(?, dept),
      designation = COALESCE(?, designation),
      workdays = CASE WHEN ? = 1 THEN ? ELSE workdays END,
      workdays_is_custom = CASE WHEN ? = 1 THEN ? ELSE workdays_is_custom END,
      email = COALESCE(?, email)
    WHERE id = ?
  `).run(
    employee_code ?? null,
    name === undefined || name === null ? null : canonicalPersonName(name),
    dept ?? null,
    designation === undefined || designation === null ? null : canonicalDesignationDisplay(designation),
    hasWorkdays ? 1 : 0,
    normalizedWorkdays,
    hasWorkdays ? 1 : 0,
    hasWorkdays ? workdaysCustomFlag(normalizedWorkdays) : null,
    email ?? null,
    id,
  );

  const employee = withCanonicalDesignation(db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(id));
  res.json(employee);
});

router.patch('/api/employees/:id/workdays', (req, res) => {
  const id = Number(req.params.id);
  const workdays = normalizeWorkdays(req.body?.workdays, null);
  const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: 'not found' });
  }

  if (workdays === null) {
    return res.status(400).json({ error: 'workdays must be a non-negative whole number' });
  }

  db.prepare(`
    UPDATE employees
    SET workdays = ?, workdays_is_custom = ?
    WHERE id = ?
  `).run(workdays, workdaysCustomFlag(workdays), id);

  const employee = withCanonicalDesignation(db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(id));
  res.json(employee);
});

router.patch('/api/employees/:id/active', (req, res) => {
  const id = Number(req.params.id);
  const employee = db.prepare(`
    SELECT id, COALESCE(active, 1) AS active
    FROM employees
    WHERE id = ?
  `).get(id);

  if (!employee) {
    return res.status(404).json({ error: 'not found' });
  }

  const active = employee.active ? 0 : 1;
  db.prepare('UPDATE employees SET active = ? WHERE id = ?').run(active, id);

  const updatedEmployee = withCanonicalDesignation(db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(id));
  res.json(updatedEmployee);
});

router.delete('/api/employees/:id', (req, res) => {
  const info = db.prepare('DELETE FROM employees WHERE id = ?').run(Number(req.params.id));

  if (!info.changes) {
    return res.status(404).json({ error: 'not found' });
  }

  res.json({ ok: true });
});

module.exports = router;
