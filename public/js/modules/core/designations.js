/* Workforce Allocation Dashboard — core/designations.js */

const RESOURCE_DESIGNATIONS = Object.freeze([
  'Head of Department',
  'Senior Manager',
  'Technical Lead',
  'Senior Consultant',
  'Consultant',
  'Jr. Consultant',
  'Analyst',
]);

// Revenue rates remain stored under the five historical rate keys so existing
// saved rates and effective-dated history continue to work without a database
// migration. Employee designations are mapped into those shared rate groups.
const REVENUE_RATE_GROUPS = Object.freeze([
  Object.freeze({
    rateDesignation: 'Team Lead',
    label: 'Technical Lead, Senior Project Manager',
    aliases: Object.freeze([
      'Team Lead',
      'Technical Lead',
      'Senior Project Manager',
    ]),
  }),
  Object.freeze({
    rateDesignation: 'Senior Consultant',
    label: 'Senior Consultant, Senior Software Engineer, Project Manager',
    aliases: Object.freeze([
      'Senior Consultant',
      'Senior Software Engineer',
      'Project Manager',
    ]),
  }),
  Object.freeze({
    rateDesignation: 'Consultant',
    label: 'Consultant, Software Engineer, Jr. Project Manager',
    aliases: Object.freeze([
      'Consultant',
      'Software Engineer',
      'Jr. Project Manager',
      'Junior Project Manager',
    ]),
  }),
  Object.freeze({
    rateDesignation: 'Junior Consultant',
    label: 'Jr. Consultant, Software Developer, Project Coordinator',
    aliases: Object.freeze([
      'Junior Consultant',
      'Jr. Consultant',
      'Software Developer',
      'Project Coordinator',
    ]),
  }),
  Object.freeze({
    rateDesignation: 'Analyst',
    label: 'Analyst',
    aliases: Object.freeze(['Analyst']),
  }),
]);

function normalizeDesignationKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeDesignationAliasKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._–—-]+/g, ' ')
    .replace(/[^a-z0-9, ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalResourceDesignationLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const key = normalizeDesignationAliasKey(raw);
  if (key === normalizeDesignationAliasKey('Team Lead')) return 'Technical Lead';
  if (key === normalizeDesignationAliasKey('Junior Consultant')) return 'Jr. Consultant';
  if (key === normalizeDesignationAliasKey('Senior Manager, Delivery')) return 'Senior Manager';
  return raw;
}

function getRevenueRateGroup(designation) {
  const key = normalizeDesignationAliasKey(designation);
  if (!key) return null;
  return REVENUE_RATE_GROUPS.find(group => (
    group.aliases.some(alias => normalizeDesignationAliasKey(alias) === key)
  )) || null;
}

function getRevenueRateDesignationKey(designation) {
  return getRevenueRateGroup(designation)?.rateDesignation || '';
}

function getRevenueRateGroupLabel(designation) {
  return getRevenueRateGroup(designation)?.label || canonicalResourceDesignationLabel(designation);
}

function normalizeRevenueRateDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
    )).toISOString().slice(0, 10);
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
      ? iso
      : '';
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function getRevenueRateForDesignation(designation) {
  const rateDesignation = getRevenueRateDesignationKey(designation) || designation;
  const key = normalizeDesignationKey(rateDesignation);
  if (!key) return null;

  return (S.revenueRates || []).find(rate =>
    normalizeDesignationKey(rate.designation) === key,
  ) || null;
}

function getRevenueRateForDesignationAtDate(designation, dateValue) {
  const current = getRevenueRateForDesignation(designation);
  if (!current) return null;

  const dateKey = normalizeRevenueRateDateKey(dateValue);
  const history = Array.isArray(current.history)
    ? current.history
      .filter(version => normalizeRevenueRateDateKey(version?.effective_from))
      .sort((left, right) => (
        normalizeRevenueRateDateKey(left.effective_from)
          .localeCompare(normalizeRevenueRateDateKey(right.effective_from))
      ))
    : [];

  if (!dateKey || !history.length) return current;

  let applicable = null;
  for (const version of history) {
    if (normalizeRevenueRateDateKey(version.effective_from) > dateKey) break;
    applicable = version;
  }

  if (!applicable) applicable = history[0];
  return {
    ...current,
    ...applicable,
    history: current.history,
  };
}

function getRevenueRateDateForAssignment(assignment) {
  const year = Math.trunc(Number(assignment?.year));
  const month = Math.trunc(Number(assignment?.month));
  const week = Math.min(4, Math.max(1, Math.trunc(Number(assignment?.week)) || 1));
  if (!Number.isInteger(year) || year < 1900 || month < 1 || month > 12) return '';

  // Matrix weeks are fixed monthly buckets. Their effective dates are the
  // 1st, 8th, 15th and 22nd of the assignment month.
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(1 + ((week - 1) * 7)).padStart(2, '0')}`;
}

function getRevenueRateForAssignment(designation, assignment) {
  return getRevenueRateForDesignationAtDate(
    designation,
    getRevenueRateDateForAssignment(assignment),
  );
}

function getRevenueRateDateForTimesheetRow(row, fallbackYear = null, fallbackMonth = null) {
  const directDate = normalizeRevenueRateDateKey(
    row?.workDate ?? row?.work_date ?? row?.date ?? row?.Date,
  );
  if (directDate) return directDate;

  const year = Math.trunc(Number(fallbackYear));
  const month = Math.trunc(Number(fallbackMonth));
  if (Number.isInteger(year) && year >= 1900 && month >= 1 && month <= 12) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  }
  return '';
}

function getRevenueRateValueAtDate(designation, field, dateValue) {
  const rate = getRevenueRateForDesignationAtDate(designation, dateValue);
  const value = Number(rate?.[field]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getAverageRevenueRateForFiscalYear(designation, field, fiscalYear) {
  const startYear = Math.trunc(Number(fiscalYear));
  if (!Number.isInteger(startYear)) return null;

  const start = new Date(Date.UTC(startYear, 3, 1));
  const end = new Date(Date.UTC(startYear + 1, 3, 1));
  let totalRate = 0;
  let dayCount = 0;

  for (let cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const rate = getRevenueRateValueAtDate(
      designation,
      field,
      cursor.toISOString().slice(0, 10),
    );
    if (rate === null) continue;
    totalRate += rate;
    dayCount += 1;
  }

  return dayCount ? totalRate / dayCount : null;
}
