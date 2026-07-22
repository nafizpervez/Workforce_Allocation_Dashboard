const { cleanText } = require('./values');

const FISCAL_WHERE = '((year = ? AND month >= 4) OR (year = ? AND month <= 3))';
const fiscalParams = fiscalYear => [fiscalYear, fiscalYear + 1];

function fiscalMonths(fiscalYear) {
  return [
    { year: fiscalYear, month: 4 }, { year: fiscalYear, month: 5 }, { year: fiscalYear, month: 6 },
    { year: fiscalYear, month: 7 }, { year: fiscalYear, month: 8 }, { year: fiscalYear, month: 9 },
    { year: fiscalYear, month: 10 }, { year: fiscalYear, month: 11 }, { year: fiscalYear, month: 12 },
    { year: fiscalYear + 1, month: 1 }, { year: fiscalYear + 1, month: 2 }, { year: fiscalYear + 1, month: 3 },
  ];
}


function getCurrentFiscalYearEnd(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4 ? year + 1 : year;
}

function getRunningProjectCutoffDate() {
  return `${new Date().getFullYear() - 2}-01-01`;
}

function getFiscalYear(dateText) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00`);
  if (isNaN(date)) return null;
  const month = date.getMonth() + 1;
  return month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
}

function normalizeFiscalPeriod(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const quarter = compact.match(/^Q([1-4])[-/\\]?(\d{4})$/);
  if (quarter) return `Q${quarter[1]}-${quarter[2]}`;
  const fiscalYear = compact.match(/^FY[-/\\]?(\d{4})$/);
  if (fiscalYear) return `FY-${fiscalYear[1]}`;
  const year = compact.match(/^(\d{4})$/);
  return year ? `FY-${year[1]}` : raw;
}

function getFiscalYearFromPeriod(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const quarter = compact.match(/^Q[1-4][-/\\]?(\d{4})$/);
  if (quarter) return Number(quarter[1]);
  const fiscalYear = compact.match(/^FY[-/\\]?(\d{4})$/);
  if (fiscalYear) return Number(fiscalYear[1]);
  const year = compact.match(/^(\d{4})$/);
  return year ? Number(year[1]) : null;
}

function getProjectFiscalYear(project) {
  return getFiscalYearFromPeriod(project?.fiscal_period);
}

function fiscalSortValue(project) {
  const fiscalYear = getProjectFiscalYear(project);
  if (fiscalYear === null) return 999999;
  const period = String(project?.fiscal_period || '').toUpperCase().replace(/\s+/g, '');
  const quarterMatch = period.match(/^Q([1-4])[-/\\]?\d{4}$/);
  return fiscalYear * 10 + (quarterMatch ? Number(quarterMatch[1]) : 9);
}

const fyLabel = fiscalYear => `FY ${fiscalYear}`;

module.exports = {
  FISCAL_WHERE,
  fiscalMonths,
  fiscalParams,
  fiscalSortValue,
  fyLabel,
  getCurrentFiscalYearEnd,
  getFiscalYear,
  getFiscalYearFromPeriod,
  getProjectFiscalYear,
  getRunningProjectCutoffDate,
  normalizeFiscalPeriod,
};
