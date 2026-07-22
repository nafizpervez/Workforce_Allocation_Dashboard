const crypto = require('crypto');
const express = require('express');
const { MODAL_ACCESS_PASSWORD } = require('../config');
const { getAppDb } = require('../database');
const router = express.Router();
const db = getAppDb();

function secureTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8');
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

router.get('/api/fiscal-years', (_, res) => {
  const rows = db.prepare(`SELECT DISTINCT CASE WHEN month>=4 THEN year ELSE year-1 END AS fiscal_year FROM assignments ORDER BY fiscal_year ASC`).all();
  res.json(rows.map(r => r.fiscal_year));
});

router.post('/api/modal-access/verify', (req, res) => {
  if (!secureTextEqual(req.body?.password, MODAL_ACCESS_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  return res.json({ ok: true });
});

router.get('/api/health', (_, res) => res.json({ ok: true }));

module.exports = router;
