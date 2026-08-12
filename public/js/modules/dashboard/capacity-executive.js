/* Workforce Allocation Dashboard — dashboard/capacity-executive.js */

const CAPACITY_EXECUTIVE_HOURS_PER_DAY = 8;
const CAPACITY_EXECUTIVE_STANDARD_ORDER = Object.freeze([
  'intrasourcing', 'local', 'training', 'preSale', 'skillDevelopment', 'generalAdmin',
]);
const CAPACITY_EXECUTIVE_LABELS = Object.freeze({
  intrasourcing: 'Intra-Sourcing',
  local: 'Local PS',
  training: 'Training Delivery',
  preSale: 'Presales',
  skillDevelopment: 'Skill Development',
  generalAdmin: 'General Admin',
});
const CAPACITY_EXECUTIVE_COLORS = Object.freeze([
  '#377CB7', '#2A9D8F', '#F2B51D', '#8061A6', '#6EAF45', '#5A9BD5',
  '#EF8354', '#8B5CF6', '#0EA5E9', '#14B8A6', '#EC4899', '#F97316',
]);

function getCapacityPipelineMultiplier() {
  const configured = Number(S.appConfig?.pipelineMultiplier);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}

function getCapacityProbableRealizedThisFY() {
  const configured = Number(S.appConfig?.probableRealizedThisFY);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}

function formatExecutiveCurrency(value) {
  return `USD ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
}

function formatExecutiveTableCurrency(value) {
  const amount = Number(value) || 0;
  return amount < 0
    ? `-USD ${Math.abs(Math.round(amount)).toLocaleString('en-US')}`
    : `USD ${Math.round(amount).toLocaleString('en-US')}`;
}

// Report planning cards (3-6) display monetary values at fixed two-decimal precision.
// Keep this formatter scoped to those cards so other dashboard sections preserve
// their existing currency presentation.
function formatExecutiveReportCurrency(value) {
  const amount = Number(value) || 0;
  const absoluteText = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-USD ${absoluteText}` : `USD ${absoluteText}`;
}

function formatExecutiveReportRate(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return `USD ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatExecutiveDays(value, suffix = 'days') {
  const amount = Number(value) || 0;
  const text = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return suffix ? `${text} ${suffix}` : text;
}

function formatExecutivePercentage(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatExecutiveFte(value, includeSuffix = true) {
  const text = (Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  return includeSuffix ? `${text} FTE` : text;
}

function formatExecutiveRate(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return `USD ${Math.round(amount).toLocaleString('en-US')}`;
}

function capacityExecutiveCardShell({ key, title, eyebrow, subtitle, fiscalYearLabel, body, collapsedValue }) {
  return `
    <section class="capacity-executive-card dc dc-capacity-executive" data-card-key="${esc(key)}" data-card-title="${esc(title)}" aria-label="${esc(title)}">
      <div class="dc-handle" title="Drag card left or right" aria-label="Drag ${esc(title)} card left or right"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg></div>
      <button class="card-collapse-toggle" type="button" aria-expanded="true" title="Minimize ${esc(title)}" aria-label="Minimize ${esc(title)}"><span aria-hidden="true">⌃</span></button>
      <div class="card-collapsed-shell" aria-hidden="true">
        <span class="card-collapsed-shell__title">${esc(title)}</span>
        <span class="card-collapsed-shell__value">${esc(collapsedValue || fiscalYearLabel || 'Expand')}</span>
      </div>
      <div class="card-expandable-content">
        <header class="capacity-executive-card__header">
          <div class="capacity-executive-card__heading">
            ${eyebrow ? `<p class="capacity-executive-card__eyebrow">${esc(eyebrow)}</p>` : ''}
            <h2 class="capacity-executive-card__title">${esc(title)}</h2>
            ${subtitle ? `<p class="capacity-executive-card__subtitle">${esc(subtitle)}</p>` : ''}
          </div>
          ${fiscalYearLabel ? `<span class="capacity-executive-card__fy">${esc(fiscalYearLabel)}</span>` : ''}
        </header>
        ${body}
      </div>
    </section>`;
}

function getCapacityExecutiveActiveTeam() {
  const allActive = (S.employees || []).filter(employee => Number(employee?.active ?? 1) !== 0);
  const assignable = typeof getActiveEmployees === 'function' ? getActiveEmployees() : allActive;
  return { allActive, assignable };
}

function getCapacityResourceGroup(designation) {
  const label = canonicalResourceDesignationLabel(designation);
  return label || 'No Designation';
}


function getCapacityGroupSortIndex(label) {
  const key = normalizeDesignationKey(label);
  const configuredIndex = RESOURCE_DESIGNATIONS.findIndex(item => normalizeDesignationKey(item) === key);
  return configuredIndex < 0 ? 99 : configuredIndex;
}

function getCapacityAvailabilityBasis(employee, fiscalYear, assignments) {
  const months = fiscalMonths(fiscalYear);
  const unavailableMonths = getUnavailableAssignmentMonthSet(assignments);
  const available = months.filter(month => !unavailableMonths.has(availabilityMonthKey(employee.id, month.y, month.m)));
  if (available.length === months.length) return 'Full Year';
  if (!available.length) return 'No availability';

  const indexes = available.map(month => months.findIndex(item => item.y === month.y && item.m === month.m));
  const contiguous = indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
  if (contiguous) {
    const first = available[0];
    const last = available[available.length - 1];
    const range = available.length === 1
      ? `${MN[first.m - 1]} ${String(first.y).slice(-2)}`
      : `${MN[first.m - 1]}–${MN[last.m - 1]} (${available.length} Months)`;
    return range;
  }
  return `${available.length} of 12 Months`;
}

function getCapacityExecutiveWorkdaySummary(fiscalYear, assignments, employees) {
  const rows = (employees || []).map(employee => {
    const adjustment = getAdjustedEmployeeWorkdays(employee.id, employee.workdays, fiscalYear, assignments);
    // Maximum Revenue Capacity displays and calculates from the rates that are
    // currently configured in Resource Revenue for the employee designation.
    // Assignment/timesheet revenue elsewhere still resolves effective-dated
    // history at the actual work date.
    const configuredRate = getRevenueRateForDesignation(employee.designation);
    const localHourlyRateValue = Number(configuredRate?.[RESOURCE_REVENUE_RATE_FIELDS.local]);
    const intrasourcingHourlyRateValue = Number(configuredRate?.[RESOURCE_REVENUE_RATE_FIELDS.intrasourcing]);
    const localHourlyRate = Number.isFinite(localHourlyRateValue) && localHourlyRateValue >= 0
      ? localHourlyRateValue
      : null;
    const intrasourcingHourlyRate = Number.isFinite(intrasourcingHourlyRateValue) && intrasourcingHourlyRateValue >= 0
      ? intrasourcingHourlyRateValue
      : null;
    const localDailyRate = localHourlyRate === null ? 0 : localHourlyRate * CAPACITY_EXECUTIVE_HOURS_PER_DAY;
    const intrasourcingDailyRate = intrasourcingHourlyRate === null ? 0 : intrasourcingHourlyRate * CAPACITY_EXECUTIVE_HOURS_PER_DAY;
    const localCapacity = adjustment.adjustedWorkdays * localDailyRate;
    const intrasourcingCapacity = adjustment.adjustedWorkdays * intrasourcingDailyRate;
    const designation = getCapacityResourceGroup(employee.designation);

    return {
      employee,
      employeeId: Number(employee.id),
      designation,
      resourceGroup: designation,
      availabilityBasis: getCapacityAvailabilityBasis(employee, fiscalYear, assignments),
      adjustedWorkdays: adjustment.adjustedWorkdays,
      localDailyRate,
      intrasourcingDailyRate,
      localCapacity,
      intrasourcingCapacity,
      maximumCapacity: Math.max(localCapacity, intrasourcingCapacity),
    };
  });

  return {
    rows,
    availableCapacityDays: rows.reduce((total, row) => total + row.adjustedWorkdays, 0),
    localRevenueCapacity: rows.reduce((total, row) => total + row.localCapacity, 0),
    intrasourcingRevenueCapacity: rows.reduce((total, row) => total + row.intrasourcingCapacity, 0),
    maximumRevenueCapacity: rows.reduce((total, row) => total + row.maximumCapacity, 0),
  };
}

function getCapacityExecutiveAllocationMix(fiscalYear, employees, workdayRows, matrixTotals) {
  const allocationColumns = matrixTotals?.allocationColumns || getResourceSummaryAllocationColumns();
  const revenueColumns = matrixTotals?.revenueColumns || getResourceSummaryRevenueColumns();
  const revenueColumnByKey = new Map(revenueColumns.map(column => [column.key, column]));
  const workdayByEmployeeId = new Map((workdayRows || []).map(row => [Number(row.employeeId), row]));
  const employeeSummaries = new Map(
    (employees || []).map(employee => [Number(employee.id), getResourceSummaryViewData(employee)]),
  );
  const orderedColumns = [
    ...CAPACITY_EXECUTIVE_STANDARD_ORDER
      .map(key => allocationColumns.find(column => column.key === key))
      .filter(Boolean),
    ...allocationColumns.filter(column => !CAPACITY_EXECUTIVE_STANDARD_ORDER.includes(column.key)),
  ];

  const rows = orderedColumns.map((column, index) => {
    const share = Number(matrixTotals?.allocation?.[column.key]) || 0;
    const plannedRevenueRecord = matrixTotals?.revenue?.[column.key];
    const plannedRevenue = Number(plannedRevenueRecord?.value);
    let allocatedMandays = 0;
    let capacityValue = 0;

    for (const employee of employees || []) {
      const employeeId = Number(employee.id);
      const workday = workdayByEmployeeId.get(employeeId);
      const employeeSummary = employeeSummaries.get(employeeId);
      if (!workday || !employeeSummary) continue;

      const employeeAllocation = Math.max(0, Number(employeeSummary.allocation?.[column.key]) || 0);
      const employeeMandays = workday.adjustedWorkdays * (employeeAllocation / 100);
      const revenueColumn = revenueColumnByKey.get(column.key);
      let dailyRate = Math.max(workday.localDailyRate, workday.intrasourcingDailyRate);

      if (revenueColumn?.rateKey === 'intrasourcing') dailyRate = workday.intrasourcingDailyRate;
      else if (revenueColumn) dailyRate = workday.localDailyRate;

      allocatedMandays += employeeMandays;
      capacityValue += employeeMandays * dailyRate;
    }

    return {
      key: column.key,
      label: CAPACITY_EXECUTIVE_LABELS[column.key] || column.label || column.key,
      points: share,
      share,
      allocatedMandays,
      capacityValue,
      plannedRevenue: Number.isFinite(plannedRevenue) ? plannedRevenue : 0,
      hasCompleteRevenuePricing: plannedRevenueRecord?.value !== null,
      averageDailyRate: allocatedMandays > 0 ? capacityValue / allocatedMandays : 0,
      isNotLocalProject: Boolean(column.isNotLocalProject),
      color: CAPACITY_EXECUTIVE_COLORS[index % CAPACITY_EXECUTIVE_COLORS.length],
    };
  });

  return {
    rows,
    totalAllocationPoints: Number(matrixTotals?.totalAllocation) || 0,
    totalAllocationPercentage: Number(matrixTotals?.totalAllocation) || 0,
    allocatedMandays: rows.reduce((total, row) => total + row.allocatedMandays, 0),
    capacityValue: rows.reduce((total, row) => total + row.capacityValue, 0),
    plannedRevenue: rows.reduce((total, row) => total + row.plannedRevenue, 0),
  };
}

function sumCapacityExecutiveShare(rows, predicate) {
  return (rows || []).reduce((total, row) => predicate(row) ? total + (Number(row.share) || 0) : total, 0);
}

function getCapacityShareMap(allocationRows) {
  const shares = { intrasourcing: 0, local: 0, training: 0, preSale: 0, skillDevelopment: 0, generalAdmin: 0 };
  for (const row of allocationRows || []) {
    const key = row.isNotLocalProject ? 'local' : row.key;
    if (Object.prototype.hasOwnProperty.call(shares, key)) shares[key] += Number(row.share) || 0;
  }
  return shares;
}

function getCapacityCategoryMetrics(allocationRows) {
  const metrics = Object.fromEntries(
    ['intrasourcing', 'local', 'training', 'preSale', 'skillDevelopment', 'generalAdmin']
      .map(key => [key, { share: 0, allocatedMandays: 0, capacityValue: 0, plannedRevenue: 0 }]),
  );

  for (const row of allocationRows || []) {
    const key = row.isNotLocalProject ? 'local' : row.key;
    if (!metrics[key]) continue;
    metrics[key].share += Number(row.share) || 0;
    metrics[key].allocatedMandays += Number(row.allocatedMandays) || 0;
    metrics[key].capacityValue += Number(row.capacityValue) || 0;
    metrics[key].plannedRevenue += Number(row.plannedRevenue) || 0;
  }

  return metrics;
}

function getCapacityProjectAmount(project) {
  for (const field of ['product_amount', 'opp_amount', 'budget']) {
    const value = Number(project?.[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function getCapacityProjectFiscalYearEnd(project) {
  const fromPeriod = typeof getFiscalYearFromFiscalPeriod === 'function'
    ? getFiscalYearFromFiscalPeriod(project?.fiscal_period)
    : null;
  if (fromPeriod) return Number(fromPeriod);
  const dateValue = project?.end_date || project?.project_closing_date;
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  return date.getMonth() + 1 >= FISCAL_YEAR_START_MONTH ? year + 1 : year;
}

function classifyCapacityProject(project) {
  if (Number(project?.not_local_project) === 1) return 'local';
  const text = [project?.name, project?.product_name, project?.product_family].filter(Boolean).join(' ');
  const key = classifyAllocationProject(text);
  return key === 'unavailable' ? 'local' : key;
}

function isCapacityRevenueRealizationProject(project, fiscalYear) {
  // Keep this qualification exactly aligned with the Revenue Realization KPI:
  // Product Name must be a PS System Support / PS Project Implementation
  // variation, Project Closing Date must fall inside the selected Matrix FY,
  // and Progress must be exactly 100%. Stage is intentionally not required.
  const compactProductName = String(project?.product_name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const isPsProduct = compactProductName.includes('PSSYSTEMSUPPORT') || [
    'PSPROJECTIMPLEMENTATION',
    'PSPROJECTIMPLEMENT',
    'PSPROJECTIMPLEMETATION',
    'PSPROJECTIMPLEMENTAION',
  ].some(variant => compactProductName.includes(variant));
  if (!isPsProduct || Number(project?.progress) !== 100) return false;

  const closingDate = typeof parseDateInputLocal === 'function'
    ? parseDateInputLocal(project?.project_closing_date)
    : null;
  if (!closingDate || Number.isNaN(closingDate.getTime())) return false;

  const selectedFiscalYear = normalizeFiscalYearStart(fiscalYear);
  const closingFiscalYear = (closingDate.getMonth() + 1) >= FISCAL_YEAR_START_MONTH
    ? closingDate.getFullYear()
    : closingDate.getFullYear() - 1;
  return closingFiscalYear === selectedFiscalYear;
}

function getCapacityRevenueRealizationByCategory(fiscalYear) {
  const byCategory = Object.fromEntries(
    ['intrasourcing', 'local', 'training', 'preSale', 'skillDevelopment', 'generalAdmin']
      .map(key => [key, 0]),
  );

  for (const project of S.projects || []) {
    if (!isCapacityRevenueRealizationProject(project, fiscalYear)) continue;
    // Revenue Realization KPI uses Product Amount specifically; do not fall
    // back to opportunity/budget amounts here or the two views can diverge.
    const amount = Number(project?.product_amount) || 0;
    if (amount <= 0) continue;
    const key = classifyCapacityProject(project);
    byCategory[key] = (Number(byCategory[key]) || 0) + amount;
  }

  return byCategory;
}

function getCapacityProjectFinancials(fiscalYear) {
  const fiscalYearEnd = getFiscalYearEnd(fiscalYear);
  const byCategory = Object.fromEntries(
    ['intrasourcing', 'local', 'training', 'preSale', 'skillDevelopment', 'generalAdmin'].map(key => [key, { realized: 0, pipeline: 0 }]),
  );
  const thresholds = S.preSaleProductThresholds || { securedMinPercent: 90, bestCaseMinPercent: 70 };
  const buckets = { secured: 0, bestCase: 0, prospect: 0 };
  let totalRealized = 0;
  let activePipeline = 0;

  for (const project of S.projects || []) {
    if (getCapacityProjectFiscalYearEnd(project) !== fiscalYearEnd) continue;
    const amount = getCapacityProjectAmount(project);
    if (amount <= 0) continue;
    const stage = String(project.stage || '').trim();
    const key = classifyCapacityProject(project);
    const record = byCategory[key] || byCategory.local;

    if (stage === 'Closed Won') {
      record.realized += amount;
      totalRealized += amount;
      continue;
    }
    if (stage === 'Closed Lost') continue;

    record.pipeline += amount;
    activePipeline += amount;
    const probability = Number(project.probability) || 0;
    if (probability >= Number(thresholds.securedMinPercent || 90) || stage === 'Negotiate') buckets.secured += amount;
    else if (probability >= Number(thresholds.bestCaseMinPercent || 70) || ['Proposal', 'Presentation - Solve'].includes(stage)) buckets.bestCase += amount;
    else buckets.prospect += amount;
  }

  return { byCategory, buckets, totalRealized, activePipeline };
}

function getCapacityPreSaleProductPipelineSummary() {
  const thresholds = S.preSaleProductThresholds || {};
  const securedMinPercent = Number(thresholds.securedMinPercent);
  const bestCaseMinPercent = Number(thresholds.bestCaseMinPercent);
  const securedThreshold = Number.isFinite(securedMinPercent) ? securedMinPercent : 90;
  const bestCaseThreshold = Number.isFinite(bestCaseMinPercent) ? bestCaseMinPercent : 70;
  const buckets = { secured: 0, bestCase: 0, prospect: 0 };
  let totalAmount = 0;

  for (const product of (typeof getActivePreSaleProducts === 'function' ? getActivePreSaleProducts() : (S.preSaleProducts || []))) {
    const amount = Number(product?.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const percent = Number(product?.percent);
    const confidence = Number.isFinite(percent) ? percent : 0;
    totalAmount += amount;

    if (confidence >= securedThreshold) buckets.secured += amount;
    else if (confidence >= bestCaseThreshold) buckets.bestCase += amount;
    else buckets.prospect += amount;
  }

  return {
    bestCaseMinPercent: bestCaseThreshold,
    buckets,
    securedMinPercent: securedThreshold,
    totalAmount,
  };
}

function getCapacityAvailableSummaryRows(workdayRows) {
  const clusters = new Map();
  for (const row of workdayRows) {
    const designation = String(row.designation || row.resourceGroup || 'No Designation').trim() || 'No Designation';
    const key = `${normalizeDesignationKey(designation)}|${row.availabilityBasis}`;
    if (!clusters.has(key)) clusters.set(key, {
      group: designation,
      displayGroup: designation,
      basis: row.availabilityBasis,
      fte: 0,
      days: 0,
      localCapacity: 0,
      intraCapacity: 0,
      maxCapacity: 0,
      localRateWeighted: 0,
      intraRateWeighted: 0,
    });
    const target = clusters.get(key);
    target.fte += 1;
    target.days += row.adjustedWorkdays;
    target.localCapacity += row.localCapacity;
    target.intraCapacity += row.intrasourcingCapacity;
    target.maxCapacity += row.maximumCapacity;
    target.localRateWeighted += row.localDailyRate * row.adjustedWorkdays;
    target.intraRateWeighted += row.intrasourcingDailyRate * row.adjustedWorkdays;
  }

  return [...clusters.values()]
    .map(row => ({
      ...row,
      avgLocalDailyRate: row.days > 0 ? row.localRateWeighted / row.days : 0,
      avgIntraDailyRate: row.days > 0 ? row.intraRateWeighted / row.days : 0,
    }))
    .sort((a, b) => (
      getCapacityGroupSortIndex(a.group) - getCapacityGroupSortIndex(b.group)
      || a.group.localeCompare(b.group, undefined, { sensitivity: 'base' })
      || a.basis.localeCompare(b.basis)
    ));
}

function getCapacityRevenueGroupRows(workdayRows, defaultAnnualWorkdays) {
  const groups = new Map();
  for (const row of workdayRows) {
    const designation = String(row.designation || row.resourceGroup || 'No Designation').trim() || 'No Designation';
    const key = normalizeDesignationKey(designation) || 'no designation';
    if (!groups.has(key)) groups.set(key, {
      group: designation,
      days: 0,
      intrasourcingCapacity: 0,
      localCapacity: 0,
      maximumCapacity: 0,
    });
    const target = groups.get(key);
    target.days += row.adjustedWorkdays;
    target.intrasourcingCapacity += row.intrasourcingCapacity;
    target.localCapacity += row.localCapacity;
    target.maximumCapacity += row.maximumCapacity;
  }
  const totalMaximumCapacity = [...groups.values()].reduce((sum, row) => sum + row.maximumCapacity, 0);
  return [...groups.values()]
    .map(row => ({
      ...row,
      fte: defaultAnnualWorkdays > 0 ? row.days / defaultAnnualWorkdays : 0,
      contribution: totalMaximumCapacity > 0 ? (row.maximumCapacity / totalMaximumCapacity) * 100 : 0,
    }))
    .sort((a, b) => getCapacityGroupSortIndex(a.group) - getCapacityGroupSortIndex(b.group)
      || a.group.localeCompare(b.group, undefined, { sensitivity: 'base' }));
}

function getCapacityExecutiveSummary() {
  const fiscalYear = Number(S.matrixFiscalYear);
  const assignments = Array.isArray(S.matrixAssignments) ? S.matrixAssignments : [];
  const { allActive, assignable } = getCapacityExecutiveActiveTeam();
  const matrixEmployees = typeof getFilteredMatrixEmployees === 'function'
    ? getFilteredMatrixEmployees()
    : assignable;
  const months = fiscalMonths(fiscalYear);
  const matrixTotals = getMatrixTotalsViewData(matrixEmployees, months);
  const workdays = getCapacityExecutiveWorkdaySummary(fiscalYear, assignments, matrixEmployees);
  const allocationMix = getCapacityExecutiveAllocationMix(
    fiscalYear,
    matrixEmployees,
    workdays.rows,
    matrixTotals,
  );
  const committedTargets = typeof getCommittedTargetSummary === 'function'
    ? getCommittedTargetSummary()
    : { intrasourcing: 0, local: 0, localPipeline: 0, total: 0 };
  const defaultAnnualWorkdays = Number(getDefaultAnnualWorkdays()) || 0;
  const equivalentCapacity = defaultAnnualWorkdays > 0
    ? workdays.availableCapacityDays / defaultAnnualWorkdays
    : 0;
  const shares = getCapacityShareMap(allocationMix.rows);
  const categoryMetrics = getCapacityCategoryMetrics(allocationMix.rows);

  // Executive Matrix classifications intentionally exclude every project-specific
  // Not Local allocation column. Other capacity-planning cards retain their
  // existing treatment of those project columns.
  const executiveAllocationRows = allocationMix.rows.filter(row => !row.isNotLocalProject);
  const executiveShares = getCapacityShareMap(executiveAllocationRows);
  const executiveCategoryMetrics = getCapacityCategoryMetrics(executiveAllocationRows);

  const projects = getCapacityProjectFinancials(fiscalYear);
  const preSalePipeline = getCapacityPreSaleProductPipelineSummary();
  const availableRows = getCapacityAvailableSummaryRows(workdays.rows);
  const revenueGroupRows = getCapacityRevenueGroupRows(workdays.rows, defaultAnnualWorkdays);

  const getCategoryFte = keys => {
    const mandays = keys.reduce((total, key) => total + (Number(executiveCategoryMetrics[key]?.allocatedMandays) || 0), 0);
    return defaultAnnualWorkdays > 0 ? mandays / defaultAnnualWorkdays : 0;
  };

  return {
    fiscalYear,
    fiscalYearLabel: fiscalYearDisplayLabel(fiscalYear),
    fiscalYearRange: fiscalYearRangeLabel(fiscalYear),
    allActiveCount: allActive.length,
    assignableCount: matrixEmployees.length,
    excludedActiveCount: Math.max(0, allActive.length - matrixEmployees.length),
    matrixEmployees,
    matrixTotals,
    defaultAnnualWorkdays,
    equivalentCapacity,
    committedTarget: Number(committedTargets.total) || 0,
    committedTargets,
    shares,
    categoryMetrics,
    projects,
    preSalePipeline,
    availableRows,
    revenueGroupRows,
    ...workdays,
    allocationMix,
    executiveMetrics: {
      revenueGeneratingShare: executiveShares.intrasourcing + executiveShares.local + executiveShares.training,
      revenueGeneratingFte: getCategoryFte(['intrasourcing', 'local', 'training']),
      revenueEnablingShare: executiveShares.preSale,
      revenueEnablingFte: getCategoryFte(['preSale']),
      investmentOverheadShare: executiveShares.skillDevelopment + executiveShares.generalAdmin,
      investmentOverheadFte: getCategoryFte(['skillDevelopment', 'generalAdmin']),
    },
  };
}

function getExecutiveMatrixRows(summary) {
  const metrics = summary.executiveMetrics || {};
  const maximumRevenueGeneratingCapacity = Number(summary.localRevenueCapacity) || 0;
  const revenueTarget = Number(summary.committedTarget) || 0;
  const preSalePipeline = typeof getPreSalePipelineKpiSummary === 'function'
    ? getPreSalePipelineKpiSummary()
    : { weightedAmount: 0 };
  const weightedPipeline = Number(preSalePipeline?.weightedAmount) || 0;
  const capacityCoverageRatio = revenueTarget > 0
    ? maximumRevenueGeneratingCapacity / revenueTarget
    : null;
  // The business rule names the denominator "Realized Target". The dashboard has
  // no separate persisted Realized Target field, so the Revenue Target / Committed
  // Target shown in Capacity Allocation is the target being covered here.
  const pipelineCoverage = revenueTarget > 0
    ? (weightedPipeline / revenueTarget) * 100
    : null;
  const ratioText = Number.isFinite(capacityCoverageRatio)
    ? `${capacityCoverageRatio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
    : '—';
  const pipelineCoverageText = Number.isFinite(pipelineCoverage)
    ? formatExecutivePercentage(pipelineCoverage)
    : '—';

  return [
    {
      metric: 'Revenue Generating Allocation',
      metricDetail: '(Intra-Sourcing, Local PS and Training Delivery)',
      value: formatExecutivePercentage(metrics.revenueGeneratingShare),
      fte: formatExecutiveFte(metrics.revenueGeneratingFte),
      headline: true,
    },
    {
      metric: 'Revenue Enabling Allocation',
      metricDetail: '(Pre-Sales)',
      value: formatExecutivePercentage(metrics.revenueEnablingShare),
      fte: formatExecutiveFte(metrics.revenueEnablingFte),
      headline: true,
    },
    {
      metric: 'Investment & Overhead Allocation',
      metricDetail: '(Skill Development and General Admin)',
      value: formatExecutivePercentage(metrics.investmentOverheadShare),
      fte: formatExecutiveFte(metrics.investmentOverheadFte),
      headline: true,
    },
    {
      metric: 'Total Team Capacity',
      value: formatExecutiveDays(summary.availableCapacityDays, 'days'),
      fte: summary.assignableCount.toLocaleString('en-US'),
      headline: false,
    },
    {
      metric: 'Maximum Revenue Generating Capacity',
      value: formatExecutiveReportCurrency(maximumRevenueGeneratingCapacity),
      fte: '—',
      headline: false,
    },
    {
      metric: 'Revenue Target',
      value: formatExecutiveReportCurrency(revenueTarget),
      fte: '—',
      headline: false,
    },
    {
      metric: 'Capacity Coverage Ratio',
      value: ratioText,
      fte: '—',
      headline: false,
    },
    {
      metric: 'Pipeline Coverage',
      value: pipelineCoverageText,
      fte: '—',
      headline: false,
    },
  ];
}

function renderExecutiveMetricsTableCard(summary) {
  const rows = getExecutiveMatrixRows(summary);
  const body = `
    <div class="capacity-executive-table-wrap">
      <table class="capacity-executive-table capacity-executive-table--executive-matrix">
        <colgroup><col style="width:56%"><col style="width:25%"><col style="width:19%"></colgroup>
        <thead><tr><th>Metric</th><th>Value</th><th>FTE</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr class="${row.headline ? 'capacity-executive-table__row--headline' : ''}">
            <td class="capacity-executive-table__metric"><span class="capacity-executive-table__metric-main">${esc(row.metric)}</span>${row.metricDetail ? ` <span class="capacity-executive-table__metric-detail">${esc(row.metricDetail)}</span>` : ''}</td>
            <td class="capacity-executive-table__value">${esc(row.value)}</td>
            <td class="capacity-executive-table__fte">${esc(row.fte)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  return capacityExecutiveCardShell({
    key: 'executive-metrics', title: '1. Executive Matrix', eyebrow: 'Leadership view',
    subtitle: 'Allocation, capacity, target and coverage metrics for the selected Matrix fiscal year.',
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: summary.fiscalYearLabel, body,
  });
}

function renderCapacityExecutiveFinancialStrip(summary) {
  const items = [
    [formatExecutiveDays(summary.availableCapacityDays), 'Available capacity'],
    [formatExecutiveCurrency(summary.committedTarget), 'Committed target'],
  ];
  return `<div class="capacity-financial-strip capacity-financial-strip--two">${items.map(item => `
    <div class="capacity-financial-metric"><div class="capacity-financial-metric__value">${esc(item[0])}</div><div class="capacity-financial-metric__label">${esc(item[1])}</div></div>`).join('')}</div>`;
}

function getCapacityAllocationFinancialRows(summary) {
  // Reuse the exact Target / Realized / Backlog logic from 5. Capacity Value Allocation
  // so both cards always reconcile to the same business calculation.
  const valueRows = getCapacityValueRows(summary).billable || [];
  const intraRow = valueRows.find(row => row.key === 'intrasourcing') || {};
  const localRow = valueRows.find(row => row.key === 'local') || {};
  const pipelineSummary = typeof getPreSalePipelineKpiSummary === 'function'
    ? getPreSalePipelineKpiSummary()
    : { weightedAmount: 0 };
  const weightedPipelineLocal = Number(pipelineSummary?.weightedAmount) || 0;
  const localBacklog = Number(localRow.backlog) || 0;

  return [
    {
      metric: 'Maximum Revenue Capacity',
      local: Number(summary.localRevenueCapacity) || 0,
      intra: Number(summary.intrasourcingRevenueCapacity) || 0,
    },
    {
      metric: 'Committed Target',
      local: Number(localRow.target) || 0,
      intra: Number(intraRow.target) || 0,
    },
    {
      metric: 'Revenue Realized',
      local: Number(localRow.realized) || 0,
      intra: Number(intraRow.realized) || 0,
    },
    {
      metric: 'Revenue Backlog',
      local: localBacklog,
      intra: Number(intraRow.backlog) || 0,
    },
    {
      metric: 'Weighted Pipeline',
      local: weightedPipelineLocal,
      intra: null,
    },
    {
      metric: 'Pipeline Gap',
      local: localBacklog - weightedPipelineLocal,
      intra: null,
    },
  ];
}

function renderCapacityAllocationFinancialTable(summary) {
  const rows = getCapacityAllocationFinancialRows(summary);
  const renderValue = value => value === null || value === undefined
    ? '—'
    : esc(formatExecutiveReportCurrency(value));
  return `
    <div class="capacity-allocation-financial-table-wrap">
      <table class="capacity-executive-table capacity-executive-table--dense capacity-allocation-financial-table">
        <colgroup><col style="width:46%"><col style="width:27%"><col style="width:27%"></colgroup>
        <thead><tr><th>Metric</th><th>Local</th><th>Intra-Sourcing</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.metric)}</td><td class="capacity-executive-table__value">${renderValue(row.local)}</td><td class="capacity-executive-table__value">${renderValue(row.intra)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderCapacityExecutiveLegend(summary) {
  return summary.allocationMix.rows.map(row => `
    <div class="capacity-allocation-legend__item" title="${esc(`${row.label}: ${row.share.toFixed(1)}% matrix average allocation; ${formatExecutiveTableCurrency(row.capacityValue)} annualized capacity value`)}">
      <span class="capacity-allocation-legend__swatch" style="background:${esc(row.color)}"></span>
      <span class="capacity-allocation-legend__label">${esc(row.label)}</span>
      <span class="capacity-allocation-legend__value">${esc(formatExecutivePercentage(row.share))}</span>
    </div>`).join('');
}

function renderCapacityAllocationExecutiveCard(summary) {
  const body = `
    ${renderCapacityExecutiveFinancialStrip(summary)}
    <div class="capacity-allocation-visual">
      <div class="capacity-allocation-chart-column">
        <div class="capacity-allocation-chart-wrap"><canvas id="capacityAllocationExecutiveChart" aria-label="${esc(`${summary.fiscalYearLabel} Resource Assignment Matrix allocation by work type`)}"></canvas></div>
        <div class="capacity-allocation-chart-caption">Matrix allocation ${esc(summary.fiscalYearLabel)}</div>
      </div>
      <div class="capacity-allocation-legend nice-scroll">${renderCapacityExecutiveLegend(summary)}</div>
    </div>
    ${renderCapacityAllocationFinancialTable(summary)}`;
  return capacityExecutiveCardShell({
    key: 'capacity-allocation', title: 'Capacity Allocation', eyebrow: 'Annual capacity',
    subtitle: 'Allocation percentages exactly match the Resource Assignment Matrix total/average row.',
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: formatExecutivePercentage(summary.allocationMix.totalAllocationPercentage), body,
  });
}

function renderAvailableCapacitySummaryCard(summary) {
  const rows = summary.availableRows;
  const body = `
    <div class="capacity-executive-table-wrap capacity-executive-table-wrap--compact">
      <table class="capacity-executive-table capacity-executive-table--compact">
        <colgroup><col style="width:31%"><col style="width:13%"><col style="width:33%"><col style="width:23%"></colgroup>
        <thead><tr><th>Designation</th><th>FTE</th><th>Availability Basis</th><th>Available Working Days</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.displayGroup)}</td><td class="capacity-executive-table__value">${row.fte.toLocaleString()}</td><td class="capacity-executive-table__center">${esc(row.basis)}</td><td class="capacity-executive-table__value">${esc(formatExecutiveDays(row.days, ''))}</td></tr>`).join('')}
          <tr class="capacity-executive-table__total"><td>Total Available Capacity</td><td class="capacity-executive-table__value">${summary.assignableCount.toLocaleString()}</td><td></td><td class="capacity-executive-table__value">${esc(formatExecutiveDays(summary.availableCapacityDays))}</td></tr>
        </tbody>
      </table>
    </div>`;
  return capacityExecutiveCardShell({
    key: 'available-capacity-summary', title: '2. Available Capacity Summary', eyebrow: 'Resource availability',
    subtitle: 'Visible matrix resources grouped by their configured designation and fiscal-year availability.',
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: formatExecutiveDays(summary.availableCapacityDays), body,
  });
}

function renderMaximumRevenueCapacityCard(summary) {
  const detailRows = summary.availableRows;
  const groupRows = summary.revenueGroupRows;
  const body = `
    <div class="capacity-card-scroll nice-scroll">
      <div class="capacity-subtable-title">Resource category capacity</div>
      <div class="capacity-executive-table-scroll">
        <table class="capacity-executive-table capacity-executive-table--dense capacity-executive-table--wide">
          <thead><tr><th>Resource Category</th><th>FTE</th><th>Available Days</th><th>Rate/Day Intra</th><th>Rate/Day Local</th><th>Maximum Revenue Capacity Intra-Sourcing</th><th>Maximum Revenue Capacity Local</th></tr></thead>
          <tbody>
            ${detailRows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.displayGroup)}</td><td class="capacity-executive-table__value">${row.fte}</td><td class="capacity-executive-table__value">${esc(formatExecutiveDays(row.days, ''))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportRate(row.avgIntraDailyRate))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportRate(row.avgLocalDailyRate))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.intraCapacity))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.localCapacity))}</td></tr>`).join('')}
            <tr class="capacity-executive-table__total"><td>Annual Revenue Capacity</td><td>${summary.assignableCount}</td><td>${esc(formatExecutiveDays(summary.availableCapacityDays, ''))}</td><td></td><td></td><td>${esc(formatExecutiveReportCurrency(summary.intrasourcingRevenueCapacity))}</td><td>${esc(formatExecutiveReportCurrency(summary.localRevenueCapacity))}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="capacity-subtable-title">Revenue Capacity by Resource Group</div>
      <div class="capacity-executive-table-scroll">
        <table class="capacity-executive-table capacity-executive-table--dense capacity-executive-table--wide capacity-revenue-group-table">
          <colgroup><col style="width:25%"><col style="width:10%"><col style="width:24%"><col style="width:24%"><col style="width:17%"></colgroup>
          <thead><tr><th>Resource Group</th><th>FTE</th><th>Revenue Capacity Intra-Sourcing</th><th>Revenue Capacity Local</th><th>Contribution</th></tr></thead>
          <tbody>
            ${groupRows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.group)}</td><td class="capacity-executive-table__value">${esc(formatExecutiveFte(row.fte, false))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.intrasourcingCapacity))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.localCapacity))}</td><td class="capacity-executive-table__value">${esc(formatExecutivePercentage(row.contribution))}</td></tr>`).join('')}
            <tr class="capacity-executive-table__total"><td>Total Annual Revenue Capacity</td><td>${esc(formatExecutiveFte(summary.equivalentCapacity, false))}</td><td>${esc(formatExecutiveReportCurrency(summary.intrasourcingRevenueCapacity))}</td><td>${esc(formatExecutiveReportCurrency(summary.localRevenueCapacity))}</td><td>100%</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  return capacityExecutiveCardShell({
    key: 'maximum-revenue-capacity', title: '3. Maximum Revenue Capacity', eyebrow: 'Commercial capacity',
    subtitle: 'Available working days multiplied separately by the configured Intra-Sourcing and Local daily rates.',
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: formatExecutiveReportCurrency(summary.maximumRevenueCapacity), body,
  });
}

function getCapacityAverageDailyRate(summary, key) {
  const metric = summary.categoryMetrics?.[key];
  if (Number(metric?.allocatedMandays) > 0 && Number(metric?.capacityValue) > 0) {
    return Number(metric.capacityValue) / Number(metric.allocatedMandays);
  }
  if (summary.availableCapacityDays <= 0) return 0;
  if (key === 'intrasourcing') return summary.intrasourcingRevenueCapacity / summary.availableCapacityDays;
  return summary.localRevenueCapacity / summary.availableCapacityDays;
}

function renderRevenueTargetsCard(summary) {
  const trainingMetric = summary.categoryMetrics.training || {};
  const rows = [
    { label: 'Intra-Sourcing', target: summary.committedTargets.intrasourcing, rate: getCapacityAverageDailyRate(summary, 'intrasourcing'), explicit: true },
    { label: 'Local Professional Services', target: summary.committedTargets.local, rate: getCapacityAverageDailyRate(summary, 'local'), explicit: true },
    { label: 'Training Delivery', target: Number(trainingMetric.capacityValue) || 0, rate: getCapacityAverageDailyRate(summary, 'training'), explicit: false },
  ].map(row => {
    const manDays = row.rate > 0 ? row.target / row.rate : 0;
    return { ...row, manDays, fte: summary.defaultAnnualWorkdays > 0 ? manDays / summary.defaultAnnualWorkdays : 0 };
  });
  const totalTarget = rows.filter(row => row.explicit).reduce((sum, row) => sum + row.target, 0);
  const totalDays = rows.reduce((sum, row) => sum + row.manDays, 0);
  const totalFte = rows.reduce((sum, row) => sum + row.fte, 0);
  const body = `
    <div class="capacity-card-scroll nice-scroll">
      <table class="capacity-executive-table capacity-executive-table--dense">
        <thead><tr><th>Revenue Stream</th><th>Target</th><th>Avg. Rate/Day</th><th>Man Days</th><th>FTE</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.label)}</td><td class="capacity-executive-table__value">${row.explicit ? esc(formatExecutiveReportCurrency(row.target)) : `<span class="capacity-opportunity-label">Matrix capacity opportunity</span><small>${esc(formatExecutiveReportCurrency(row.target))}</small>`}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportRate(row.rate))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveDays(row.manDays, ''))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveFte(row.fte, false))}</td></tr>`).join('')}
          <tr class="capacity-executive-table__total"><td>Total Revenue Target</td><td>${esc(formatExecutiveReportCurrency(totalTarget))}</td><td></td><td>${esc(formatExecutiveDays(totalDays, ''))}</td><td>${esc(formatExecutiveFte(totalFte, false))}</td></tr>
        </tbody>
      </table>
      <p class="capacity-table-footnote">Rates are allocation-weighted from the same designations and effective-dated rates used by the Resource Assignment Matrix. Training Delivery is shown as its matrix-derived capacity opportunity.</p>
    </div>`;
  return capacityExecutiveCardShell({
    key: 'revenue-targets', title: '4. Revenue Targets', eyebrow: 'Target conversion',
    subtitle: 'Saved targets converted to mandays and FTE using allocation-weighted matrix rates.',
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: formatExecutiveReportCurrency(totalTarget), body,
  });
}

function getCapacityValueRows(summary) {
  const projectData = summary.projects.byCategory;
  const revenueRealizationByCategory = getCapacityRevenueRealizationByCategory(summary.fiscalYear);
  const targetByKey = {
    intrasourcing: Number(summary.committedTargets.intrasourcing) || 0,
    local: Number(summary.committedTargets.local) || 0,
    training: 0,
  };
  const billable = [
    ['intrasourcing', 'Intra-Sourcing'], ['local', 'Local PS'], ['training', 'Training Delivery'],
  ].map(([key, label]) => {
    const metric = summary.categoryMetrics[key] || {};
    const share = Number(metric.share) || 0;
    const capacityValue = Number(metric.capacityValue) || 0;
    const target = targetByKey[key];
    // Realized revenue must use the exact Revenue Realization KPI rule,
    // not the broader Closed Won revenue bucket used by project financials.
    const realized = Number(revenueRealizationByCategory[key]) || 0;
    const backlog = target - realized;
    const goal = target > 0 ? target : capacityValue;
    return {
      key,
      label,
      share,
      fte: summary.defaultAnnualWorkdays > 0 ? (Number(metric.allocatedMandays) || 0) / summary.defaultAnnualWorkdays : 0,
      capacityValue,
      target,
      realized,
      backlog,
      remaining: goal - realized - backlog,
    };
  });
  const functionRows = [
    ['preSale', 'Presales'], ['skillDevelopment', 'Skill Development'], ['generalAdmin', 'General Administration'],
  ].map(([key, label]) => {
    const metric = summary.categoryMetrics[key] || {};
    const share = Number(metric.share) || 0;
    const opportunity = Number(metric.capacityValue) || 0;
    const isPreSale = key === 'preSale';
    const target = isPreSale ? Number(summary.committedTarget) || 0 : 0;
    const pipeline = isPreSale ? Number(summary.projects.activePipeline) || 0 : Number(projectData[key]?.pipeline) || 0;
    const multiplier = isPreSale ? getCapacityPipelineMultiplier() : null;
    const required = target > 0 && multiplier ? target * multiplier : opportunity;
    return {
      key,
      label,
      share,
      fte: summary.defaultAnnualWorkdays > 0 ? (Number(metric.allocatedMandays) || 0) / summary.defaultAnnualWorkdays : 0,
      opportunity,
      target,
      multiplier,
      pipeline,
      remaining: required - pipeline,
    };
  });
  return { billable, functionRows };
}

function renderCapacityValueAllocationCard(summary) {
  const rows = getCapacityValueRows(summary);
  const body = `
    <div class="capacity-card-scroll nice-scroll">
      <p class="capacity-table-intro">Resource Assignment Matrix allocation percentages are applied to each visible resource’s available workdays and applicable effective-dated rate. Total annualized allocated capacity value: <strong>${esc(formatExecutiveReportCurrency(summary.allocationMix.capacityValue))}</strong>.</p>
      <div class="capacity-executive-table-scroll">
        <table class="capacity-executive-table capacity-executive-table--dense capacity-executive-table--wide">
          <thead><tr><th>Billable Utilization</th><th>Capacity %</th><th>FTE</th><th>Capacity Value</th><th>Target</th><th>Realized</th><th>Backlog</th><th>Remaining</th></tr></thead>
          <tbody>${rows.billable.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.label)}</td><td class="capacity-executive-table__value">${esc(formatExecutivePercentage(row.share))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveFte(row.fte, false))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.capacityValue))}</td><td class="capacity-executive-table__value">${row.target > 0 ? esc(formatExecutiveReportCurrency(row.target)) : '—'}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.realized))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.backlog))}</td><td class="capacity-executive-table__value ${row.remaining < 0 ? 'capacity-value-negative' : ''}">${esc(formatExecutiveReportCurrency(row.remaining))}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="capacity-executive-table-scroll capacity-function-table">
        <table class="capacity-executive-table capacity-executive-table--dense capacity-executive-table--wide">
          <thead><tr><th>Function</th><th>Capacity %</th><th>FTE</th><th>Opportunity Value</th><th>Target</th><th>Multiplier</th><th>Pipeline</th><th>Remaining</th></tr></thead>
          <tbody>
            ${rows.functionRows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row.label)}</td><td class="capacity-executive-table__value">${esc(formatExecutivePercentage(row.share))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveFte(row.fte, false))}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.opportunity))}</td><td class="capacity-executive-table__value">${row.target > 0 ? esc(formatExecutiveReportCurrency(row.target)) : '—'}</td><td class="capacity-executive-table__value">${row.multiplier ? row.multiplier.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td><td class="capacity-executive-table__value">${esc(formatExecutiveReportCurrency(row.pipeline))}</td><td class="capacity-executive-table__value ${row.remaining < 0 ? 'capacity-value-negative' : ''}">${esc(formatExecutiveReportCurrency(row.remaining))}</td></tr>`).join('')}
            <tr class="capacity-executive-table__total"><td>Total</td><td>${esc(formatExecutivePercentage(summary.allocationMix.totalAllocationPercentage))}</td><td>${esc(formatExecutiveFte(summary.defaultAnnualWorkdays > 0 ? summary.allocationMix.allocatedMandays / summary.defaultAnnualWorkdays : 0, false))}</td><td>${esc(formatExecutiveReportCurrency(summary.allocationMix.capacityValue))}</td><td></td><td></td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  return capacityExecutiveCardShell({
    key: 'capacity-value-allocation', title: '5. Capacity Value Allocation', eyebrow: 'Value distribution',
    subtitle: 'Capacity value, targets, realized revenue and current pipeline by work classification.',
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: formatExecutiveReportCurrency(summary.allocationMix.capacityValue), body,
  });
}

function renderPipelineTargetSummaryCard(summary) {
  const localPipelineTarget = Number(summary.committedTargets.localPipeline) || 0;
  const pipelineMultiplier = getCapacityPipelineMultiplier();
  const baseRequirement = localPipelineTarget * pipelineMultiplier;
  const probableRealizedThisFY = getCapacityProbableRealizedThisFY();
  const localTargetNextFY = baseRequirement + probableRealizedThisFY;
  const activePipeline = Number(summary.preSalePipeline.totalAmount) || 0;
  const bucketRows = [
    ['Secured', `≥ ${formatExecutivePercentage(summary.preSalePipeline.securedMinPercent)}`, summary.preSalePipeline.buckets.secured],
    ['Best Case', `≥ ${formatExecutivePercentage(summary.preSalePipeline.bestCaseMinPercent)}`, summary.preSalePipeline.buckets.bestCase],
    ['Prospect', `< ${formatExecutivePercentage(summary.preSalePipeline.bestCaseMinPercent)}`, summary.preSalePipeline.buckets.prospect],
  ];
  const rows = [
    ['Local Pipeline Target', formatExecutiveReportCurrency(localPipelineTarget)],
    ['Pipeline Multiplier', pipelineMultiplier.toLocaleString('en-US', { maximumFractionDigits: 2 })],
    ['Base Pipeline Requirement', formatExecutiveReportCurrency(baseRequirement)],
    ['Probable Realized This FY', formatExecutiveReportCurrency(probableRealizedThisFY)],
    ['Local Target Next FY', formatExecutiveReportCurrency(localTargetNextFY)],
    ['Already Working With', formatExecutiveReportCurrency(activePipeline)],
  ];
  const body = `
    <div class="capacity-card-scroll nice-scroll">
      <table class="capacity-executive-table capacity-executive-table--dense capacity-pipeline-summary-table">
        <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
        <thead><tr><th>Planning Metric</th><th>Value</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td class="capacity-executive-table__metric">${esc(row[0])}</td><td class="capacity-executive-table__value">${esc(row[1])}</td></tr>`).join('')}
          ${bucketRows.map(row => {
            const value = `${row[1]} · ${formatExecutiveReportCurrency(row[2])}`;
            return `<tr><td class="capacity-executive-table__metric">${esc(row[0])}</td><td class="capacity-executive-table__value">${esc(value)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="capacity-pipeline-gap ${activePipeline >= localTargetNextFY && localTargetNextFY > 0 ? 'is-positive' : ''}">
        <span>Pipeline gap</span>
        <strong>${esc(formatExecutiveReportCurrency(localTargetNextFY - activePipeline))}</strong>
      </div>
    </div>`;
  return capacityExecutiveCardShell({
    key: 'pipeline-target-summary', title: '6. Pipeline Target Summary', eyebrow: 'Forward planning',
    subtitle: `Pipeline target coverage using saved Local Pipeline Target, config.js planning values and Pre-Sale Product confidence thresholds (Secured ≥ ${summary.preSalePipeline.securedMinPercent}%, Best Case ≥ ${summary.preSalePipeline.bestCaseMinPercent}%).`,
    fiscalYearLabel: summary.fiscalYearLabel, collapsedValue: formatExecutiveReportCurrency(activePipeline), body,
  });
}

function getCapacityExecutiveChartRows(summary) {
  // Show only allocation categories that exist in the Resource Assignment Matrix.
  // Unallocated capacity remains an empty arc in the ring rather than a data slice,
  // so it cannot appear in the legend or tooltip.
  return summary.allocationMix.rows.filter(row => row.share > 0);
}

function getCapacityExecutiveChartPixelRatio() {
  // Chart.js normally follows window.devicePixelRatio. On standard 1x desktop
  // displays that leaves the doughnut backed by roughly the same number of
  // pixels as its CSS size, which can look soft once labels and curved edges
  // are anti-aliased. Keep this single report chart on a denser backing store
  // while capping the ratio to avoid unnecessary GPU/memory cost.
  const browserRatio = Number(window.devicePixelRatio) || 1;
  return Math.min(4, Math.max(3, browserRatio));
}

function renderCapacityExecutiveChart(summary) {
  const canvas = document.getElementById('capacityAllocationExecutiveChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (S.charts?.capacityAllocationExecutive) S.charts.capacityAllocationExecutive.destroy();

  const rows = getCapacityExecutiveChartRows(summary);
  const matrixAllocation = Number(summary.allocationMix.totalAllocationPercentage) || 0;
  const hasAllocation = matrixAllocation > 0;
  const centerTextPlugin = {
    id: 'capacityExecutiveCenterText',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const point = meta?.data?.[0];
      if (!point) return;
      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#173A67'; ctx.font = '700 30px Inter, sans-serif'; ctx.fillText(formatExecutivePercentage(matrixAllocation), point.x, point.y - 7);
      ctx.fillStyle = '#64748B'; ctx.font = '500 12px Inter, sans-serif'; ctx.fillText('Matrix allocation', point.x, point.y + 21);
      meta.data.forEach((arc, index) => {
        const row = rows[index];
        const share = Number(row?.share) || 0;
        if (row?.isRemainder || share < 3) return;
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const radius = arc.innerRadius + ((arc.outerRadius - arc.innerRadius) * 0.58);
        const x = arc.x + Math.cos(angle) * radius;
        const y = arc.y + Math.sin(angle) * radius;
        ctx.fillStyle = '#FFFFFF'; ctx.font = '700 11px Inter, sans-serif'; ctx.fillText(formatExecutivePercentage(share), x, y);
      });
      ctx.restore();
    },
  };
  S.charts ||= {};
  S.charts.capacityAllocationExecutive = new Chart(canvas, {
    type: 'doughnut',
    data: { labels: rows.map(row => row.label), datasets: [{ data: rows.map(row => row.share), backgroundColor: rows.map(row => row.color), borderColor: '#FFFFFF', borderWidth: 2, hoverOffset: 5 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Force a high-density backing canvas so the in-app doughnut, its curved
      // edges and all canvas-rendered text remain crisp at normal browser zoom.
      devicePixelRatio: getCapacityExecutiveChartPixelRatio(),
      cutout: '56%',
      circumference: 360,
      rotation: 0,
      layout: { padding: 8 },
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label(context) { return `${context.label}: ${formatExecutivePercentage(context.raw)}`; } } },
      },
    },
    plugins: [centerTextPlugin],
  });
}

function renderCapacityExecutiveCards() {
  const summaryRoot = document.getElementById('capacityExecutiveCards');
  const planningRoot = document.getElementById('capacityPlanningCards');
  if (!summaryRoot || !planningRoot) return;

  const summary = getCapacityExecutiveSummary();
  summaryRoot.innerHTML = [
    renderCapacityAllocationExecutiveCard(summary),
    renderExecutiveMetricsTableCard(summary),
    renderAvailableCapacitySummaryCard(summary),
  ].join('');
  planningRoot.innerHTML = [
    renderMaximumRevenueCapacityCard(summary),
    renderRevenueTargetsCard(summary),
    renderCapacityValueAllocationCard(summary),
    renderPipelineTargetSummaryCard(summary),
  ].join('');
  renderCapacityExecutiveChart(summary);
  if (typeof initCardDrag === 'function') initCardDrag();
}
