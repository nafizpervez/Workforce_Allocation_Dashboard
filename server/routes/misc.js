const express = require('express');
const { getAppDb } = require('../database');
const router = express.Router();
const db = getAppDb();

router.get('/api/fiscal-years', (_, res) => {
  const rows = db.prepare(`SELECT DISTINCT CASE WHEN month>=4 THEN year ELSE year-1 END AS fiscal_year FROM assignments ORDER BY fiscal_year ASC`).all();
  res.json(rows.map(r => r.fiscal_year));
});

router.get('/api/health', (_, res) => res.json({ ok: true }));

module.exports = router;
