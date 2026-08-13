/* Workforce Allocation Dashboard — dashboard/monthly-planned-work.js */

/* Monthly planned-versus-actual work-mix comparison in percentage or revenue. */
const MONTHLY_PLANNED_WORK_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'trainingDelivery',
    label: 'Training Delivery',
    color: '#2F7D1F',
    textColor: '#FFFFFF',
  }),
  Object.freeze({
    key: 'skillDevelopment',
    label: 'Skill Development',
    color: '#F2A47E',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'serviceDeliveryLocalPs',
    label: 'Service Delivery - Local PS',
    color: '#B7E7A5',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'serviceDeliveryIntrasourcing',
    label: 'Service Delivery - Intrasourcing',
    color: '#E79ADE',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'preSales',
    label: 'Pre - Sales',
    color: '#55C4EE',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'generalAdmin',
    label: 'General Admin',
    color: '#AEB5BD',
    textColor: '#334155',
  }),
]);

/* Chart.js draws the first dataset at the bottom of each stack.
 * Reverse the business order so the visible stack reads top-to-bottom as:
 * Training Delivery, Skill Development, Service Delivery - Local PS,
 * Service Delivery - Intrasourcing, Pre - Sales, General Admin.
 */
const MONTHLY_PLANNED_WORK_STACK_ORDER = Object.freeze(
  MONTHLY_PLANNED_WORK_CATEGORIES.map(category => category.key).reverse(),
);

const MONTHLY_PLANNED_WORK_CATEGORY_BY_KEY = Object.freeze(
  Object.fromEntries(
    MONTHLY_PLANNED_WORK_CATEGORIES.map(category => [category.key, category]),
  ),
);

const MONTHLY_PLANNED_WORK_KEY_BY_LABEL = Object.freeze(
  Object.fromEntries(
    MONTHLY_PLANNED_WORK_CATEGORIES.map(category => [category.label, category.key]),
  ),
);

const MONTHLY_PLANNED_WORK_MODES = Object.freeze({
  percent: Object.freeze({
    key: 'percent',
    label: 'Percent Wise',
  }),
  revenue: Object.freeze({
    key: 'revenue',
    label: 'Revenue Wise',
  }),
});

const MONTHLY_REVENUE_CATEGORY_RATE_FIELDS = Object.freeze({
  trainingDelivery: 'local_rate',
  serviceDeliveryLocalPs: 'local_rate',
  serviceDeliveryIntrasourcing: 'intrasourcing_rate',
  preSales: 'local_rate',
});

const monthlyPlannedWorkAssignmentCache = new Map();
const monthlyPlannedWorkAssignmentRequests = new Map();

function createMonthlyWorkCategoryTotals() {
  return Object.fromEntries(
    MONTHLY_PLANNED_WORK_CATEGORIES.map(category => [category.key, 0]),
  );
}

function createMonthlyWorkSource() {
  return {
    hours: createMonthlyWorkCategoryTotals(),
    shares: createMonthlyWorkCategoryTotals(),
    revenue: createMonthlyWorkCategoryTotals(),
    resourceIds: new Set(),
    resourceNames: new Set(),
    projectIds: new Set(),
    projectNames: new Set(),
    unmatchedRevenueResources: new Set(),
    rowCount: 0,
    totalHours: 0,
    totalFteWeeks: 0,
    totalRevenue: 0,
    revenueEligibleHours: 0,
    pricedRevenueHours: 0,
    unpricedRevenueHours: 0,
  };
}

function getMonthlyPlannedActiveEmployees() {
  if (typeof getActiveEmployees === 'function') {
    return getActiveEmployees();
  }

  return (S.employees || []).filter(employee => employee.active !== 0);
}

function getMonthlyPlannedActiveEmployeeIds() {
  return new Set(
    getMonthlyPlannedActiveEmployees().map(employee => Number(employee.id)),
  );
}


function getMonthlyPlannedWorkView() {
  return ['team', 'individual', 'month'].includes(S.monthlyPlannedWorkView)
    ? S.monthlyPlannedWorkView
    : 'team';
}

function getMonthlyPlannedWorkEmployees() {
  return [...getMonthlyPlannedActiveEmployees()].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }),
  );
}

function getSelectedMonthlyPlannedWorkEmployee() {
  if (getMonthlyPlannedWorkView() !== 'individual') return null;

  const employees = getMonthlyPlannedWorkEmployees();
  const selectedId = Number(S.monthlyPlannedWorkEmployeeId);
  const selected = employees.find(employee => Number(employee.id) === selectedId) || employees[0] || null;

  if (selected && String(S.monthlyPlannedWorkEmployeeId) !== String(selected.id)) {
    S.monthlyPlannedWorkEmployeeId = String(selected.id);
  }

  return selected;
}

function populateMonthlyPlannedWorkResourceFilter() {
  const wrap = document.getElementById('monthlyPlannedWorkResourceFilterWrap');
  const select = document.getElementById('monthlyPlannedWorkResourceFilter');
  if (!wrap || !select) return;

  const isIndividual = getMonthlyPlannedWorkView() === 'individual';
  wrap.hidden = !isIndividual;
  if (!isIndividual) return;

  const employees = getMonthlyPlannedWorkEmployees();
  const selected = getSelectedMonthlyPlannedWorkEmployee();

  select.innerHTML = employees.length
    ? employees.map(employee => {
        const designation = String(employee.designation || '').trim();
        const suffix = designation ? ` · ${designation}` : '';
        return `<option value="${esc(employee.id)}">${esc(`${employee.name}${suffix}`)}</option>`;
      }).join('')
    : '<option value="">No active resources</option>';

  select.value = selected ? String(selected.id) : '';
  select.disabled = employees.length === 0;
}

function monthlyPlannedWorkMonthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function getMonthlyPlannedWorkActualMonthKeys(fiscalYear) {
  const validKeys = new Set(
    fiscalMonths(fiscalYear).map(month => monthlyPlannedWorkMonthKey(month.y, month.m)),
  );
  const actualKeys = new Set();

  for (const row of S.timesheetRows || []) {
    if (typeof isInactiveTimesheetWorker === 'function' && isInactiveTimesheetWorker(row.worker)) {
      continue;
    }

    const parsed = parseMonthlyWorkMonth(
      row.month ?? row.Month ?? row.month_label ?? row.monthLabel,
    );
    if (!parsed) continue;

    const key = monthlyPlannedWorkMonthKey(parsed.year, parsed.month);
    if (validKeys.has(key)) actualKeys.add(key);
  }

  return actualKeys;
}

function getSelectedMonthlyPlannedWorkMonth(fiscalYear = getSelectedMonthlyPlannedWorkFiscalYear()) {
  const months = fiscalMonths(fiscalYear);
  const selectedKey = String(S.monthlyPlannedWorkMonthKey || '').trim();
  const selected = months.find(month => monthlyPlannedWorkMonthKey(month.y, month.m) === selectedKey);
  if (selected) return selected;

  const actualKeys = getMonthlyPlannedWorkActualMonthKeys(fiscalYear);
  const latestActual = [...months].reverse().find(month =>
    actualKeys.has(monthlyPlannedWorkMonthKey(month.y, month.m)),
  );
  const fallback = latestActual || months[0] || null;

  if (fallback) {
    S.monthlyPlannedWorkMonthKey = monthlyPlannedWorkMonthKey(fallback.y, fallback.m);
  }
  return fallback;
}

function populateMonthlyPlannedWorkMonthFilter() {
  const wrap = document.getElementById('monthlyPlannedWorkMonthFilterWrap');
  const select = document.getElementById('monthlyPlannedWorkMonthFilter');
  if (!wrap || !select) return;

  const isMonthView = getMonthlyPlannedWorkView() === 'month';
  wrap.hidden = !isMonthView;
  if (!isMonthView) return;

  const fiscalYear = getSelectedMonthlyPlannedWorkFiscalYear();
  const months = fiscalMonths(fiscalYear);
  const actualKeys = getMonthlyPlannedWorkActualMonthKeys(fiscalYear);
  const selected = getSelectedMonthlyPlannedWorkMonth(fiscalYear);

  select.innerHTML = months.map(month => {
    const key = monthlyPlannedWorkMonthKey(month.y, month.m);
    const suffix = actualKeys.has(key) ? ' · Actual' : '';
    return `<option value="${esc(key)}">${esc(`${month.label}${suffix}`)}</option>`;
  }).join('');

  select.value = selected
    ? monthlyPlannedWorkMonthKey(selected.y, selected.m)
    : '';
  select.disabled = months.length === 0;
}

function updateMonthlyPlannedWorkViewTabs() {
  const view = getMonthlyPlannedWorkView();
  document.querySelectorAll('[data-monthly-work-view]').forEach(button => {
    const isActive = button.dataset.monthlyWorkView === view;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  populateMonthlyPlannedWorkResourceFilter();
  populateMonthlyPlannedWorkMonthFilter();
}

function setMonthlyPlannedWorkView(view) {
  const normalized = ['team', 'individual', 'month'].includes(view) ? view : 'team';
  if (S.monthlyPlannedWorkView === normalized) return;

  S.monthlyPlannedWorkView = normalized;
  if (normalized === 'individual') getSelectedMonthlyPlannedWorkEmployee();
  if (normalized === 'month') getSelectedMonthlyPlannedWorkMonth();
  renderMonthlyPlannedWorkChart();
}

function setMonthlyPlannedWorkResource(value) {
  const employeeId = Number(value);
  S.monthlyPlannedWorkEmployeeId = Number.isFinite(employeeId) && employeeId > 0
    ? String(employeeId)
    : '';
  renderMonthlyPlannedWorkChart();
}

function setMonthlyPlannedWorkMonth(value) {
  S.monthlyPlannedWorkMonthKey = String(value || '').trim();
  renderMonthlyPlannedWorkChart();
}

function normalizeMonthlyWorkPerson(value) {
  if (typeof normalizePersonName === 'function') {
    return normalizePersonName(value);
  }

  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactMonthlyWorkPerson(value) {
  return normalizeMonthlyWorkPerson(value).replace(/\s+/g, '');
}

function createMonthlyWorkEmployeeLookup() {
  const byId = new Map();
  const byName = new Map();
  const byCompactName = new Map();

  getMonthlyPlannedActiveEmployees().forEach(employee => {
    byId.set(Number(employee.id), employee);

    const nameKey = normalizeMonthlyWorkPerson(employee.name);
    const compactKey = compactMonthlyWorkPerson(employee.name);

    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, employee);
    if (compactKey && !byCompactName.has(compactKey)) {
      byCompactName.set(compactKey, employee);
    }
  });

  return { byId, byName, byCompactName };
}

function findMonthlyWorkEmployeeByName(workerName, employeeLookup) {
  const nameKey = normalizeMonthlyWorkPerson(workerName);
  if (nameKey && employeeLookup.byName.has(nameKey)) {
    return employeeLookup.byName.get(nameKey);
  }

  const compactKey = compactMonthlyWorkPerson(workerName);
  return compactKey
    ? employeeLookup.byCompactName.get(compactKey) || null
    : null;
}

function parseMonthlyWorkMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
    };
  }

  const text = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  // ISO / database values: 2026-04, 2026/04, 2026-04-01.
  let match = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? { year, month } : null;
  }

  // Numeric month first: 04/2026 or 04-26.
  match = text.match(/^(\d{1,2})[-/](\d{2}|\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    let year = Number(match[2]);
    if (year < 100) year += 2000;
    return month >= 1 && month <= 12 ? { year, month } : null;
  }

  // Work Summary labels: Apr 26, Apr-26, April 2026.
  match = text.match(/^([A-Za-z]{3,9})\s*[-/]?\s*(\d{2}|\d{4})$/);
  if (!match) return null;

  const month = MN.findIndex(item =>
    item.toLowerCase() === match[1].slice(0, 3).toLowerCase(),
  ) + 1;
  if (!month) return null;

  let year = Number(match[2]);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year += 2000;

  return { year, month };
}

function monthlyPlannedWorkFiscalYearFromMonth(year, month) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isFinite(numericYear) || !Number.isFinite(numericMonth)) return null;
  return numericMonth >= FISCAL_YEAR_START_MONTH ? numericYear : numericYear - 1;
}

function getSelectedMonthlyPlannedWorkFiscalYear() {
  const selected = Math.trunc(Number(S.monthlyPlannedWorkFiscalYear));
  return Number.isFinite(selected) && selected >= 1900 && selected <= 9998
    ? selected
    : S.fiscalYear;
}

function getMonthlyPlannedWorkAssignments(fiscalYear) {
  const normalizedYear = normalizeFiscalYearStart(fiscalYear, S.fiscalYear);

  if (normalizedYear === Number(S.fiscalYear)) return S.assignments || [];
  if (normalizedYear === Number(S.matrixFiscalYear)) return S.matrixAssignments || [];
  if (monthlyPlannedWorkAssignmentCache.has(normalizedYear)) {
    return monthlyPlannedWorkAssignmentCache.get(normalizedYear);
  }

  return null;
}

function ensureMonthlyPlannedWorkAssignments(fiscalYear) {
  const normalizedYear = normalizeFiscalYearStart(fiscalYear, S.fiscalYear);
  const available = getMonthlyPlannedWorkAssignments(normalizedYear);
  if (available !== null) return Promise.resolve(available);

  if (monthlyPlannedWorkAssignmentRequests.has(normalizedYear)) {
    return monthlyPlannedWorkAssignmentRequests.get(normalizedYear);
  }

  const request = api('GET', `/api/assignments?fiscalYear=${normalizedYear}`)
    .then(assignments => {
      const rows = Array.isArray(assignments) ? assignments : [];
      monthlyPlannedWorkAssignmentCache.set(normalizedYear, rows);
      return rows;
    })
    .finally(() => monthlyPlannedWorkAssignmentRequests.delete(normalizedYear));

  monthlyPlannedWorkAssignmentRequests.set(normalizedYear, request);
  return request;
}

function getMonthlyPlannedWorkFiscalYearOptions() {
  const years = new Set([
    Number(S.fiscalYear),
    Number(S.matrixFiscalYear),
    getCurrentFiscalYearStart(),
  ].filter(Number.isFinite));

  for (const cachedYear of monthlyPlannedWorkAssignmentCache.keys()) {
    years.add(Number(cachedYear));
  }

  for (const assignment of [...(S.assignments || []), ...(S.matrixAssignments || [])]) {
    const year = monthlyPlannedWorkFiscalYearFromMonth(assignment.year, assignment.month);
    if (year !== null) years.add(year);
  }

  for (const row of S.timesheetRows || []) {
    const parsed = parseMonthlyWorkMonth(
      row.month ?? row.Month ?? row.month_label ?? row.monthLabel,
    );
    if (!parsed) continue;
    const year = monthlyPlannedWorkFiscalYearFromMonth(parsed.year, parsed.month);
    if (year !== null) years.add(year);
  }

  const finiteYears = [...years].filter(year => Number.isFinite(year));
  const minimum = Math.min(S.fiscalYear, ...finiteYears);
  const maximum = Math.max(
    S.fiscalYear + 10,
    getCurrentFiscalYearStart() + 10,
    Number(S.matrixFiscalYear) + 5,
    ...finiteYears,
  );

  for (let year = minimum; year <= maximum; year++) years.add(year);
  return [...years].sort((a, b) => a - b);
}

function populateMonthlyPlannedWorkFiscalYearFilter() {
  const select = document.getElementById('monthlyPlannedWorkFiscalYearFilter');
  if (!select) return;

  const selected = S.monthlyPlannedWorkFiscalYear === ''
    ? ''
    : String(getSelectedMonthlyPlannedWorkFiscalYear());
  const fiscalYears = getMonthlyPlannedWorkFiscalYearOptions();

  select.innerHTML = '<option value="">All</option>' + fiscalYears.map(year => (
    `<option value="${year}">${esc(fiscalYearDisplayLabel(year))}</option>`
  )).join('');
  select.value = selected;
}

function setMonthlyPlannedWorkFiscalYear(value) {
  const normalizedValue = String(value ?? '').trim();
  S.monthlyPlannedWorkFiscalYear = normalizedValue === ''
    ? ''
    : normalizeFiscalYearStart(normalizedValue, S.fiscalYear);

  populateMonthlyPlannedWorkFiscalYearFilter();
  renderMonthlyPlannedWorkChart();
}

function syncMonthlyPlannedWorkFiscalYearToMatrix() {
  S.monthlyPlannedWorkFiscalYear = normalizeFiscalYearStart(
    S.matrixFiscalYear,
    S.fiscalYear,
  );
  populateMonthlyPlannedWorkFiscalYearFilter();
  renderMonthlyPlannedWorkChart();
}

function classifyMonthlyPlannedWorkType(projectName) {
  if (isUnavailableProjectName(projectName)) return null;

  const normalizedName = String(projectName || '')
    .toLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/\bskill\s+development\b/.test(normalizedName)) {
    return 'skillDevelopment';
  }

  if (/\btraining\s+delivery\b/.test(normalizedName)) {
    return 'trainingDelivery';
  }

  if (/\bintrasourc(?:e|ing)\b/.test(normalizedName)) {
    return 'serviceDeliveryIntrasourcing';
  }

  if (/\bpre\s+sales?\b/.test(normalizedName)) {
    return 'preSales';
  }

  if (/\bgeneral\s+admin\b/.test(normalizedName)) {
    return 'generalAdmin';
  }

  return 'serviceDeliveryLocalPs';
}

function classifyMonthlyActualWorkType(workType) {
  // The Time Sheet already stores the six approved Work Summary labels.
  // Match those labels directly; do not collapse or rename work types.
  const label = String(workType ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return MONTHLY_PLANNED_WORK_KEY_BY_LABEL[label] || null;
}

function getMonthlyRevenueRate(categoryKey, employee, rateDate = '') {
  const field = MONTHLY_REVENUE_CATEGORY_RATE_FIELDS[categoryKey];

  // Skill Development and General Admin are non-revenue.
  if (!field) {
    return {
      eligible: false,
      field: null,
      rate: 0,
      hasRate: true,
    };
  }

  if (!employee) {
    return {
      eligible: true,
      field,
      rate: null,
      hasRate: false,
    };
  }

  const rateRecord = getRevenueRateForDesignationAtDate(employee.designation, rateDate);
  const rate = Number(rateRecord?.[field]);

  return {
    eligible: true,
    field,
    rate: Number.isFinite(rate) && rate >= 0 ? rate : null,
    hasRate: Number.isFinite(rate) && rate >= 0,
  };
}

function addMonthlyWorkRevenue(source, categoryKey, hours, employee, workerName = '', rateDate = '') {
  const rateInfo = getMonthlyRevenueRate(categoryKey, employee, rateDate);
  if (!rateInfo.eligible) return;

  source.revenueEligibleHours += hours;

  if (!rateInfo.hasRate) {
    source.unpricedRevenueHours += hours;
    if (workerName) source.unmatchedRevenueResources.add(String(workerName).trim());
    return;
  }

  source.revenue[categoryKey] += hours * rateInfo.rate;
  source.pricedRevenueHours += hours;
}

function finalizeMonthlyWorkSource(source) {
  source.totalHours = Object.values(source.hours).reduce(
    (total, hours) => total + hours,
    0,
  );
  source.totalFteWeeks = source.totalHours / WORK_HOURS_PER_WEEK;
  source.totalRevenue = Object.values(source.revenue).reduce(
    (total, revenue) => total + revenue,
    0,
  );

  MONTHLY_PLANNED_WORK_CATEGORIES.forEach(category => {
    source.hours[category.key] = +source.hours[category.key].toFixed(2);
    source.shares[category.key] = source.totalHours
      ? +((source.hours[category.key] / source.totalHours) * 100).toFixed(2)
      : 0;
    source.revenue[category.key] = +source.revenue[category.key].toFixed(2);
  });

  source.totalHours = +source.totalHours.toFixed(2);
  source.totalFteWeeks = +source.totalFteWeeks.toFixed(2);
  source.totalRevenue = +source.totalRevenue.toFixed(2);
  source.revenueEligibleHours = +source.revenueEligibleHours.toFixed(2);
  source.pricedRevenueHours = +source.pricedRevenueHours.toFixed(2);
  source.unpricedRevenueHours = +source.unpricedRevenueHours.toFixed(2);
  source.resourceCount = source.resourceIds.size || source.resourceNames.size;
  source.projectCount = source.projectIds.size || source.projectNames.size;
  source.hasData = source.totalHours > 0;
}

function getMonthlyPlannedWorkSeries(fiscalYear, assignments, selectedEmployee = null) {
  const months = fiscalMonths(fiscalYear);
  const monthIndex = new Map(
    months.map((month, index) => [`${month.y}-${month.m}`, index]),
  );
  const employeeLookup = createMonthlyWorkEmployeeLookup();
  const selectedEmployeeId = selectedEmployee ? Number(selectedEmployee.id) : null;
  const activeEmployeeIds = selectedEmployeeId !== null
    ? new Set([selectedEmployeeId])
    : new Set(employeeLookup.byId.keys());

  const rows = months.map(month => ({
    ...month,
    planned: createMonthlyWorkSource(),
    actual: createMonthlyWorkSource(),
  }));

  for (const assignment of getEffectiveFiscalAssignments(fiscalYear, assignments)) {
    const employeeId = Number(assignment.employee_id);
    if (!activeEmployeeIds.has(employeeId)) continue;

    const index = monthIndex.get(
      `${Number(assignment.year)}-${Number(assignment.month)}`,
    );
    if (index === undefined) continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    const categoryKey = classifyMonthlyPlannedWorkType(
      getSummaryAssignmentProjectName(assignment),
    );
    if (!categoryKey) continue;

    const plannedHours = WORK_HOURS_PER_WEEK * (percentage / 100);
    const source = rows[index].planned;
    const employee = employeeLookup.byId.get(employeeId) || null;

    source.hours[categoryKey] += plannedHours;
    source.resourceIds.add(employeeId);
    if (assignment.project_id !== null && assignment.project_id !== undefined) {
      source.projectIds.add(Number(assignment.project_id));
    }
    source.rowCount += 1;

    addMonthlyWorkRevenue(
      source,
      categoryKey,
      plannedHours,
      employee,
      employee?.name || '',
      getRevenueRateDateForAssignment(assignment),
    );
  }

  const actualRows = (S.timesheetRows || []).filter(row => (
    typeof isInactiveTimesheetWorker !== 'function' ||
    !isInactiveTimesheetWorker(row.worker)
  ));

  for (const timesheetRow of actualRows) {
    const parsedMonth = parseMonthlyWorkMonth(
      timesheetRow.month ??
      timesheetRow.Month ??
      timesheetRow.month_label ??
      timesheetRow.monthLabel,
    );
    if (!parsedMonth) continue;

    const index = monthIndex.get(`${parsedMonth.year}-${parsedMonth.month}`);
    if (index === undefined) continue;

    const hours = Number(
      timesheetRow.qty ??
      timesheetRow.hours ??
      timesheetRow.quantity,
    );
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const categoryKey = classifyMonthlyActualWorkType(
      timesheetRow.workType ??
      timesheetRow.work_type ??
      timesheetRow['Work Type'],
    );
    if (!categoryKey) continue;

    const source = rows[index].actual;
    const worker = timesheetRow.worker ?? timesheetRow.employee ?? timesheetRow.resource;
    const projectName = timesheetRow.projectName ?? timesheetRow.project_name ?? timesheetRow.project;

    if (isTimesheetWorkerUnavailableForMonth(
      worker,
      parsedMonth.year,
      parsedMonth.month,
      assignments,
    )) {
      continue;
    }

    const employee = findMonthlyWorkEmployeeByName(worker, employeeLookup);
    if (selectedEmployeeId !== null && Number(employee?.id) !== selectedEmployeeId) {
      continue;
    }

    source.hours[categoryKey] += hours;
    if (worker) source.resourceNames.add(String(worker).trim());
    if (projectName) source.projectNames.add(String(projectName).trim());
    source.rowCount += 1;

    addMonthlyWorkRevenue(
      source,
      categoryKey,
      hours,
      employee,
      worker || '',
      getRevenueRateDateForTimesheetRow(timesheetRow, parsedMonth.year, parsedMonth.month),
    );
  }

  rows.forEach(row => {
    finalizeMonthlyWorkSource(row.planned);
    finalizeMonthlyWorkSource(row.actual);
  });

  return {
    fiscalYear,
    rows,
    totalPlannedHours: +rows.reduce(
      (sum, row) => sum + row.planned.totalHours,
      0,
    ).toFixed(2),
    totalActualHours: +rows.reduce(
      (sum, row) => sum + row.actual.totalHours,
      0,
    ).toFixed(2),
    totalPlannedRevenue: +rows.reduce(
      (sum, row) => sum + row.planned.totalRevenue,
      0,
    ).toFixed(2),
    totalActualRevenue: +rows.reduce(
      (sum, row) => sum + row.actual.totalRevenue,
      0,
    ).toFixed(2),
    plannedUnpricedRevenueHours: +rows.reduce(
      (sum, row) => sum + row.planned.unpricedRevenueHours,
      0,
    ).toFixed(2),
    actualUnpricedRevenueHours: +rows.reduce(
      (sum, row) => sum + row.actual.unpricedRevenueHours,
      0,
    ).toFixed(2),
    actualMonthCount: rows.filter(row => row.actual.hasData).length,
    resourceCount: activeEmployeeIds.size,
    selectedEmployeeId,
    selectedEmployeeName: selectedEmployee?.name || '',
  };
}

function getMonthlyPlannedWorkResourceSeries(fiscalYear, assignments, selectedMonth) {
  const employees = getMonthlyPlannedWorkEmployees();
  const employeeLookup = createMonthlyWorkEmployeeLookup();
  const monthYear = Number(selectedMonth?.y);
  const monthNumber = Number(selectedMonth?.m);
  const monthLabel = selectedMonth?.label || '';

  const rows = employees.map(employee => ({
    label: String(employee.name || `Resource ${employee.id}`),
    designation: String(employee.designation || '').trim(),
    employeeId: Number(employee.id),
    planned: createMonthlyWorkSource(),
    actual: createMonthlyWorkSource(),
  }));
  const rowByEmployeeId = new Map(rows.map(row => [row.employeeId, row]));

  for (const assignment of getEffectiveFiscalAssignments(fiscalYear, assignments)) {
    if (Number(assignment.year) !== monthYear || Number(assignment.month) !== monthNumber) continue;

    const employeeId = Number(assignment.employee_id);
    const row = rowByEmployeeId.get(employeeId);
    if (!row) continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    const categoryKey = classifyMonthlyPlannedWorkType(
      getSummaryAssignmentProjectName(assignment),
    );
    if (!categoryKey) continue;

    const plannedHours = WORK_HOURS_PER_WEEK * (percentage / 100);
    const source = row.planned;
    const employee = employeeLookup.byId.get(employeeId) || null;

    source.hours[categoryKey] += plannedHours;
    source.resourceIds.add(employeeId);
    if (assignment.project_id !== null && assignment.project_id !== undefined) {
      source.projectIds.add(Number(assignment.project_id));
    }
    source.rowCount += 1;

    addMonthlyWorkRevenue(
      source,
      categoryKey,
      plannedHours,
      employee,
      employee?.name || '',
      getRevenueRateDateForAssignment(assignment),
    );
  }

  const actualRows = (S.timesheetRows || []).filter(row => (
    typeof isInactiveTimesheetWorker !== 'function' ||
    !isInactiveTimesheetWorker(row.worker)
  ));

  for (const timesheetRow of actualRows) {
    const parsedMonth = parseMonthlyWorkMonth(
      timesheetRow.month ??
      timesheetRow.Month ??
      timesheetRow.month_label ??
      timesheetRow.monthLabel,
    );
    if (!parsedMonth || parsedMonth.year !== monthYear || parsedMonth.month !== monthNumber) {
      continue;
    }

    const hours = Number(
      timesheetRow.qty ??
      timesheetRow.hours ??
      timesheetRow.quantity,
    );
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const categoryKey = classifyMonthlyActualWorkType(
      timesheetRow.workType ??
      timesheetRow.work_type ??
      timesheetRow['Work Type'],
    );
    if (!categoryKey) continue;

    const worker = timesheetRow.worker ?? timesheetRow.employee ?? timesheetRow.resource;
    if (isTimesheetWorkerUnavailableForMonth(worker, monthYear, monthNumber, assignments)) {
      continue;
    }

    const employee = findMonthlyWorkEmployeeByName(worker, employeeLookup);
    const row = rowByEmployeeId.get(Number(employee?.id));
    if (!row) continue;

    const source = row.actual;
    const projectName = timesheetRow.projectName ?? timesheetRow.project_name ?? timesheetRow.project;
    source.hours[categoryKey] += hours;
    source.resourceIds.add(Number(employee.id));
    if (worker) source.resourceNames.add(String(worker).trim());
    if (projectName) source.projectNames.add(String(projectName).trim());
    source.rowCount += 1;

    addMonthlyWorkRevenue(
      source,
      categoryKey,
      hours,
      employee,
      worker || '',
      getRevenueRateDateForTimesheetRow(timesheetRow, monthYear, monthNumber),
    );
  }

  rows.forEach(row => {
    finalizeMonthlyWorkSource(row.planned);
    finalizeMonthlyWorkSource(row.actual);
  });

  const chartRows = rows;

  return {
    fiscalYear,
    rows: chartRows,
    month: selectedMonth,
    monthLabel,
    totalPlannedHours: +chartRows.reduce((sum, row) => sum + row.planned.totalHours, 0).toFixed(2),
    totalActualHours: +chartRows.reduce((sum, row) => sum + row.actual.totalHours, 0).toFixed(2),
    totalPlannedRevenue: +chartRows.reduce((sum, row) => sum + row.planned.totalRevenue, 0).toFixed(2),
    totalActualRevenue: +chartRows.reduce((sum, row) => sum + row.actual.totalRevenue, 0).toFixed(2),
    plannedUnpricedRevenueHours: +chartRows.reduce((sum, row) => sum + row.planned.unpricedRevenueHours, 0).toFixed(2),
    actualUnpricedRevenueHours: +chartRows.reduce((sum, row) => sum + row.actual.unpricedRevenueHours, 0).toFixed(2),
    actualMonthCount: chartRows.some(row => row.actual.hasData) ? 1 : 0,
    actualResourceCount: chartRows.filter(row => row.actual.hasData).length,
    resourceCount: chartRows.length,
    selectedEmployeeId: null,
    selectedEmployeeName: '',
  };
}

function formatMonthlyPlannedWorkResourceAxisLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length <= 2) return text;
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
}

function formatMonthlyPlannedHours(value) {
  const hours = Number(value) || 0;
  return `${hours.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(hours) ? 0 : 1,
    maximumFractionDigits: 1,
  })}h`;
}

function formatMonthlyPlannedPercent(value) {
  const percentage = Number(value) || 0;
  return `${percentage.toFixed(percentage >= 10 ? 0 : 1)}%`;
}

function formatMonthlyRevenue(value, options = {}) {
  const amount = Number(value) || 0;
  const maximumFractionDigits = options.compact ? 1 : 0;

  if (options.compact) {
    const absoluteAmount = Math.abs(amount);
    if (absoluteAmount >= 1_000_000_000) {
      return `$${(amount / 1_000_000_000).toLocaleString('en-US', {
        maximumFractionDigits,
      })}B`;
    }
    if (absoluteAmount >= 1_000_000) {
      return `$${(amount / 1_000_000).toLocaleString('en-US', {
        maximumFractionDigits,
      })}M`;
    }
    if (absoluteAmount >= 1_000) {
      return `$${(amount / 1_000).toLocaleString('en-US', {
        maximumFractionDigits,
      })}K`;
    }
  }

  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: options.exact ? 2 : 0,
    maximumFractionDigits: options.exact ? 2 : maximumFractionDigits,
  })}`;
}

function getMonthlyPlannedWorkMode() {
  return MONTHLY_PLANNED_WORK_MODES[S.monthlyPlannedWorkMode]
    ? S.monthlyPlannedWorkMode
    : 'percent';
}

function updateMonthlyPlannedWorkTabs() {
  const mode = getMonthlyPlannedWorkMode();

  document.querySelectorAll('[data-monthly-work-mode]').forEach(button => {
    const isActive = button.dataset.monthlyWorkMode === mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });
}

function setMonthlyPlannedWorkMode(mode) {
  if (!MONTHLY_PLANNED_WORK_MODES[mode]) return;
  if (S.monthlyPlannedWorkMode === mode) return;

  S.monthlyPlannedWorkMode = mode;
  renderMonthlyPlannedWorkChart();
}

function isMonthlyWorkTopVisibleSegment(chart, dataset, dataIndex) {
  const visibleSegments = chart.data.datasets.filter((candidate, candidateIndex) => (
    candidate.workSource === dataset.workSource &&
    chart.isDatasetVisible(candidateIndex) &&
    Number(candidate.data[dataIndex]) > 0
  ));

  return visibleSegments.at(-1) === dataset;
}

function drawMonthlyWorkLabelBadge(ctx, text, x, y, options = {}) {
  const align = options.align || 'center';
  const font = options.font || '600 9px Inter, sans-serif';
  const paddingX = 3;
  const paddingY = 2;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + (paddingX * 2);
  const boxHeight = 13;
  let boxX = x - (boxWidth / 2);

  if (align === 'left') boxX = x - paddingX;
  if (align === 'right') boxX = x - boxWidth + paddingX;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillRect(boxX, y - (boxHeight / 2), boxWidth, boxHeight);
  ctx.fillStyle = options.textColor || '#334155';
  ctx.fillText(text, x, y);
  ctx.restore();
}

const monthlyPlannedWorkDataLabelPlugin = {
  id: 'monthlyPlannedWorkDataLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const mode = chart.data.datasets[0]?.chartMode || 'percent';

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((bar, dataIndex) => {
        const value = Number(dataset.data[dataIndex]) || 0;
        if (value <= 0) return;
        if (mode === 'percent' && value < 7) return;

        const properties = bar.getProps(['x', 'y', 'base', 'width'], true);
        const height = Math.abs(properties.base - properties.y);
        const category = MONTHLY_PLANNED_WORK_CATEGORY_BY_KEY[dataset.categoryKey];
        const label = mode === 'revenue'
          ? formatMonthlyRevenue(value, { compact: true })
          : formatMonthlyPlannedPercent(value);
        const centerY = (properties.y + properties.base) / 2;

        if (height >= 18) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '600 10px Inter, sans-serif';
          ctx.fillStyle = category?.textColor || '#334155';
          ctx.fillText(label, properties.x, centerY);
          ctx.restore();
          return;
        }

        // Revenue segments can be financially material even when their visual
        // height is small. Keep their amount visible instead of silently
        // suppressing the label as the percentage view does.
        if (mode !== 'revenue') return;

        if (isMonthlyWorkTopVisibleSegment(chart, dataset, dataIndex)) {
          drawMonthlyWorkLabelBadge(
            ctx,
            label,
            properties.x,
            Math.max(chart.chartArea.top + 8, properties.y - 8),
            { textColor: category?.textColor || '#334155' },
          );
          return;
        }

        const isPlanned = dataset.workSource === 'planned';
        const direction = isPlanned ? -1 : 1;
        const barEdgeX = properties.x + (direction * (properties.width / 2));
        const labelX = barEdgeX + (direction * 5);

        ctx.save();
        ctx.strokeStyle = category?.color || '#94A3B8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barEdgeX, centerY);
        ctx.lineTo(labelX - direction, centerY);
        ctx.stroke();
        ctx.restore();

        drawMonthlyWorkLabelBadge(
          ctx,
          label,
          labelX,
          centerY,
          {
            align: isPlanned ? 'right' : 'left',
            textColor: category?.textColor || '#334155',
          },
        );
      });
    });
  },
};

function updateMonthlyPlannedWorkMeta(series, mode) {
  const meta = document.getElementById('monthlyPlannedWorkMeta');
  if (!meta) return;

  const view = getMonthlyPlannedWorkView();
  const isIndividual = view === 'individual';
  const isMonthView = view === 'month';
  const scopeText = isIndividual && series.selectedEmployeeName
    ? series.selectedEmployeeName
    : isMonthView
      ? `${series.monthLabel || 'Selected month'} · ${series.resourceCount} resources`
      : `${series.resourceCount} active resources`;

  if (mode === 'revenue') {
    const unpricedHours = series.plannedUnpricedRevenueHours +
      series.actualUnpricedRevenueHours;
    const unpricedText = unpricedHours > 0
      ? ` · ${formatMonthlyPlannedHours(unpricedHours)} unpriced`
      : '';

    meta.textContent =
      `FY${series.fiscalYear + 1} · ${scopeText} · ` +
      `${formatMonthlyRevenue(series.totalPlannedRevenue, { compact: true })} planned revenue · ` +
      `${formatMonthlyRevenue(series.totalActualRevenue, { compact: true })} actual revenue` +
      unpricedText;
    return;
  }

  const actualText = isMonthView
    ? (series.actualResourceCount
        ? `${formatMonthlyPlannedHours(series.totalActualHours)} actual · ${series.actualResourceCount} resources with Time Sheet data`
        : 'No matching Time Sheet data')
    : (series.actualMonthCount
        ? `${formatMonthlyPlannedHours(series.totalActualHours)} actual · ${series.actualMonthCount} Time Sheet month${series.actualMonthCount === 1 ? '' : 's'}`
        : 'No matching Time Sheet months');

  meta.textContent =
    `FY${series.fiscalYear + 1} · ${scopeText} · ` +
    `${formatMonthlyPlannedHours(series.totalPlannedHours)} planned · ${actualText}`;
}

function updateMonthlyPlannedWorkNote(mode) {
  const note = document.getElementById('monthlyPlannedWorkNote');
  if (!note) return;

  const view = getMonthlyPlannedWorkView();
  const isIndividual = view === 'individual';
  const isMonthView = view === 'month';

  if (mode === 'revenue') {
    note.textContent = isIndividual
      ? 'For the selected resource, planned revenue comes from Resource Assignment tasks and actual revenue comes from matching Work Summary Time Sheet entries. Service Delivery - Intrasourcing uses the Intrasourcing rate; Service Delivery - Local PS, Pre - Sales and Training Delivery use the shared Local / Pre-Sale / Training rate. Skill Development and General Admin are non-revenue.'
      : isMonthView
        ? 'For the selected month, each resource has a planned bar and an actual bar. Revenue uses the same saved designation rates as the other Planned vs Actual views; Skill Development and General Admin remain non-revenue.'
        : 'Revenue uses each resource’s saved designation rates: Service Delivery - Intrasourcing uses the Intrasourcing rate; Service Delivery - Local PS, Pre - Sales and Training Delivery use the shared Local / Pre-Sale / Training rate. Skill Development and General Admin are non-revenue.';
    return;
  }

  note.textContent = isIndividual
    ? 'Each month compares the selected resource’s planned Resource Assignment tasks with that resource’s actual Work Summary Time Sheet entries. Planned is the left stacked bar and Actual is the right stacked bar, using the same six work types, sequence and colors.'
    : isMonthView
      ? 'The selected month compares every resource side by side. Each resource has a Planned stacked bar on the left and an Actual Time Sheet stacked bar on the right, using the same six work types, sequence and colors.'
      : 'Each month shows the Resource Assignment plan and, when Work Summary Time Sheet data exists for that month, a second execution bar beside it. Both use the same six work types, sequence and colors. Future months continue to show the complete planned bar.';
}

function setMonthlyWorkCategoryVisibility(chart, categoryKey, visible) {
  chart.data.datasets.forEach((dataset, datasetIndex) => {
    if (dataset.categoryKey === categoryKey) {
      chart.setDatasetVisibility(datasetIndex, visible);
    }
  });
}

function getMonthlyChartValue(row, workSource, categoryKey, mode) {
  if (workSource === 'actual' && !row.actual.hasData) return null;

  return mode === 'revenue'
    ? row[workSource].revenue[categoryKey]
    : row[workSource].shares[categoryKey];
}

function getMonthlyPlannedWorkTooltipElement() {
  let tooltip = document.getElementById('monthlyPlannedWorkTooltip');
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.id = 'monthlyPlannedWorkTooltip';
  tooltip.className = 'monthly-planned-work-tooltip';
  tooltip.setAttribute('role', 'status');
  tooltip.setAttribute('aria-live', 'polite');
  document.body.appendChild(tooltip);
  return tooltip;
}

function hideMonthlyPlannedWorkTooltip() {
  const tooltip = document.getElementById('monthlyPlannedWorkTooltip');
  if (tooltip) tooltip.style.opacity = '0';
}

function formatMonthlyWorkTooltipCell(source, categoryKey, mode, hasData = true) {
  if (!hasData) return '—';

  const hours = Number(source.hours[categoryKey]) || 0;
  if (mode === 'revenue') {
    const revenue = Number(source.revenue[categoryKey]) || 0;
    return `${formatMonthlyRevenue(revenue, { exact: true })}<small>${formatMonthlyPlannedHours(hours)}</small>`;
  }

  const share = Number(source.shares[categoryKey]) || 0;
  return `${formatMonthlyPlannedHours(hours)} <small>(${formatMonthlyPlannedPercent(share)})</small>`;
}

function formatMonthlyWorkTooltipTotal(source, mode, hasData = true) {
  if (!hasData) return '—';

  if (mode === 'revenue') {
    return `${formatMonthlyRevenue(source.totalRevenue, { exact: true })}<small>${formatMonthlyPlannedHours(source.totalHours)}</small>`;
  }

  return `${formatMonthlyPlannedHours(source.totalHours)} <small>(${source.totalHours > 0 ? '100%' : '0%'})</small>`;
}

function buildMonthlyPlannedWorkTooltipHtml(row, mode) {
  const categoryRows = MONTHLY_PLANNED_WORK_CATEGORIES.map(category => `
    <tr>
      <th scope="row">
        <span class="monthly-planned-work-tooltip__swatch" style="background:${esc(category.color)}"></span>
        <span>${esc(category.label)}</span>
      </th>
      <td>${formatMonthlyWorkTooltipCell(row.planned, category.key, mode)}</td>
      <td>${formatMonthlyWorkTooltipCell(row.actual, category.key, mode, row.actual.hasData)}</td>
    </tr>
  `).join('');

  const plannedResourceText = `${row.planned.resourceCount} resource${row.planned.resourceCount === 1 ? '' : 's'} · ${row.planned.projectCount} project${row.planned.projectCount === 1 ? '' : 's'}`;
  const actualResourceText = row.actual.hasData
    ? `${row.actual.resourceCount} resource${row.actual.resourceCount === 1 ? '' : 's'} · ${row.actual.projectCount} project${row.actual.projectCount === 1 ? '' : 's'}`
    : 'No matching Time Sheet data';

  return `
    <div class="monthly-planned-work-tooltip__title">${esc(row.label)}</div>
    <table class="monthly-planned-work-tooltip__table">
      <thead>
        <tr>
          <th scope="col">Work type</th>
          <th scope="col">Planned</th>
          <th scope="col">Actual</th>
        </tr>
      </thead>
      <tbody>
        ${categoryRows}
        <tr class="monthly-planned-work-tooltip__total">
          <th scope="row">Total</th>
          <td>${formatMonthlyWorkTooltipTotal(row.planned, mode)}</td>
          <td>${formatMonthlyWorkTooltipTotal(row.actual, mode, row.actual.hasData)}</td>
        </tr>
      </tbody>
    </table>
    <div class="monthly-planned-work-tooltip__meta">
      <span><strong>Planned:</strong> ${esc(plannedResourceText)}</span>
      <span><strong>Actual:</strong> ${esc(actualResourceText)}</span>
    </div>
  `;
}

function renderMonthlyPlannedWorkTooltip(context, series, mode) {
  const { chart, tooltip } = context;
  const element = getMonthlyPlannedWorkTooltipElement();

  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    element.style.opacity = '0';
    return;
  }

  const row = series.rows[tooltip.dataPoints[0].dataIndex];
  if (!row) {
    element.style.opacity = '0';
    return;
  }

  element.innerHTML = buildMonthlyPlannedWorkTooltipHtml(row, mode);
  element.style.opacity = '1';
  element.style.pointerEvents = 'none';

  const canvasRect = chart.canvas.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const viewportPadding = 10;
  let left = canvasRect.left + tooltip.caretX + 14;
  let top = canvasRect.top + tooltip.caretY - (elementRect.height / 2);

  if (left + elementRect.width > window.innerWidth - viewportPadding) {
    left = canvasRect.left + tooltip.caretX - elementRect.width - 14;
  }

  left = Math.max(viewportPadding, Math.min(
    left,
    window.innerWidth - elementRect.width - viewportPadding,
  ));
  top = Math.max(viewportPadding, Math.min(
    top,
    window.innerHeight - elementRect.height - viewportPadding,
  ));

  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

function renderMonthlyPlannedWorkChart() {
  const canvas = document.getElementById('monthlyPlannedWorkChart');
  if (!canvas) return;

  populateMonthlyPlannedWorkFiscalYearFilter();
  updateMonthlyPlannedWorkViewTabs();

  const fiscalYear = getSelectedMonthlyPlannedWorkFiscalYear();
  const view = getMonthlyPlannedWorkView();
  const selectedEmployee = view === 'individual' ? getSelectedMonthlyPlannedWorkEmployee() : null;
  const selectedMonth = view === 'month' ? getSelectedMonthlyPlannedWorkMonth(fiscalYear) : null;
  const assignments = getMonthlyPlannedWorkAssignments(fiscalYear);

  if (assignments === null) {
    if (S.charts.monthlyPlannedWork) {
      S.charts.monthlyPlannedWork.destroy();
      S.charts.monthlyPlannedWork = null;
    }

    const meta = document.getElementById('monthlyPlannedWorkMeta');
    if (meta) meta.textContent = `Loading ${fiscalYearDisplayLabel(fiscalYear)}…`;

    ensureMonthlyPlannedWorkAssignments(fiscalYear)
      .then(() => {
        if (getSelectedMonthlyPlannedWorkFiscalYear() === fiscalYear) {
          renderMonthlyPlannedWorkChart();
        }
      })
      .catch(error => {
        console.error(error);
        toast(`Unable to load ${fiscalYearDisplayLabel(fiscalYear)} assignments`, 'error');
      });
    return;
  }

  hideMonthlyPlannedWorkTooltip();

  if (S.charts.monthlyPlannedWork) {
    S.charts.monthlyPlannedWork.destroy();
    S.charts.monthlyPlannedWork = null;
  }

  const mode = getMonthlyPlannedWorkMode();
  const series = view === 'month'
    ? getMonthlyPlannedWorkResourceSeries(fiscalYear, assignments, selectedMonth)
    : getMonthlyPlannedWorkSeries(fiscalYear, assignments, selectedEmployee);
  updateMonthlyPlannedWorkTabs();
  updateMonthlyPlannedWorkMeta(series, mode);
  updateMonthlyPlannedWorkNote(mode);

  const chartWrap = canvas.closest('.monthly-planned-work-chart');
  if (chartWrap) chartWrap.classList.toggle('is-month-view', view === 'month');

  const datasets = [];

  for (const workSource of ['planned', 'actual']) {
    MONTHLY_PLANNED_WORK_STACK_ORDER.forEach(categoryKey => {
      const category = MONTHLY_PLANNED_WORK_CATEGORY_BY_KEY[categoryKey];
      const isPlanned = workSource === 'planned';

      datasets.push({
        label: `${isPlanned ? 'Planned' : 'Actual'} · ${category.label}`,
        categoryLabel: category.label,
        categoryKey,
        workSource,
        chartMode: mode,
        data: series.rows.map(row =>
          getMonthlyChartValue(row, workSource, categoryKey, mode),
        ),
        rawHours: series.rows.map(row => row[workSource].hours[categoryKey]),
        backgroundColor: category.color,
        hoverBackgroundColor: category.color,
        borderColor: category.color,
        borderWidth: 0,
        borderSkipped: false,
        grouped: true,
        barPercentage: 0.88,
        categoryPercentage: 0.78,
        stack: workSource,
      });
    });
  }

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: series.rows.map(row => view === 'month'
        ? formatMonthlyPlannedWorkResourceAxisLabel(row.label)
        : row.label),
      datasets,
    },
    plugins: [monthlyPlannedWorkDataLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 320 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          onClick(_event, legendItem, legend) {
            const currentChart = legend.chart;
            const categoryKey = legendItem.categoryKey;
            const matchingIndexes = currentChart.data.datasets
              .map((dataset, index) => dataset.categoryKey === categoryKey ? index : -1)
              .filter(index => index >= 0);
            const currentlyVisible = matchingIndexes.some(index =>
              currentChart.isDatasetVisible(index),
            );

            setMonthlyWorkCategoryVisibility(
              currentChart,
              categoryKey,
              !currentlyVisible,
            );
            currentChart.update();
          },
          labels: {
            boxWidth: 11,
            boxHeight: 11,
            padding: 13,
            color: '#334155',
            font: { size: 11 },
            generateLabels(currentChart) {
              return MONTHLY_PLANNED_WORK_CATEGORIES.map(category => {
                const matchingIndexes = currentChart.data.datasets
                  .map((dataset, index) => dataset.categoryKey === category.key ? index : -1)
                  .filter(index => index >= 0);
                const hidden = !matchingIndexes.some(index =>
                  currentChart.isDatasetVisible(index),
                );

                return {
                  text: category.label,
                  fillStyle: category.color,
                  strokeStyle: category.color,
                  lineWidth: 0,
                  hidden,
                  categoryKey: category.key,
                  datasetIndex: matchingIndexes[0],
                };
              });
            },
          },
        },
        tooltip: {
          enabled: false,
          external(context) {
            renderMonthlyPlannedWorkTooltip(context, series, mode);
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: '#475569',
            font: { size: view === 'month' ? 9 : 11 },
            maxRotation: view === 'month' ? 35 : 0,
            minRotation: view === 'month' ? 0 : 0,
            autoSkip: view !== 'month',
          },
        },
        y: mode === 'revenue'
          ? {
              stacked: true,
              beginAtZero: true,
              grid: { color: '#EEF2F7' },
              ticks: {
                color: '#64748B',
                font: { size: 11 },
                callback: value => formatMonthlyRevenue(value, { compact: true }),
              },
              title: {
                display: true,
                text: 'Monthly revenue (USD)',
                color: '#94A3B8',
                font: { size: 11 },
              },
            }
          : {
              stacked: true,
              beginAtZero: true,
              min: 0,
              max: 100,
              grid: { color: '#EEF2F7' },
              ticks: {
                stepSize: 10,
                color: '#64748B',
                font: { size: 11 },
                callback: value => `${value}%`,
              },
              title: {
                display: true,
                text: 'Share of monthly work hours',
                color: '#94A3B8',
                font: { size: 11 },
              },
            },
      },
    },
  });

  chart.$monthlyPlannedWorkMode = mode;
  S.charts.monthlyPlannedWork = chart;
}
