const express = require('express');
const { getAppDb } = require('../database');
const { canonicalPersonName } = require('../services/person-identity');

const router = express.Router();
const db = getAppDb();

const EMPLOYEE_SELECT = `
  SELECT
    id,
    employee_code,
    name,
    dept,
    designation,
    COALESCE(workdays, 220) AS workdays,
    email,
    COALESCE(active, 1) AS active,
    created_at
  FROM employees
`;

router.get('/api/employees', (_, res) => {
  const employees = db.prepare(`${EMPLOYEE_SELECT} ORDER BY id`).all();
  res.json(employees);
});

router.post('/api/employees', (req, res) => {
  const {
    employee_code,
    name,
    dept,
    designation,
    workdays = 220,
    email,
  } = req.body || {};

  const canonicalName = canonicalPersonName(name);
  const normalizedWorkdays = Number(workdays);

  if (!canonicalName || !dept) {
    return res.status(400).json({ error: 'name and dept are required' });
  }

  if (!Number.isInteger(normalizedWorkdays) || normalizedWorkdays < 0) {
    return res.status(400).json({ error: 'workdays must be a non-negative whole number' });
  }

  const info = db.prepare(`
    INSERT INTO employees (
      employee_code,
      name,
      dept,
      designation,
      workdays,
      email
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    employee_code || '',
    canonicalName,
    dept,
    designation || '',
    normalizedWorkdays,
    email || null,
  );

  const employee = db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(info.lastInsertRowid);
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

  const normalizedWorkdays = workdays === undefined || workdays === null
    ? null
    : Number(workdays);

  if (normalizedWorkdays !== null && (
    !Number.isInteger(normalizedWorkdays) || normalizedWorkdays < 0
  )) {
    return res.status(400).json({ error: 'workdays must be a non-negative whole number' });
  }

  db.prepare(`
    UPDATE employees
    SET
      employee_code = COALESCE(?, employee_code),
      name = COALESCE(?, name),
      dept = COALESCE(?, dept),
      designation = COALESCE(?, designation),
      workdays = COALESCE(?, workdays),
      email = COALESCE(?, email)
    WHERE id = ?
  `).run(
    employee_code ?? null,
    name === undefined || name === null ? null : canonicalPersonName(name),
    dept ?? null,
    designation ?? null,
    normalizedWorkdays,
    email ?? null,
    id,
  );

  const employee = db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(id);
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

  const updatedEmployee = db.prepare(`${EMPLOYEE_SELECT} WHERE id = ?`).get(id);
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
