const express = require('express');
const { getAppDb } = require('../database');
const {
  getPreSaleProductSettings,
  listPreSaleProducts,
  savePreSaleProductSettings,
  savePreSaleProducts,
} = require('../services/presale-products');

const router = express.Router();
const db = getAppDb();

router.get('/api/presale-products', (_req, res) => {
  res.json(listPreSaleProducts(db));
});

router.put('/api/presale-products', (req, res) => {
  try {
    res.json(savePreSaleProducts(db, req.body?.products));
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.get('/api/presale-product-settings', (_req, res) => {
  res.json(getPreSaleProductSettings(db));
});

router.put('/api/presale-product-settings', (req, res) => {
  try {
    res.json(savePreSaleProductSettings(db, req.body));
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

module.exports = router;
