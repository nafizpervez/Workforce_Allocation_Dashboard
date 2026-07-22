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

function validDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function parseDateParts(value) {
  const text = cleanText(value);
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (match) return validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));

  // Project Excel imports use the U.S. month/day/year date layout.
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return validDateParts(year, Number(match[1]), Number(match[2]));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return validDateParts(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function getFiscalPeriodFromDate(dateText) {
  const parts = parseDateParts(dateText);
  if (!parts) return '';

  const fiscalYearEnd = parts.month >= 4 ? parts.year + 1 : parts.year;
  const quarter = parts.month >= 4 && parts.month <= 6
    ? 1
    : parts.month >= 7 && parts.month <= 9
      ? 2
      : parts.month >= 10
        ? 3
        : 4;
  return `Q${quarter}-${fiscalYearEnd}`;
}

function getFiscalYearEndFromDate(dateText) {
  const period = getFiscalPeriodFromDate(dateText);
  return getFiscalYearFromPeriod(period);
}

// Retained for backward compatibility: returns the starting calendar year of
// the April-March fiscal year containing the supplied date.
function getFiscalYear(dateText) {
  const fiscalYearEnd = getFiscalYearEndFromDate(dateText);
  return fiscalYearEnd === null ? null : fiscalYearEnd - 1;
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

function getProjectFiscalPeriod(project) {
  return getFiscalPeriodFromDate(project?.end_date) || normalizeFiscalPeriod(project?.fiscal_period);
}

function getProjectFiscalYear(project) {
  return getFiscalYearFromPeriod(getProjectFiscalPeriod(project));
}

function fiscalSortValue(project) {
  const fiscalYear = getProjectFiscalYear(project);
  if (fiscalYear === null) return 999999;
  const period = getProjectFiscalPeriod(project).toUpperCase().replace(/\s+/g, '');
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
  getFiscalPeriodFromDate,
  getFiscalYear,
  getFiscalYearEndFromDate,
  getFiscalYearFromPeriod,
  getProjectFiscalPeriod,
  getProjectFiscalYear,
  getRunningProjectCutoffDate,
  normalizeFiscalPeriod,
  parseDateParts,
};
