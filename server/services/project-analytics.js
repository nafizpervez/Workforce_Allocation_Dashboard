const { fiscalSortValue, getProjectFiscalYear } = require('./fiscal');
const { safeNum } = require('./values');

function getProductText(project) {
  return String(project?.product_name || project?.name || '').toUpperCase();
}

function productCategory(productName, productFamily, projectName = '') {
  const name = (productName || '').toUpperCase();
  const text = name || (projectName || '').toUpperCase();
  const family = (productFamily || '').toUpperCase();
  if (text.includes('PERSONAL USE')) return 'PERSONAL';
  if (text.includes('STUDENT USE')) return 'STUDENT';
  if (family === 'PROFESSIONAL SERVICES' || text.includes('PS SYSTEM SUPPORT') || text.includes('PS PROJECT IMPLEMENT')) return 'PS';
  if (family === 'SOFTWARE') return 'SOFTWARE';
  if (text.includes('LICENSE') || text.includes('RENEW') || text.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
  return 'OTHER';
}

function getRevenueAmount(project) {
  const productAmount = safeNum(project?.product_amount, 0);
  return productAmount > 0 ? productAmount : safeNum(project?.opp_amount ?? project?.budget, 0);
}

function isPSRevenueProject(project) {
  const family = String(project?.product_family || '').toUpperCase();
  const text = getProductText(project);
  return family === 'PROFESSIONAL SERVICES' || text.includes('PS SYSTEM SUPPORT') || text.includes('PS PROJECT IMPLEMENT');
}

function matchesCategory(project, category) {
  const text = getProductText(project);
  const family = (project.product_family || '').toUpperCase();
  const personal = text.includes('PERSONAL USE');
  const student = text.includes('STUDENT USE');
  const professionalServices = isPSRevenueProject(project);
  switch (category) {
    case 'ALL': return true;
    case 'ALLCLEAN': return !personal && !student;
    case 'SOFTWARE': return family === 'SOFTWARE' && !personal && !student;
    case 'PS': return professionalServices;
    case 'PERSONAL': return personal;
    case 'STUDENT': return student;
    default: return true;
  }
}

function calcDealStatusesForSubset(projects) {
  const closedWon = projects
    .filter(project => project.stage === 'Closed Won' && getProjectFiscalYear(project) !== null)
    .map(project => ({ ...project, fy: getProjectFiscalYear(project) }))
    .sort((left, right) => {
      if (left.fy !== right.fy) return left.fy - right.fy;
      const fiscalDifference = fiscalSortValue(left) - fiscalSortValue(right);
      if (fiscalDifference) return fiscalDifference;
      if ((left.end_date || '') !== (right.end_date || '')) return String(left.end_date || '').localeCompare(String(right.end_date || ''));
      return left.id - right.id;
    });

  const accounts = {};
  for (const project of closedWon) {
    const key = (project.account_name || project.client || '').trim().toLowerCase();
    if (key) (accounts[key] || (accounts[key] = [])).push(project);
  }

  const statuses = {};
  for (const occurrences of Object.values(accounts)) {
    let previousFiscalYear = null;
    let canonicalStatus = null;
    for (const occurrence of occurrences) {
      let status;
      if (previousFiscalYear === null) status = canonicalStatus = 'NEW LOGO';
      else if (occurrence.fy === previousFiscalYear) status = canonicalStatus === 'REACTIVE' ? 'REPEAT' : canonicalStatus;
      else if (occurrence.fy === previousFiscalYear + 1) status = canonicalStatus = 'REPEAT';
      else status = canonicalStatus = 'REACTIVE';
      statuses[occurrence.id] = status;
      previousFiscalYear = occurrence.fy;
    }
  }

  const accountLastFiscalYear = {};
  for (const project of closedWon) {
    const key = (project.account_name || project.client || '').trim().toLowerCase();
    if (!accountLastFiscalYear[key] || project.fy > accountLastFiscalYear[key]) accountLastFiscalYear[key] = project.fy;
  }
  for (const project of projects) {
    if (project.stage === 'Closed Won') continue;
    const fiscalYear = getProjectFiscalYear(project) || new Date().getFullYear();
    const key = (project.account_name || project.client || '').trim().toLowerCase();
    const lastFiscalYear = accountLastFiscalYear[key];
    statuses[project.id] = lastFiscalYear === undefined ? 'NEW LOGO' : lastFiscalYear >= fiscalYear - 1 ? 'REPEAT' : 'REACTIVE';
  }
  for (const project of projects) if (!(project.id in statuses)) statuses[project.id] = 'NEW LOGO';
  return statuses;
}

const calcDealStatuses = calcDealStatusesForSubset;

module.exports = {
  calcDealStatuses,
  calcDealStatusesForSubset,
  getProductText,
  getRevenueAmount,
  isPSRevenueProject,
  matchesCategory,
  productCategory,
};
