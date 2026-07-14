/* Workforce Allocation Dashboard — dashboard/resource-summary.js */

/* Allocation classification, fiscal-year utilization and revenue metrics. */
const RESOURCE_SUMMARY_COLUMNS = {
  allocation: [
    { key: 'intrasourcing', label: 'Intrasourcing' },
    { key: 'local', label: 'Local' },
    { key: 'preSale', label: 'Pre Sale' },
    { key: 'training', label: 'Training' },
    { key: 'generalAdmin', label: 'General Admin' },
  ],
  revenue: [
    { key: 'service', label: 'Service' },
    { key: 'preSale', label: 'Pre Sale' },
  ],
};

const RESOURCE_ALLOCATION_RULES = Object.freeze([
  Object.freeze({
    key: 'intrasourcing',
    label: 'Intrasourcing',
    pattern: /intrasource/i,
    description: 'Project name contains “Intrasource”.',
  }),
  Object.freeze({
    key: 'preSale',
    label: 'Pre Sale',
    pattern: /pre[\s-]*sale/i,
    description: 'Project name contains “Pre Sale” or “Pre-Sale”.',
  }),
  Object.freeze({
    key: 'training',
    label: 'Training',
    pattern: /training[\s-]*delivery/i,
    description: 'Project name contains “Training Delivery” or “Training-Delivery”.',
  }),
  Object.freeze({
    key: 'generalAdmin',
    label: 'General Admin',
    pattern: /general[\s-]*admin/i,
    description: 'Project name contains “General Admin” or “General-Admin”.',
  }),
]);

const RESOURCE_ALLOCATION_RULE_BY_KEY = Object.freeze(
  Object.fromEntries(RESOURCE_ALLOCATION_RULES.map(rule => [rule.key, rule])),
);

function getSummaryAssignmentProjectName(assignment) {
  if (assignment.project_name) return String(assignment.project_name).trim();

  const project = S.projects.find(item =>
    Number(item.id) === Number(assignment.project_id),
  );

  return String(project?.name || '').trim();
}

/*
 * Category matching is case-insensitive and searches the complete project name.
 * The flexible separators allow both spaces and hyphens, including repeated
 * combinations such as "Pre - Sale" after normalization.
 */
function normalizeAllocationProjectName(value) {
  return String(value || '')
    .replace(/[‐‑‒–—−_]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyAllocationProject(projectName) {
  const normalizedName = normalizeAllocationProjectName(projectName);
  const matchingRule = RESOURCE_ALLOCATION_RULES.find(rule =>
    rule.pattern.test(normalizedName),
  );

  return matchingRule?.key || 'local';
}

/*
 * The matrix stores four assignment slots for each of the twelve fiscal-year
 * months. A category's FY allocation is its sum of weekly percentages divided
 * by all 48 FY slots, including empty weeks. Therefore, 100% allocation for
 * 24 weeks contributes 50% to the annual allocation summary.
 */
const RESOURCE_SUMMARY_WEEKS_PER_MONTH = 4;
const RESOURCE_SUMMARY_HOURS_PER_WEEK = 40;
const RESOURCE_SERVICE_CATEGORIES = Object.freeze([
  'intrasourcing',
  'local',
  'training',
]);

function getResourceSummaryFiscalWeekCount() {
  return fiscalMonths(S.fiscalYear).length * RESOURCE_SUMMARY_WEEKS_PER_MONTH;
}

function createEmptyAllocationTotals() {
  return Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.allocation.map(column => [column.key, 0]),
  );
}

function getEmployeeFiscalAssignmentTotals(employeeId) {
  const percentageTotals = createEmptyAllocationTotals();
  const hourTotals = createEmptyAllocationTotals();

  S.assignments.forEach(assignment => {
    if (Number(assignment.employee_id) !== Number(employeeId)) return;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage)) return;

    const categoryKey = classifyAllocationProject(
      getSummaryAssignmentProjectName(assignment),
    );
    const hours = RESOURCE_SUMMARY_HOURS_PER_WEEK * (percentage / 100);

    percentageTotals[categoryKey] += percentage;
    hourTotals[categoryKey] += hours;
  });

  return { percentageTotals, hourTotals };
}

function getResourceSummaryViewData(employee) {
  const fiscalWeekCount = getResourceSummaryFiscalWeekCount();
  const { percentageTotals, hourTotals } = getEmployeeFiscalAssignmentTotals(employee.id);
  const allocation = Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.allocation.map(column => [
      column.key,
      fiscalWeekCount ? percentageTotals[column.key] / fiscalWeekCount : 0,
    ]),
  );

  const serviceCategoryHours = Object.fromEntries(
    RESOURCE_SERVICE_CATEGORIES.map(categoryKey => [
      categoryKey,
      hourTotals[categoryKey],
    ]),
  );
  const serviceHours = Object.values(serviceCategoryHours).reduce(
    (total, hours) => total + hours,
    0,
  );
  const preSaleHours = hourTotals.preSale;
  const rate = getRevenueRateForDesignation(employee.designation);
  const professionalServiceRate = Number(rate?.professional_service_rate);
  const preSaleRate = Number(rate?.pre_sale_rate);
  const hasRevenueRate = Boolean(rate) &&
    Number.isFinite(professionalServiceRate) &&
    Number.isFinite(preSaleRate);

  /*
   * Service revenue is intentionally calculated category by category so the
   * matrix value is the explicit sum of Intrasourcing, Local and Training
   * Delivery revenue. All three categories use the Professional Service rate.
   */
  const serviceCategoryRevenue = Object.fromEntries(
    RESOURCE_SERVICE_CATEGORIES.map(categoryKey => [
      categoryKey,
      hasRevenueRate
        ? serviceCategoryHours[categoryKey] * professionalServiceRate
        : null,
    ]),
  );
  const serviceRevenue = hasRevenueRate
    ? Object.values(serviceCategoryRevenue).reduce(
      (total, amount) => total + amount,
      0,
    )
    : null;

  return {
    allocation,
    allocationMeta: {
      percentageTotals,
      fiscalWeekCount,
      total: Object.values(allocation).reduce((sum, value) => sum + value, 0),
    },
    revenue: {
      service: serviceRevenue,
      preSale: hasRevenueRate ? preSaleHours * preSaleRate : null,
    },
    revenueMeta: {
      service: {
        hours: serviceHours,
        rate: hasRevenueRate ? professionalServiceRate : null,
        categoryHours: serviceCategoryHours,
        categoryRevenue: serviceCategoryRevenue,
      },
      preSale: {
        hours: preSaleHours,
        rate: hasRevenueRate ? preSaleRate : null,
      },
      designation: employee.designation || '',
      hasRevenueRate,
    },
  };
}

function formatAllocationViewValue(value) {
  return value === null || value === undefined
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function formatRevenueViewValue(value) {
  if (value === null || value === undefined) return '—';

  const amount = Number(value);
  const absoluteAmount = Math.abs(amount);

  if (absoluteAmount >= 1_000_000) {
    return `$${(amount / 1_000_000).toLocaleString('en-US', {
      maximumFractionDigits: 1,
    })}M`;
  }

  if (absoluteAmount >= 1_000) {
    return `$${(amount / 1_000).toLocaleString('en-US', {
      maximumFractionDigits: 1,
    })}K`;
  }

  return `$${amount.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
}

function formatExactRevenueValue(value) {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
