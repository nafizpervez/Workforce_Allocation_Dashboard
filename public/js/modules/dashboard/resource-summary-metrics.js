/* Workforce Allocation Dashboard — dashboard/resource-summary-metrics.js */

/* Allocation classification, fiscal-year utilization and revenue metrics. */
const RESOURCE_SUMMARY_COLUMNS = Object.freeze({
  allocation: Object.freeze([
    Object.freeze({ key: 'intrasourcing', label: 'Intrasourcing' }),
    Object.freeze({ key: 'local', label: 'Local' }),
    Object.freeze({ key: 'preSale', label: 'Pre-Sale' }),
    Object.freeze({ key: 'training', label: 'Training' }),
    Object.freeze({ key: 'generalAdmin', label: 'General Admin' }),
  ]),
  revenue: Object.freeze([
    Object.freeze({ key: 'intrasourcing', label: 'Intrasourcing' }),
    Object.freeze({ key: 'local', label: 'Local' }),
    Object.freeze({ key: 'preSale', label: 'Pre-Sale' }),
    Object.freeze({ key: 'training', label: 'Training' }),
  ]),
});

const RESOURCE_ALLOCATION_RULES = Object.freeze([
  Object.freeze({
    key: 'intrasourcing',
    label: 'Intrasourcing',
    pattern: /intrasource/i,
    description: 'Project name contains “Intrasource”.',
  }),
  Object.freeze({
    key: 'preSale',
    label: 'Pre-Sale',
    pattern: /pre[\s-]*sale/i,
    description: 'Project name contains “Pre-Sale” or “Pre-Sale”.',
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

/* The matrix keeps four separate revenue result columns. Intrasourcing uses
 * its own hourly rate; Local, Pre-Sale and Training share the Local rate. */
const RESOURCE_REVENUE_RATE_FIELDS = Object.freeze({
  intrasourcing: 'intrasourcing_rate',
  local: 'local_rate',
  preSale: 'local_rate',
  training: 'local_rate',
});

const RESOURCE_REVENUE_LABEL_BY_KEY = Object.freeze(
  Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.revenue.map(column => [column.key, column.label]),
  ),
);

function getSummaryAssignmentProjectName(assignment) {
  if (assignment.project_name) return String(assignment.project_name).trim();

  const project = S.projects.find(item =>
    Number(item.id) === Number(assignment.project_id),
  );

  return String(project?.name || '').trim();
}

function normalizeAllocationProjectName(value) {
  return String(value || '')
    .replace(/[‐‑‒–—−_]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyAllocationProject(projectName) {
  const normalizedName = normalizeAllocationProjectName(projectName);
  if (isUnavailableProjectName(normalizedName)) return 'unavailable';

  const matchingRule = RESOURCE_ALLOCATION_RULES.find(rule =>
    rule.pattern.test(normalizedName),
  );

  return matchingRule?.key || 'local';
}

const RESOURCE_SUMMARY_WEEKS_PER_MONTH = 4;

function getResourceSummaryFiscalWeekCount() {
  return fiscalMonths(S.matrixFiscalYear).length * RESOURCE_SUMMARY_WEEKS_PER_MONTH;
}

function createEmptyAllocationTotals() {
  return Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.allocation.map(column => [column.key, 0]),
  );
}

function createEmptyRevenueTotals() {
  return Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.revenue.map(column => [column.key, 0]),
  );
}

function getEmployeeFiscalAssignmentTotals(employeeId) {
  const percentageTotals = createEmptyAllocationTotals();
  const hourTotals = createEmptyAllocationTotals();

  getEffectiveFiscalAssignments(S.matrixFiscalYear, S.matrixAssignments).forEach(assignment => {
    if (Number(assignment.employee_id) !== Number(employeeId)) return;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage)) return;

    const categoryKey = classifyAllocationProject(
      getSummaryAssignmentProjectName(assignment),
    );
    if (!Object.prototype.hasOwnProperty.call(percentageTotals, categoryKey)) return;

    percentageTotals[categoryKey] += percentage;
    hourTotals[categoryKey] += WORK_HOURS_PER_WEEK * (percentage / 100);
  });

  return { percentageTotals, hourTotals };
}

function getRevenueRateValue(rateRecord, revenueKey) {
  const field = RESOURCE_REVENUE_RATE_FIELDS[revenueKey];
  const value = Number(rateRecord?.[field]);

  return Number.isFinite(value) && value >= 0 ? value : null;
}


const MATRIX_PLANNED_REVENUE_KEYS = new Set(['intrasourcing', 'local']);

function getMatrixAssignmentCardRevenue(employee, assignment, unavailableSlots = null) {
  const categoryKey = classifyAllocationProject(
    getSummaryAssignmentProjectName(assignment),
  );

  if (categoryKey !== 'preSale') {
    return getMatrixAssignmentPlannedRevenue(employee, assignment, unavailableSlots);
  }

  if (unavailableSlots && isEmployeeUnavailableForSlot(
    employee.id,
    Number(assignment.year),
    Number(assignment.month),
    Number(assignment.week),
    unavailableSlots,
  )) {
    return {
      eligible: false,
      categoryKey,
      hours: 0,
      rate: null,
      amount: 0,
      hasRate: true,
      basis: 'preSaleProductAmount',
      productName: '',
    };
  }

  const productName = String(
    assignment.product_name || assignment.assignment_product_name || '',
  ).trim();
  const masterProduct = typeof getPreSaleProductByName === 'function'
    ? getPreSaleProductByName(productName)
    : null;
  const directAmountSource = assignment.presale_product_amount;
  const masterAmountSource = masterProduct?.amount;
  const directAmount = directAmountSource === null || directAmountSource === undefined || directAmountSource === ''
    ? null
    : Number(directAmountSource);
  const masterAmount = masterAmountSource === null || masterAmountSource === undefined || masterAmountSource === ''
    ? null
    : Number(masterAmountSource);
  const amount = Number.isFinite(masterAmount)
    ? masterAmount
    : Number.isFinite(directAmount)
      ? directAmount
      : null;

  return {
    eligible: true,
    categoryKey,
    hours: 0,
    rate: null,
    amount,
    hasRate: amount !== null,
    basis: 'preSaleProductAmount',
    productName: masterProduct?.name || productName,
  };
}

function getMatrixAssignmentPlannedRevenue(employee, assignment, unavailableSlots = null) {
  const categoryKey = classifyAllocationProject(
    getSummaryAssignmentProjectName(assignment),
  );

  if (!MATRIX_PLANNED_REVENUE_KEYS.has(categoryKey)) {
    return { eligible: false, categoryKey, hours: 0, rate: 0, amount: 0, hasRate: true };
  }

  if (unavailableSlots && isEmployeeUnavailableForSlot(
    employee.id,
    Number(assignment.year),
    Number(assignment.month),
    Number(assignment.week),
    unavailableSlots,
  )) {
    return { eligible: false, categoryKey, hours: 0, rate: 0, amount: 0, hasRate: true };
  }

  const percentage = Number(assignment.percentage);
  const hours = Number.isFinite(percentage) && percentage > 0
    ? WORK_HOURS_PER_WEEK * (percentage / 100)
    : 0;
  const rateRecord = getRevenueRateForDesignation(employee.designation);
  const rate = getRevenueRateValue(rateRecord, categoryKey);

  return {
    eligible: true,
    categoryKey,
    hours,
    rate,
    amount: rate === null ? null : hours * rate,
    hasRate: rate !== null,
  };
}

function getMatrixWeekPlannedRevenue(employeeRows, month, week, unavailableSlots = null) {
  let amount = 0;
  let unpricedHours = 0;

  for (const employee of employeeRows || []) {
    const key = `${month.y}-${month.m}-${week}`;
    const assignments = S.matrix[employee.id]?.[key] || [];

    for (const assignment of assignments) {
      const revenue = getMatrixAssignmentPlannedRevenue(
        employee,
        assignment,
        unavailableSlots,
      );
      if (!revenue.eligible) continue;
      if (!revenue.hasRate) unpricedHours += revenue.hours;
      else amount += revenue.amount;
    }
  }

  return { amount, unpricedHours };
}

function getMatrixMonthPlannedRevenue(employeeRows, month, unavailableSlots = null) {
  let amount = 0;
  let unpricedHours = 0;

  for (let week = 1; week <= RESOURCE_SUMMARY_WEEKS_PER_MONTH; week += 1) {
    const weeklyRevenue = getMatrixWeekPlannedRevenue(
      employeeRows,
      month,
      week,
      unavailableSlots,
    );
    amount += weeklyRevenue.amount;
    unpricedHours += weeklyRevenue.unpricedHours;
  }

  return { amount, unpricedHours };
}

function getResourceSummaryViewData(employee) {
  const fiscalWeekCount = getEmployeeAvailableFiscalWeekCount(
    employee.id,
    S.matrixFiscalYear,
    S.matrixAssignments,
  );
  const { percentageTotals, hourTotals } = getEmployeeFiscalAssignmentTotals(employee.id);

  const allocation = Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.allocation.map(column => [
      column.key,
      fiscalWeekCount ? percentageTotals[column.key] / fiscalWeekCount : 0,
    ]),
  );

  const rateRecord = getRevenueRateForDesignation(employee.designation);
  const revenue = createEmptyRevenueTotals();
  const revenueMeta = {
    designation: employee.designation || '',
    hasRevenueRateRecord: Boolean(rateRecord),
  };

  RESOURCE_SUMMARY_COLUMNS.revenue.forEach(column => {
    const hours = Number(hourTotals[column.key]) || 0;
    const rate = getRevenueRateValue(rateRecord, column.key);
    const amount = rate === null ? null : hours * rate;

    revenue[column.key] = amount;
    revenueMeta[column.key] = {
      hours,
      rate,
      revenue: amount,
      rateField: RESOURCE_REVENUE_RATE_FIELDS[column.key],
      hasRevenueRate: rate !== null,
    };
  });

  return {
    allocation,
    allocationMeta: {
      percentageTotals,
      fiscalWeekCount,
      total: Object.values(allocation).reduce((sum, value) => sum + value, 0),
    },
    revenue,
    revenueMeta,
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

function formatHourlyRateValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }

  return `${formatExactRevenueValue(value)}/h`;
}

function getRevenueBreakdownCustomerName(assignment, project) {
  return String(
    assignment.account_name ||
    assignment.assignment_customer_name ||
    assignment.customer_name ||
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

function getRevenueBreakdownDetail(revenueKey, assignment, project) {
  if (revenueKey === 'preSale') {
    return getRevenueBreakdownProductName(assignment, project);
  }

  return getRevenueBreakdownCustomerName(assignment, project);
}

function getRevenueBreakdownProjectLabel(assignment, project) {
  const code = String(assignment.project_code || project?.code || '').trim();
  const name = String(assignment.project_name || project?.name || '').trim();

  if (code && name) return `${code} — ${name}`;
  return code || name || 'Unspecified Project';
}

function getMatrixRevenueBreakdown(employees, revenueKey) {
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_REVENUE_RATE_FIELDS, revenueKey)) {
    return null;
  }

  const employeeMap = new Map(
    (employees || []).map(employee => [Number(employee.id), employee]),
  );
  const groups = new Map();
  let totalHours = 0;
  let totalRevenue = 0;
  let pricedAssignmentCount = 0;
  let unpricedHours = 0;

  getEffectiveFiscalAssignments(S.matrixFiscalYear, S.matrixAssignments).forEach(assignment => {
    const employee = employeeMap.get(Number(assignment.employee_id));
    if (!employee) return;

    const project = S.projects.find(item =>
      Number(item.id) === Number(assignment.project_id),
    ) || {};
    const categoryKey = classifyAllocationProject(
      assignment.project_name || project.name,
    );
    if (categoryKey !== revenueKey) return;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) return;

    const hours = WORK_HOURS_PER_WEEK * (percentage / 100);
    const rateRecord = getRevenueRateForDesignation(employee.designation);
    const hourlyRate = getRevenueRateValue(rateRecord, revenueKey);
    const revenue = hourlyRate === null ? null : hours * hourlyRate;
    const projectLabel = getRevenueBreakdownProjectLabel(assignment, project);
    const detail = getRevenueBreakdownDetail(revenueKey, assignment, project);
    const rateKey = hourlyRate === null ? 'unpriced' : hourlyRate.toFixed(6);
    const groupKey = [
      String(project.id || assignment.project_id || projectLabel).toLowerCase(),
      detail.toLowerCase(),
      rateKey,
    ].join('|');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        projectLabel,
        detail,
        hourlyRate,
        hours: 0,
        revenue: 0,
        unpricedHours: 0,
        assignmentCount: 0,
        resources: new Set(),
        designations: new Set(),
      });
    }

    const group = groups.get(groupKey);
    group.hours += hours;
    group.assignmentCount += 1;
    group.resources.add(employee.name);
    if (employee.designation) group.designations.add(employee.designation);
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
      designations: [...group.designations].sort((a, b) => a.localeCompare(b)),
      hasCalculatedRevenue: group.hours > group.unpricedHours,
    }))
    .sort((a, b) => {
      if (a.projectLabel !== b.projectLabel) {
        return a.projectLabel.localeCompare(b.projectLabel);
      }
      if (a.detail !== b.detail) return a.detail.localeCompare(b.detail);
      return (a.hourlyRate ?? Infinity) - (b.hourlyRate ?? Infinity);
    });

  return {
    revenueKey,
    revenueLabel: RESOURCE_REVENUE_LABEL_BY_KEY[revenueKey],
    detailHeading: revenueKey === 'preSale' ? 'Product Name' : 'Customer Name',
    rows,
    totalHours,
    totalRevenue: pricedAssignmentCount ? totalRevenue : null,
    pricedAssignmentCount,
    unpricedHours,
    employeeCount: employeeMap.size,
  };
}
