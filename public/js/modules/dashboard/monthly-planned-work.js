/* Workforce Allocation Dashboard — dashboard/monthly-planned-work.js */

/* Monthly planned-versus-actual work-mix comparison in percentage or revenue. */
const MONTHLY_PLANNED_WORK_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'trainingDelivery',
    label: 'Training Delivery',
    color: '#449328',
    textColor: '#FFFFFF',
  }),
  Object.freeze({
    key: 'skillDevelopment',
    label: 'Skill Development',
    color: '#F6C6AD',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'serviceDeliveryLocalPs',
    label: 'Service Delivery - Local PS',
    color: '#D9F2D0',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'serviceDeliveryIntrasourcing',
    label: 'Service Delivery - Intrasourcing',
    color: '#F2CFEE',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'preSales',
    label: 'Pre - Sales',
    color: '#96DCF8',
    textColor: '#334155',
  }),
  Object.freeze({
    key: 'generalAdmin',
    label: 'General Admin',
    color: '#D1D1D1',
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

function getMonthlyRevenueRate(categoryKey, employee) {
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

  const rateRecord = getRevenueRateForDesignation(employee.designation);
  const rate = Number(rateRecord?.[field]);

  return {
    eligible: true,
    field,
    rate: Number.isFinite(rate) && rate >= 0 ? rate : null,
    hasRate: Number.isFinite(rate) && rate >= 0,
  };
}

function addMonthlyWorkRevenue(source, categoryKey, hours, employee, workerName = '') {
  const rateInfo = getMonthlyRevenueRate(categoryKey, employee);
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

function getMonthlyPlannedWorkSeries(fiscalYear, assignments) {
  const months = fiscalMonths(fiscalYear);
  const monthIndex = new Map(
    months.map((month, index) => [`${month.y}-${month.m}`, index]),
  );
  const employeeLookup = createMonthlyWorkEmployeeLookup();
  const activeEmployeeIds = new Set(employeeLookup.byId.keys());

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
  };
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

  if (mode === 'revenue') {
    const unpricedHours = series.plannedUnpricedRevenueHours +
      series.actualUnpricedRevenueHours;
    const unpricedText = unpricedHours > 0
      ? ` · ${formatMonthlyPlannedHours(unpricedHours)} unpriced`
      : '';

    meta.textContent =
      `FY${series.fiscalYear + 1} · ` +
      `${formatMonthlyRevenue(series.totalPlannedRevenue, { compact: true })} planned revenue · ` +
      `${formatMonthlyRevenue(series.totalActualRevenue, { compact: true })} actual revenue` +
      unpricedText;
    return;
  }

  const actualText = series.actualMonthCount
    ? `${formatMonthlyPlannedHours(series.totalActualHours)} actual · ${series.actualMonthCount} Time Sheet month${series.actualMonthCount === 1 ? '' : 's'}`
    : 'No matching Time Sheet months';

  meta.textContent =
    `FY${series.fiscalYear + 1} · ${series.resourceCount} active resources · ` +
    `${formatMonthlyPlannedHours(series.totalPlannedHours)} planned · ${actualText}`;
}

function updateMonthlyPlannedWorkNote(mode) {
  const note = document.getElementById('monthlyPlannedWorkNote');
  if (!note) return;

  note.textContent = mode === 'revenue'
    ? 'Revenue uses each resource’s saved designation rates: Service Delivery - Intrasourcing uses the Intrasourcing rate; Service Delivery - Local PS, Pre - Sales and Training Delivery use the shared Local / Pre-Sale / Training rate. Skill Development and General Admin are non-revenue.'
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

  const fiscalYear = getSelectedMonthlyPlannedWorkFiscalYear();
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
  const series = getMonthlyPlannedWorkSeries(fiscalYear, assignments);
  updateMonthlyPlannedWorkTabs();
  updateMonthlyPlannedWorkMeta(series, mode);
  updateMonthlyPlannedWorkNote(mode);

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
      labels: series.rows.map(row => row.label),
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
            font: { size: 11 },
            maxRotation: 0,
            minRotation: 0,
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
