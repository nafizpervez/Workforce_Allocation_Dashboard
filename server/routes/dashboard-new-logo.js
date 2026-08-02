const express = require('express');
const { getAppDb } = require('../database');
const {
  calcDealStatusesForSubset,
  isDealAcquisitionChartEligible,
  matchesCategory,
  productCategory,
} = require('../services/project-analytics');
const { fiscalSortValue, fyLabel, getProjectFiscalYear } = require('../services/fiscal');
const router = express.Router();
const db = getAppDb();

router.get('/api/dashboard/new-logo-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, account_name, client, end_date, fiscal_period, stage, progress, product_name, product_family FROM projects'
  ).all();

  const CATEGORIES = ['ALL', 'ALLCLEAN', 'SOFTWARE', 'PS', 'PERSONAL', 'STUDENT'];

  // Deal status is calculated from the complete Closed Won account history.
  // Category filtering only controls which individual rows are displayed and counted.
  const closedWonHistory = allProjects.filter(project => (
    String(project.stage || '').trim().toLowerCase() === 'closed won' &&
    getProjectFiscalYear(project) !== null
  ));
  const globalStatusMap = calcDealStatusesForSubset(closedWonHistory);
  const globalAcctFYStatus = {};

  const globallySortedHistory = [...closedWonHistory].sort((a, b) => {
    const fiscalDiff = fiscalSortValue(a) - fiscalSortValue(b);
    if (fiscalDiff !== 0) return fiscalDiff;
    if ((a.end_date || '') !== (b.end_date || '')) return String(a.end_date || '').localeCompare(String(b.end_date || ''));
    return a.id - b.id;
  });

  for (const project of globallySortedHistory) {
    const fy = getProjectFiscalYear(project);
    if (fy === null) continue;
    const acctKey = (project.account_name || project.client || '').trim().toLowerCase();
    if (!globalAcctFYStatus[acctKey]) globalAcctFYStatus[acctKey] = {};
    if (!(fy in globalAcctFYStatus[acctKey])) {
      globalAcctFYStatus[acctKey][fy] = globalStatusMap[project.id] || 'NEW LOGO';
    }
  }

  /*
   * PS Only is a project-level view so that its FY total matches the PS
   * Engagement Breakdown. Every qualifying project database ID is counted and
   * listed exactly once. Opportunity Number is never used for deduplication.
   *
   * The other product-category views retain their existing account-level count.
   */
  const buildChartForCategory = (cat) => {
    const countProjects = cat === 'PS';
    const categoryHistory = closedWonHistory.filter(project => matchesCategory(project, cat));
    const eligibleSubset = categoryHistory.filter(isDealAcquisitionChartEligible);

    const cwSorted = eligibleSubset
      .filter(project => getProjectFiscalYear(project) !== null)
      .sort((a, b) => {
        const fiscalDiff = fiscalSortValue(a) - fiscalSortValue(b);
        if (fiscalDiff !== 0) return fiscalDiff;
        if ((a.end_date || '') !== (b.end_date || '')) return String(a.end_date || '').localeCompare(String(b.end_date || ''));
        return a.id - b.id;
      });

    const acctFYStatus = {};
    const fyDetailSeen = {};
    const fyAcctSeen = {};
    const fyProjectSeen = {};
    const fyData = {};
    const fyProjects = {};

    for (const project of cwSorted) {
      const fy = getProjectFiscalYear(project);
      if (fy === null) continue;

      const projectId = Number(project.id);
      const acctKey = (project.account_name || project.client || '').trim().toLowerCase();
      const acctDisp = (project.account_name || project.client || project.name || project.code || 'Unknown').trim();
      const prodName = (project.product_name || '').trim();
      const prodFam = (project.product_family || '').trim();
      const prodCat = productCategory(prodName, prodFam, project.name);

      if (!acctFYStatus[acctKey]) acctFYStatus[acctKey] = {};
      if (!(fy in acctFYStatus[acctKey])) {
        acctFYStatus[acctKey][fy] = globalAcctFYStatus[acctKey]?.[fy] || globalStatusMap[project.id] || 'NEW LOGO';
      }

      // For PS, retain the status assigned to this exact project occurrence.
      // This also preserves the existing duplicate rule after a REACTIVE return.
      const status = countProjects
        ? (globalStatusMap[project.id] || 'NEW LOGO')
        : acctFYStatus[acctKey][fy];

      if (!fyData[fy]) fyData[fy] = { 'NEW LOGO': 0, 'REPEAT': 0, 'REACTIVE': 0 };
      if (!fyProjects[fy]) fyProjects[fy] = { 'NEW LOGO': [], 'REPEAT': [], 'REACTIVE': [] };
      if (!fyDetailSeen[fy]) fyDetailSeen[fy] = { 'NEW LOGO': new Set(), 'REPEAT': new Set(), 'REACTIVE': new Set() };
      if (!fyAcctSeen[fy]) fyAcctSeen[fy] = new Set();
      if (!fyProjectSeen[fy]) fyProjectSeen[fy] = new Set();

      if (countProjects) {
        if (!fyProjectSeen[fy].has(projectId)) {
          fyData[fy][status] += 1;
          fyProjectSeen[fy].add(projectId);
        }
      } else if (!fyAcctSeen[fy].has(acctKey)) {
        fyData[fy][status] += 1;
        fyAcctSeen[fy].add(acctKey);
      }

      // PS details are one row per unique database project ID. Other category
      // views keep the existing account + product-category detail grouping.
      const detailKey = countProjects ? String(projectId) : `${acctKey}|${prodCat}`;
      if (!fyDetailSeen[fy][status].has(detailKey)) {
        fyDetailSeen[fy][status].add(detailKey);
        fyProjects[fy][status].push({
          id: projectId,
          name: acctDisp,
          code: (project.code || '').trim(),
          opp_name: (project.name || '').trim(),
          product_name: prodName,
          product_family: prodFam,
        });
      }
    }

    return Object.entries(fyData)
      .sort((a, b) => +a[0] - +b[0])
      .map(([fy, counts]) => ({
        fy: +fy,
        label: fyLabel(+fy),
        count_unit: countProjects ? 'projects' : 'accounts',
        'NEW LOGO': counts['NEW LOGO'],
        'REPEAT': counts['REPEAT'],
        'REACTIVE': counts['REACTIVE'],
        projects: {
          'NEW LOGO': (fyProjects[+fy]?.['NEW LOGO'] || []).sort((a, b) => a.name.localeCompare(b.name)),
          'REPEAT': (fyProjects[+fy]?.['REPEAT'] || []).sort((a, b) => a.name.localeCompare(b.name)),
          'REACTIVE': (fyProjects[+fy]?.['REACTIVE'] || []).sort((a, b) => a.name.localeCompare(b.name)),
        },
      }));
  };

  const result = {};
  for (const cat of CATEGORIES) result[cat] = buildChartForCategory(cat);

  res.json(result);
});

module.exports = router;
