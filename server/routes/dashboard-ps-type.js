const express = require('express');
const { getAppDb } = require('../database');
const { fyLabel, getProjectFiscalYear } = require('../services/fiscal');
const router = express.Router();
const db = getAppDb();

router.get('/api/dashboard/ps-type-chart', (_, res) => {
  const rows = db.prepare(`
    SELECT end_date, fiscal_period, product_name, product_family, name, code, stage
    FROM projects
    WHERE stage = 'Closed Won'
  `).all();

  const fyData = {};
  for (const r of rows) {
    const fy = getProjectFiscalYear(r);
    if (fy === null) continue;

    const productText = (r.product_name || '').trim().toUpperCase();
    const nameText = (r.name || '').trim().toUpperCase();
    const combinedText = `${productText} ${nameText}`;
    const family = (r.product_family || '').trim().toUpperCase();

    const isSupport = combinedText.includes('PS SYSTEM SUPPORT') ||
      (family === 'PROFESSIONAL SERVICES' && combinedText.includes('SYSTEM SUPPORT'));
    const isImpl = combinedText.includes('PS PROJECT IMPLEMENTATION') ||
      combinedText.includes('PS PROJECT IMPLEMETATION') ||
      (family === 'PROFESSIONAL SERVICES' && combinedText.includes('PROJECT IMPLEMENT'));

    if (!isSupport && !isImpl) continue;
    if (!fyData[fy]) fyData[fy] = { support: 0, impl: 0, supportProjects: [], implProjects: [] };
    const projName = (r.name || r.code || 'Unknown').trim();
    if (isSupport) { fyData[fy].support++; fyData[fy].supportProjects.push(projName); }
    if (isImpl) { fyData[fy].impl++; fyData[fy].implProjects.push(projName); }
  }

  const result = Object.entries(fyData)
    .sort((a, b) => +a[0] - +b[0])
    .map(([fy, d]) => ({
      fy: +fy,
      label: fyLabel(+fy),
      support: d.support,
      impl: d.impl,
      supportProjects: d.supportProjects.sort(),
      implProjects: d.implProjects.sort(),
    }));

  res.json(result);
});


module.exports = router;
