/* Workforce Allocation Dashboard — dashboard/monthly-planned-work.js */

/* Monthly planned-versus-actual 100% stacked work-mix comparison. */
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

function createMonthlyWorkCategoryTotals() {
  return Object.fromEntries(
    MONTHLY_PLANNED_WORK_CATEGORIES.map(category => [category.key, 0]),
  );
}

function createMonthlyWorkSource() {
  return {
    hours: createMonthlyWorkCategoryTotals(),
    shares: createMonthlyWorkCategoryTotals(),
    resourceIds: new Set(),
    resourceNames: new Set(),
    projectIds: new Set(),
    projectNames: new Set(),
    rowCount: 0,
    totalHours: 0,
    totalFteWeeks: 0,
  };
}

function getMonthlyPlannedActiveEmployeeIds() {
  if (typeof getActiveEmployees === 'function') {
    return new Set(getActiveEmployees().map(employee => Number(employee.id)));
  }

  return new Set(
    (S.employees || [])
      .filter(employee => employee.active !== 0)
      .map(employee => Number(employee.id)),
  );
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

function classifyMonthlyPlannedWorkType(projectName) {
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

function finalizeMonthlyWorkSource(source) {
  source.totalHours = Object.values(source.hours).reduce(
    (total, hours) => total + hours,
    0,
  );
  source.totalFteWeeks = source.totalHours / RESOURCE_SUMMARY_HOURS_PER_WEEK;

  MONTHLY_PLANNED_WORK_CATEGORIES.forEach(category => {
    source.hours[category.key] = +source.hours[category.key].toFixed(2);
    source.shares[category.key] = source.totalHours
      ? +((source.hours[category.key] / source.totalHours) * 100).toFixed(2)
      : 0;
  });

  source.totalHours = +source.totalHours.toFixed(2);
  source.totalFteWeeks = +source.totalFteWeeks.toFixed(2);
  source.resourceCount = source.resourceIds.size || source.resourceNames.size;
  source.projectCount = source.projectIds.size || source.projectNames.size;
  source.hasData = source.totalHours > 0;
}

function getMonthlyPlannedWorkSeries() {
  const months = fiscalMonths(S.fiscalYear);
  const monthIndex = new Map(
    months.map((month, index) => [`${month.y}-${month.m}`, index]),
  );
  const activeEmployeeIds = getMonthlyPlannedActiveEmployeeIds();

  const rows = months.map(month => ({
    ...month,
    planned: createMonthlyWorkSource(),
    actual: createMonthlyWorkSource(),
  }));

  for (const assignment of S.assignments || []) {
    if (!activeEmployeeIds.has(Number(assignment.employee_id))) continue;

    const index = monthIndex.get(
      `${Number(assignment.year)}-${Number(assignment.month)}`,
    );
    if (index === undefined) continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    const categoryKey = classifyMonthlyPlannedWorkType(
      getSummaryAssignmentProjectName(assignment),
    );
    const plannedHours = RESOURCE_SUMMARY_HOURS_PER_WEEK * (percentage / 100);
    const source = rows[index].planned;

    source.hours[categoryKey] += plannedHours;
    source.resourceIds.add(Number(assignment.employee_id));
    if (assignment.project_id !== null && assignment.project_id !== undefined) {
      source.projectIds.add(Number(assignment.project_id));
    }
    source.rowCount += 1;
  }

  const actualRows = typeof getVisibleTimesheetRows === 'function'
    ? getVisibleTimesheetRows()
    : (S.timesheetRows || []);

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

    source.hours[categoryKey] += hours;
    if (worker) source.resourceNames.add(String(worker).trim());
    if (projectName) source.projectNames.add(String(projectName).trim());
    source.rowCount += 1;
  }

  rows.forEach(row => {
    finalizeMonthlyWorkSource(row.planned);
    finalizeMonthlyWorkSource(row.actual);
  });

  return {
    fiscalYear: S.fiscalYear,
    rows,
    totalPlannedHours: +rows.reduce(
      (sum, row) => sum + row.planned.totalHours,
      0,
    ).toFixed(2),
    totalActualHours: +rows.reduce(
      (sum, row) => sum + row.actual.totalHours,
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

const monthlyPlannedWorkDataLabelPlugin = {
  id: 'monthlyPlannedWorkDataLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px Inter, sans-serif';

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((bar, dataIndex) => {
        const value = Number(dataset.data[dataIndex]) || 0;
        if (value < 7) return;

        const properties = bar.getProps(['x', 'y', 'base'], true);
        const height = Math.abs(properties.base - properties.y);
        if (height < 18) return;

        const category = MONTHLY_PLANNED_WORK_CATEGORY_BY_KEY[dataset.categoryKey];
        ctx.fillStyle = category?.textColor || '#334155';
        ctx.fillText(
          formatMonthlyPlannedPercent(value),
          properties.x,
          (properties.y + properties.base) / 2,
        );
      });
    });

    ctx.restore();
  },
};

function updateMonthlyPlannedWorkMeta(series) {
  const meta = document.getElementById('monthlyPlannedWorkMeta');
  if (!meta) return;

  const actualText = series.actualMonthCount
    ? `${formatMonthlyPlannedHours(series.totalActualHours)} actual · ${series.actualMonthCount} Time Sheet month${series.actualMonthCount === 1 ? '' : 's'}`
    : 'No matching Time Sheet months';

  meta.textContent =
    `FY${series.fiscalYear + 1} · ${series.resourceCount} active resources · ` +
    `${formatMonthlyPlannedHours(series.totalPlannedHours)} planned · ${actualText}`;
}

function setMonthlyWorkCategoryVisibility(chart, categoryKey, visible) {
  chart.data.datasets.forEach((dataset, datasetIndex) => {
    if (dataset.categoryKey === categoryKey) {
      chart.setDatasetVisibility(datasetIndex, visible);
    }
  });
}

function renderMonthlyPlannedWorkChart() {
  const canvas = document.getElementById('monthlyPlannedWorkChart');
  if (!canvas) return;

  if (S.charts.monthlyPlannedWork) {
    S.charts.monthlyPlannedWork.destroy();
    S.charts.monthlyPlannedWork = null;
  }

  const series = getMonthlyPlannedWorkSeries();
  updateMonthlyPlannedWorkMeta(series);

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
        data: series.rows.map(row => {
          if (!isPlanned && !row.actual.hasData) return null;
          return row[workSource].shares[categoryKey];
        }),
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

  S.charts.monthlyPlannedWork = new Chart(canvas.getContext('2d'), {
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
            const chart = legend.chart;
            const categoryKey = legendItem.categoryKey;
            const matchingIndexes = chart.data.datasets
              .map((dataset, index) => dataset.categoryKey === categoryKey ? index : -1)
              .filter(index => index >= 0);
            const currentlyVisible = matchingIndexes.some(index => chart.isDatasetVisible(index));

            setMonthlyWorkCategoryVisibility(chart, categoryKey, !currentlyVisible);
            chart.update();
          },
          labels: {
            boxWidth: 11,
            boxHeight: 11,
            padding: 13,
            color: '#334155',
            font: { size: 11 },
            generateLabels(chart) {
              return MONTHLY_PLANNED_WORK_CATEGORIES.map(category => {
                const matchingIndexes = chart.data.datasets
                  .map((dataset, index) => dataset.categoryKey === category.key ? index : -1)
                  .filter(index => index >= 0);
                const hidden = !matchingIndexes.some(index => chart.isDatasetVisible(index));

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
          padding: 11,
          bodySpacing: 5,
          filter(context) {
            return context.raw !== null && context.raw !== undefined;
          },
          callbacks: {
            title(items) {
              if (!items.length) return '';
              return series.rows[items[0].dataIndex].label;
            },
            label(context) {
              const row = series.rows[context.dataIndex];
              const source = row[context.dataset.workSource];
              const hours = source.hours[context.dataset.categoryKey] || 0;
              const share = Number(context.raw) || 0;
              const sourceLabel = context.dataset.workSource === 'planned'
                ? 'Planned'
                : 'Actual';

              return ` ${sourceLabel} · ${context.dataset.categoryLabel}: ${formatMonthlyPlannedHours(hours)} (${formatMonthlyPlannedPercent(share)})`;
            },
            afterBody(items) {
              if (!items.length) return [];
              const row = series.rows[items[0].dataIndex];
              const lines = [
                '',
                `Planned total: ${formatMonthlyPlannedHours(row.planned.totalHours)} · ${row.planned.totalFteWeeks.toFixed(1)} FTE-weeks`,
                `${row.planned.resourceCount} planned resource${row.planned.resourceCount === 1 ? '' : 's'} · ${row.planned.projectCount} project${row.planned.projectCount === 1 ? '' : 's'}`,
              ];

              if (row.actual.hasData) {
                lines.push(
                  `Actual total: ${formatMonthlyPlannedHours(row.actual.totalHours)}`,
                  `${row.actual.resourceCount} Time Sheet resource${row.actual.resourceCount === 1 ? '' : 's'} · ${row.actual.projectCount} project${row.actual.projectCount === 1 ? '' : 's'}`,
                );
              } else {
                lines.push('Actual: no matching Time Sheet data');
              }

              return lines;
            },
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
        y: {
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
}
