const express = require('express');
const { getAppDb } = require('../database');

const router = express.Router();
const db = getAppDb();

router.get('/api/employees', (_, res) => {
  const employees = db.prepare(`
    SELECT
      id,
      employee_code,
      name,
      dept,
      designation,
      email,
      COALESCE(active, 1) AS active,
      created_at
    FROM employees
    ORDER BY id
  `).all();

  res.json(employees);
});

router.post('/api/employees', (req, res) => {
  const {
    employee_code,
    name,
    dept,
    designation,
    email,
  } = req.body || {};

  if (!name || !dept) {
    return res.status(400).json({
      error: 'name and dept are required',
    });
  }

  const result = db.prepare(`
    INSERT INTO employees (
      employee_code,
      name,
      dept,
      designation,
      email
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    employee_code || '',
    name,
    dept,
    designation || '',
    email || null
  );

  const employee = db.prepare(`
    SELECT *
    FROM employees
    WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(employee);
});

router.put('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);

  const existingEmployee = db.prepare(`
    SELECT id
    FROM employees
    WHERE id = ?
  `).get(id);

  if (!existingEmployee) {
    return res.status(404).json({
      error: 'not found',
    });
  }

  const {
    employee_code,
    name,
    dept,
    designation,
    email,
  } = req.body || {};

  db.prepare(`
    UPDATE employees
    SET
      employee_code = COALESCE(?, employee_code),
      name = COALESCE(?, name),
      dept = COALESCE(?, dept),
      designation = COALESCE(?, designation),
      email = COALESCE(?, email)
    WHERE id = ?
  `).run(
    employee_code ?? null,
    name ?? null,
    dept ?? null,
    designation ?? null,
    email ?? null,
    id
  );

  const employee = db.prepare(`
    SELECT *
    FROM employees
    WHERE id = ?
  `).get(id);

  res.json(employee);
});

router.patch('/api/employees/:id/active', (req, res) => {
  const id = Number(req.params.id);

  const employee = db.prepare(`
    SELECT
      id,
      COALESCE(active, 1) AS active
    FROM employees
    WHERE id = ?
  `).get(id);

  if (!employee) {
    return res.status(404).json({
      error: 'not found',
    });
  }

  const newActive = employee.active ? 0 : 1;

  db.prepare(`
    UPDATE employees
    SET active = ?
    WHERE id = ?
  `).run(newActive, id);

  const updatedEmployee = db.prepare(`
    SELECT
      id,
      employee_code,
      name,
      dept,
      designation,
      email,
      COALESCE(active, 1) AS active,
      created_at
    FROM employees
    WHERE id = ?
  `).get(id);

  res.json(updatedEmployee);
});

router.delete('/api/employees/:id', (req, res) => {
  const result = db.prepare(`
    DELETE FROM employees
    WHERE id = ?
  `).run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({
      error: 'not found',
    });
  }

  res.json({ ok: true });
});

module.exports = router;