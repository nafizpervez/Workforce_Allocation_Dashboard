const express = require('express');
const { getAppDb } = require('../database');
const {
  REVENUE_DESIGNATIONS,
  REVENUE_RATE_FIELDS,
  listRevenueRates,
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

  res.json(saveRevenueRates(db, rates));
});

module.exports = router;
