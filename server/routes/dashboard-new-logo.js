const express = require('express');
const { getAppDb } = require('../database');
const { calcDealStatusesForSubset, matchesCategory, productCategory } = require('../services/project-analytics');
const { fiscalSortValue, fyLabel, getProjectFiscalYear } = require('../services/fiscal');
const router = express.Router();
const db = getAppDb();

router.get('/api/dashboard/new-logo-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, account_name, client, end_date, fiscal_period, stage, product_name, product_family FROM projects'
  ).all();

  const CATEGORIES = ['ALL', 'ALLCLEAN', 'SOFTWARE', 'PS', 'PERSONAL', 'STUDENT'];

  /*
   * For each category:
   *   1. Filter projects to only those matching the category
   *   2. Compute NEW LOGO / REPEAT / REACTIVE independently within that subset
   *   3. Build FY counts and project lists with the canonical-status dedup:
   *      - One bar count per unique account per FY
   *      - Canonical status = status of the FIRST SA code for that account in that FY
   *      - Project list: one entry per (account + product_category) per FY per status
   */
  const buildChartForCategory = (cat) => {
    const subset = allProjects.filter(p => p.stage === 'Closed Won' && getProjectFiscalYear(p) !== null && matchesCategory(p, cat));
    const statusMap = calcDealStatusesForSubset(subset);

    // Sort chronologically
    const cwSorted = subset
      .filter(p => getProjectFiscalYear(p) !== null)
      .sort((a, b) => {
        const fiscalDiff = fiscalSortValue(a) - fiscalSortValue(b);
        if (fiscalDiff !== 0) return fiscalDiff;
        if ((a.end_date || '') !== (b.end_date || '')) return String(a.end_date || '').localeCompare(String(b.end_date || ''));
        return a.id - b.id;
      });

    const acctFYStatus = {}; // [acctKey][fy] = canonical status (locked to first SA code)
    const fySeenCombo = {}; // [fy][status] = Set of "acctKey|prodCat"
    const fyAcctSeen = {}; // [fy] = Set of acctKey
    const fyData = {};
    const fyProjects = {};

    for (const p of cwSorted) {
      const fy = getProjectFiscalYear(p);
      if (fy === null) continue;
      const acctKey = (p.account_name || p.client || '').trim().toLowerCase();
      const acctDisp = (p.account_name || p.client || p.name || p.code || 'Unknown').trim();
      const prodName = (p.product_name || '').trim();
      const prodFam = (p.product_family || '').trim();
      const prodCat = productCategory(prodName, prodFam, p.name);

      // Canonical status: locked to first SA code for this account in this FY
      if (!acctFYStatus[acctKey]) acctFYStatus[acctKey] = {};
      if (!(fy in acctFYStatus[acctKey])) {
        acctFYStatus[acctKey][fy] = statusMap[p.id] || 'NEW LOGO';
      }
      const st = acctFYStatus[acctKey][fy];

      if (!fyData[fy]) fyData[fy] = { 'NEW LOGO': 0, 'REPEAT': 0, 'REACTIVE': 0 };
      if (!fyProjects[fy]) fyProjects[fy] = { 'NEW LOGO': [], 'REPEAT': [], 'REACTIVE': [] };
      if (!fySeenCombo[fy]) fySeenCombo[fy] = { 'NEW LOGO': new Set(), 'REPEAT': new Set(), 'REACTIVE': new Set() };
      if (!fyAcctSeen[fy]) fyAcctSeen[fy] = new Set();

      // Bar count: once per unique account per FY
      if (!fyAcctSeen[fy].has(acctKey)) {
        fyData[fy][st]++;
        fyAcctSeen[fy].add(acctKey);
      }

      // Project list: once per (account + prodCat) per FY per status
      const combo = acctKey + '|' + prodCat;
      if (!fySeenCombo[fy][st].has(combo)) {
        fySeenCombo[fy][st].add(combo);
        fyProjects[fy][st].push({
          name: acctDisp,
          code: (p.code || '').trim(),
          opp_name: (p.name || '').trim(),
          product_name: prodName,
          product_family: prodFam,
        });
      }
    }

    return Object.entries(fyData)
      .sort((a, b) => +a[0] - +b[0])
      .map(([fy, c]) => ({
        fy: +fy,
        label: fyLabel(+fy),
        'NEW LOGO': c['NEW LOGO'],
        'REPEAT': c['REPEAT'],
        'REACTIVE': c['REACTIVE'],
        projects: {
          'NEW LOGO': (fyProjects[+fy]?.['NEW LOGO'] || []).sort((a, b) => a.name.localeCompare(b.name)),
          'REPEAT': (fyProjects[+fy]?.['REPEAT'] || []).sort((a, b) => a.name.localeCompare(b.name)),
          'REACTIVE': (fyProjects[+fy]?.['REACTIVE'] || []).sort((a, b) => a.name.localeCompare(b.name)),
        }
      }));
  };

  // Build chart data for all categories in one request
  const result = {};
  for (const cat of CATEGORIES) {
    result[cat] = buildChartForCategory(cat);
  }

  res.json(result);
});


module.exports = router;
