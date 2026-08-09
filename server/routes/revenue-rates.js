const express = require('express');
const { getAppDb } = require('../database');
const {
  REVENUE_DESIGNATIONS,
  REVENUE_RATE_CHANGE_MODES,
  REVENUE_RATE_FIELDS,
  listRevenueRates,
  normalizeEffectiveDate,
  saveRevenueRates,
} = require('../services/revenue-rates');

const router = express.Router();
const db = getAppDb();
const allowedDesignations = new Set(REVENUE_DESIGNATIONS);

router.get('/api/revenue-rates', (_req, res) => {
  res.json(listRevenueRates(db));
});

router.put('/api/revenue-rates', (req, res) => {
  const submittedRates = Array.isArray(req.body?.rates) ? req.body.rates : [];
  const submittedMap = new Map(submittedRates.map(rate => [rate?.designation, rate]));
  const applyMode = String(req.body?.apply_mode || '').trim().toLowerCase();
  const effectiveDate = normalizeEffectiveDate(req.body?.effective_date);

  const rates = REVENUE_DESIGNATIONS.map(designation => {
    const submitted = submittedMap.get(designation);
    return REVENUE_RATE_FIELDS.reduce((rate, field) => {
      rate[field] = Number(submitted?.[field]);
      return rate;
    }, { designation });
  });

  const hasUnknownDesignation = submittedRates.some(rate =>
    !allowedDesignations.has(rate?.designation),
  );
  const hasInvalidRate = rates.some(rate =>
    REVENUE_RATE_FIELDS.some(field =>
      !Number.isFinite(rate[field]) || rate[field] < 0,
    ),
  );

  if (
    hasUnknownDesignation ||
    hasInvalidRate ||
    submittedRates.length !== REVENUE_DESIGNATIONS.length
  ) {
    return res.status(400).json({
      error: 'Submit one non-negative Intrasourcing rate and one non-negative shared Local / Pre Sale / Training rate for every supported designation.',
    });
  }

  if (!REVENUE_RATE_CHANGE_MODES.includes(applyMode)) {
    return res.status(400).json({
      error: 'Choose whether the changed rates apply to future records only or to all records.',
    });
  }

  if (applyMode === 'future') {
    const today = new Date().toISOString().slice(0, 10);
    if (!effectiveDate) {
      return res.status(400).json({ error: 'Choose a valid effective date for the future-only rate change.' });
    }
    if (effectiveDate < today) {
      return res.status(400).json({
        error: 'Future-only rate changes must start today or later. Use All records for a historical correction.',
      });
    }
  }

  try {
    return res.json(saveRevenueRates(db, rates, {
      applyMode,
      effectiveDate,
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to save revenue rates.' });
  }
});

module.exports = router;
