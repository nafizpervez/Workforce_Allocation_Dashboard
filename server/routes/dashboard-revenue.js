const express = require('express');
const { getAppDb } = require('../database');
const { getRevenueAmount, isPSRevenueProject, matchesCategory } = require('../services/project-analytics');
const { fyLabel, getProjectFiscalPeriod, getProjectFiscalYear } = require('../services/fiscal');
const { safeNum } = require('../services/values');
const router = express.Router();
const db = getAppDb();

router.get('/api/dashboard/ps-revenue-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, end_date, fiscal_period, product_amount, opp_amount, budget, product_name, product_family, account_name, client, stage FROM projects'
  ).all();

  const CATEGORIES = ['ALL', 'ALLCLEAN', 'SOFTWARE', 'PS', 'PERSONAL', 'STUDENT'];

  const buildRevenueForCategory = (cat) => {
    const subset = allProjects.filter(p =>
      p.stage === 'Closed Won' && getProjectFiscalYear(p) !== null && matchesCategory(p, cat)
    );

    const fyData = {};
    for (const r of subset) {
      const fy = getProjectFiscalYear(r);
      if (fy === null) continue;
      if (!fyData[fy]) fyData[fy] = { total: 0, ps: 0, allProjects: [], psProjects: [] };

      // Revenue amount rule:
      // 1) Use Product Amount when available.
      // 2) If Product Amount is blank/zero, use Opportunity Amount / Amount.
      // This protects historical rows that have no Product Name.
      const amount = getRevenueAmount(r);
      fyData[fy].total += amount;
      fyData[fy].allProjects.push({
        name: r.name || r.code,
        code: r.code,
        amount,
        product_name: r.product_name || '',
        product_family: r.product_family || '—',
        fiscal_period: getProjectFiscalPeriod(r) || '',
        amount_source: safeNum(r.product_amount, 0) > 0 ? 'Product Amount' : 'Amount',
      });

      // PS Amount follows the same amount rule, but only for Professional Services rows.
      // If Product Name is missing, Product Family = Professional Services is enough
      // to classify the row as PS revenue.
      if (isPSRevenueProject(r)) {
        fyData[fy].ps += amount;
        fyData[fy].psProjects.push({
          name: r.name || r.code,
          code: r.code,
          amount,
          product_name: r.product_name || '',
          product_family: r.product_family || '—',
          fiscal_period: getProjectFiscalPeriod(r) || '',
          amount_source: safeNum(r.product_amount, 0) > 0 ? 'Product Amount' : 'Amount',
        });
      }
    }

    return Object.entries(fyData)
      .sort((a, b) => +a[0] - +b[0])
      .map(([fy, d]) => ({
        fy: +fy,
        label: fyLabel(+fy),
        ps_amount: +d.ps.toFixed(2),
        total_amount: +d.total.toFixed(2),
        pct: d.total > 0 ? +((d.ps / d.total) * 100).toFixed(1) : 0,
        all_projects: d.allProjects.sort((a, b) => b.amount - a.amount),
        ps_projects: d.psProjects.sort((a, b) => b.amount - a.amount),
      }));
  };

  const result = {};
  for (const cat of CATEGORIES) {
    result[cat] = buildRevenueForCategory(cat);
  }

  res.json(result);
});

module.exports = router;
