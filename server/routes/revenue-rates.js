const express = require('express');
const { getAppDb } = require('../database');
const {
  REVENUE_DESIGNATIONS,
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
    return {
      designation,
      professional_service_rate: Number(submitted?.professional_service_rate),
      pre_sale_rate: Number(submitted?.pre_sale_rate),
    };
  });

  const hasUnknownDesignation = submittedRates.some(rate =>
    !allowedDesignations.has(rate?.designation),
  );
  const hasInvalidRate = rates.some(rate =>
    !Number.isFinite(rate.professional_service_rate) ||
    rate.professional_service_rate < 0 ||
    !Number.isFinite(rate.pre_sale_rate) ||
    rate.pre_sale_rate < 0,
  );

  if (hasUnknownDesignation || hasInvalidRate || submittedRates.length !== REVENUE_DESIGNATIONS.length) {
    return res.status(400).json({
      error: 'Submit one non-negative Intrasourcing and Local + Pre Sale hourly rate for every supported designation.',
    });
  }

  res.json(saveRevenueRates(db, rates));
});

module.exports = router;
