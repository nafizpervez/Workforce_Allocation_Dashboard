const express = require('express');
const { getAppDb } = require('../database');
const {
  COMMITTED_TARGET_KEYS,
  listCommittedTargets,
  saveCommittedTarget,
} = require('../services/committed-targets');

const router = express.Router();
const db = getAppDb();
const allowedTargetKeys = new Set(COMMITTED_TARGET_KEYS);

router.get('/api/committed-targets', (_req, res) => {
  res.json(listCommittedTargets(db));
});

router.put('/api/committed-targets/:targetKey', (req, res) => {
  const targetKey = String(req.params.targetKey || '').trim();
  const amount = Number(req.body?.amount);

  if (!allowedTargetKeys.has(targetKey)) {
    return res.status(404).json({ error: 'Unknown committed target.' });
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({
      error: 'Committed target amount must be zero or a positive number.',
    });
  }

  return res.json(saveCommittedTarget(db, targetKey, +amount.toFixed(2)));
});

module.exports = router;
