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
    { key: 'service', label: 'Intrasourcing' },
    { key: 'preSale', label: 'Local + Pre Sale' },
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
const RESOURCE_INTRASOURCING_REVENUE_CATEGORIES = Object.freeze([
  'intrasourcing',
]);
const RESOURCE_LOCAL_PRESALE_REVENUE_CATEGORIES = Object.freeze([
  'local',
  'preSale',
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

  const intrasourcingHours = hourTotals.intrasourcing;
  const localPreSaleCategoryHours = {
    local: hourTotals.local,
    preSale: hourTotals.preSale,
  };
  const localPreSaleHours = Object.values(localPreSaleCategoryHours).reduce(
    (total, hours) => total + hours,
    0,
  );

  const rate = getRevenueRateForDesignation(employee.designation);
  const intrasourcingRate = Number(rate?.professional_service_rate);
  const localPreSaleRate = Number(rate?.pre_sale_rate);
  const hasRevenueRate = Boolean(rate) &&
    Number.isFinite(intrasourcingRate) &&
    Number.isFinite(localPreSaleRate);

  const localPreSaleCategoryRevenue = Object.fromEntries(
    RESOURCE_LOCAL_PRESALE_REVENUE_CATEGORIES.map(categoryKey => [
      categoryKey,
      hasRevenueRate
        ? localPreSaleCategoryHours[categoryKey] * localPreSaleRate
        : null,
    ]),
  );

  return {
    allocation,
    allocationMeta: {
      percentageTotals,
      fiscalWeekCount,
      total: Object.values(allocation).reduce((sum, value) => sum + value, 0),
    },
    revenue: {
      service: hasRevenueRate ? intrasourcingHours * intrasourcingRate : null,
      preSale: hasRevenueRate
        ? Object.values(localPreSaleCategoryRevenue).reduce(
          (total, amount) => total + amount,
          0,
        )
        : null,
    },
    revenueMeta: {
      service: {
        hours: intrasourcingHours,
        rate: hasRevenueRate ? intrasourcingRate : null,
        categoryHours: { intrasourcing: intrasourcingHours },
        categoryRevenue: {
          intrasourcing: hasRevenueRate
            ? intrasourcingHours * intrasourcingRate
            : null,
        },
      },
      preSale: {
        hours: localPreSaleHours,
        rate: hasRevenueRate ? localPreSaleRate : null,
        categoryHours: localPreSaleCategoryHours,
        categoryRevenue: localPreSaleCategoryRevenue,
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

function getRevenueBreakdownCustomerName(assignment, project) {
  return String(
    assignment.account_name ||
    assignment.assignment_customer_name ||
    project?.account_name ||
    project?.client ||
    project?.name ||
    'Unspecified Customer',
  ).trim() || 'Unspecified Customer';
}

function getRevenueBreakdownProductName(assignment, project) {
  return String(
    assignment.product_name ||
    assignment.assignment_product_name ||
    project?.product_name ||
    getRevenueBreakdownCustomerName(assignment, project) ||
    'Unspecified Product',
  ).trim() || 'Unspecified Product';
}

function getMatrixRevenueBreakdown(employees, revenueKey) {
  const employeeMap = new Map(
    (employees || []).map(employee => [Number(employee.id), employee]),
  );
  const groups = new Map();
  let totalHours = 0;
  let totalRevenue = 0;
  let pricedAssignmentCount = 0;
  let unpricedHours = 0;

  S.assignments.forEach(assignment => {
    const employee = employeeMap.get(Number(assignment.employee_id));
    if (!employee) return;

    const project = S.projects.find(item =>
      Number(item.id) === Number(assignment.project_id),
    ) || {};
    const categoryKey = classifyAllocationProject(
      assignment.project_name || project.name,
    );
    const included = revenueKey === 'service'
      ? RESOURCE_INTRASOURCING_REVENUE_CATEGORIES.includes(categoryKey)
      : RESOURCE_LOCAL_PRESALE_REVENUE_CATEGORIES.includes(categoryKey);
    if (!included) return;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage)) return;

    const hours = RESOURCE_SUMMARY_HOURS_PER_WEEK * (percentage / 100);
    const rateRecord = getRevenueRateForDesignation(employee.designation);
    const intrasourcingRate = Number(rateRecord?.professional_service_rate);
    const localPreSaleRate = Number(rateRecord?.pre_sale_rate);
    const hasRevenueRate = Boolean(rateRecord) &&
      Number.isFinite(intrasourcingRate) &&
      Number.isFinite(localPreSaleRate);
    const hourlyRate = revenueKey === 'service'
      ? intrasourcingRate
      : localPreSaleRate;
    const revenue = hasRevenueRate ? hours * hourlyRate : null;

    const customerName = getRevenueBreakdownCustomerName(assignment, project);
    const productName = getRevenueBreakdownProductName(assignment, project);
    const label = revenueKey === 'service'
      ? customerName
      : categoryKey === 'preSale'
        ? `Pre Sale · ${productName}`
        : `Local · ${customerName}`;
    const groupKey = label.toLocaleLowerCase();

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        label,
        hours: 0,
        revenue: 0,
        unpricedHours: 0,
        assignmentCount: 0,
        resources: new Set(),
      });
    }

    const group = groups.get(groupKey);
    group.hours += hours;
    group.assignmentCount += 1;
    group.resources.add(employee.name);
    totalHours += hours;

    if (revenue === null) {
      group.unpricedHours += hours;
      unpricedHours += hours;
      return;
    }

    group.revenue += revenue;
    totalRevenue += revenue;
    pricedAssignmentCount += 1;
  });

  const rows = [...groups.values()]
    .map(group => ({
      ...group,
      resources: [...group.resources].sort((a, b) => a.localeCompare(b)),
      hasCalculatedRevenue: group.hours > group.unpricedHours,
    }))
    .sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return a.label.localeCompare(b.label);
    });

  return {
    revenueKey,
    labelHeading: revenueKey === 'service'
      ? 'Customer Name'
      : 'Category / Customer or Product',
    rows,
    totalHours,
    totalRevenue: pricedAssignmentCount ? totalRevenue : null,
    pricedAssignmentCount,
    unpricedHours,
    employeeCount: employeeMap.size,
  };
}
