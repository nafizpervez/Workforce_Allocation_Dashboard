const { fiscalSortValue, getCurrentFiscalYearEnd, getProjectFiscalYear } = require('./fiscal');
const { safeNum } = require('./values');

function normalizeProductText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeProjectFamily(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getPSProductType(value) {
  // Product Name is the sole source of truth for PS classification.
  // Removing punctuation and whitespace allows harmless formatting variations
  // such as "PS-System-Support", "ps_system_support", or extra spaces.
  const compact = normalizeProductText(value).replace(/[^A-Z0-9]/g, '');

  if (compact.includes('PSSYSTEMSUPPORT')) return 'SUPPORT';

  const implementationVariants = [
    'PSPROJECTIMPLEMENTATION',
    'PSPROJECTIMPLEMENT',
    'PSPROJECTIMPLEMETATION',
    'PSPROJECTIMPLEMENTAION',
  ];
  if (implementationVariants.some(variant => compact.includes(variant))) return 'IMPLEMENTATION';

  return null;
}

function isPSProductText(value) {
  return getPSProductType(value) !== null;
}

function getProductText(project) {
  return normalizeProductText(project?.product_name || '');
}

function isPSOnlyProject(project) {
  return isPSProductText(project?.product_name);
}

function getPSEngagementType(project) {
  return getPSProductType(project?.product_name);
}

function productCategory(productName, productFamily, projectName = '') {
  const productText = normalizeProductText(productName);
  const fallbackText = productText || normalizeProductText(projectName);
  const family = normalizeProjectFamily(productFamily);
  if (isPSProductText(productText)) return 'PS';
  if (productText.includes('PERSONAL USE')) return 'PERSONAL';
  if (productText.includes('STUDENT USE')) return 'STUDENT';
  if (family === 'software') return 'SOFTWARE';
  if (fallbackText.includes('LICENSE') || fallbackText.includes('RENEW') || fallbackText.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
  return 'OTHER';
}

function getRevenueAmount(project) {
  const productAmount = safeNum(project?.product_amount, 0);
  return productAmount > 0 ? productAmount : safeNum(project?.opp_amount ?? project?.budget, 0);
}

function isPSRevenueProject(project) {
  return isPSOnlyProject(project);
}

const RUNNING_CLOSED_WON_START_DATE = '2025-03-01';

function isProfessionalServiceRunningProject(project) {
  const closedWonDate = String(project?.end_date || '').trim();
  const projectFiscalYear = getProjectFiscalYear(project);
  const currentFiscalYear = getCurrentFiscalYearEnd();
  return (
    String(project?.stage || '').trim().toLowerCase() === 'closed won' &&
    isPSOnlyProject(project) &&
    Number(project?.progress) < 100 &&
    projectFiscalYear !== null &&
    projectFiscalYear >= currentFiscalYear &&
    /^\d{4}-\d{2}-\d{2}$/.test(closedWonDate) &&
    closedWonDate >= RUNNING_CLOSED_WON_START_DATE
  );
}

function isDealAcquisitionChartEligible(project) {
  // Deal Acquisition is driven by Closed Won status and fiscal year only.
  // Project progress must not hide an otherwise valid deal from the chart.
  return (
    String(project?.stage || '').trim().toLowerCase() === 'closed won' &&
    getProjectFiscalYear(project) !== null
  );
}

function matchesCategory(project, category) {
  const text = getProductText(project);
  const family = normalizeProjectFamily(project?.product_family);
  const personal = text.includes('PERSONAL USE');
  const student = text.includes('STUDENT USE');
  const professionalServices = isPSRevenueProject(project);
  switch (category) {
    case 'ALL': return true;
    case 'ALLCLEAN': return !personal && !student;
    case 'SOFTWARE': return family === 'software' && !personal && !student;
    case 'PS': return professionalServices;
    case 'PERSONAL': return personal;
    case 'STUDENT': return student;
    default: return true;
  }
}

function calcDealStatusesForSubset(projects) {
  const closedWon = projects
    .filter(project => String(project?.stage || '').trim().toLowerCase() === 'closed won' && getProjectFiscalYear(project) !== null)
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
    if (String(project?.stage || '').trim().toLowerCase() === 'closed won') continue;
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
  RUNNING_CLOSED_WON_START_DATE,
  calcDealStatuses,
  calcDealStatusesForSubset,
  getProductText,
  getPSEngagementType,
  getRevenueAmount,
  isDealAcquisitionChartEligible,
  isProfessionalServiceRunningProject,
  isPSOnlyProject,
  isPSRevenueProject,
  matchesCategory,
  productCategory,
};
