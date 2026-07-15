/* Workforce Allocation Dashboard — timesheets/team-summary-comparison.js */

/* ================================================================
   TEAM SUMMARY: PLANNED ASSIGNMENT VS ACTUAL TIME SHEET
   ================================================================ */

const TEAM_SUMMARY_SOURCE_ORDER = Object.freeze(['planned', 'actual']);
const TEAM_SUMMARY_HOURS_PER_WEEK = 40;

function teamSummaryMonthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function parseTeamSummaryMonth(value) {
  if (typeof parseMonthlyWorkMonth === 'function') {
    return parseMonthlyWorkMonth(value);
  }

  const text = String(value || '').trim();
  const match = text.match(/^([A-Za-z]{3,9})\s*[-/]?\s*(\d{2}|\d{4})$/);
  if (!match) return null;

  const month = MN.findIndex(item => (
    item.toLowerCase() === match[1].slice(0, 3).toLowerCase()
  )) + 1;
  if (!month) return null;

  let year = Number(match[2]);
  if (year < 100) year += 2000;

  return { year, month };
}

function teamSummaryMonthLabel(year, month) {
  return `${MN[Number(month) - 1]} ${String(Number(year)).slice(-2)}`;
}

function classifyTeamSummaryPlannedWorkType(projectName) {
  const normalizedName = String(projectName || '')
    .toLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/\btraining\s+delivery\b/.test(normalizedName)) {
    return 'Training Delivery';
  }

  if (/\bskill\s+development\b/.test(normalizedName)) {
    return 'Skill Development';
  }

  if (/\bintrasourc(?:e|ing)\b/.test(normalizedName)) {
    return 'Service Delivery - Intrasourcing';
  }

  if (/\bpre\s+sales?\b/.test(normalizedName)) {
    return 'Pre - Sales';
  }

  if (/\bgeneral\s+admin\b/.test(normalizedName)) {
    return 'General Admin';
  }

  return 'Service Delivery - Local PS';
}

function createTeamSummarySourceTotals() {
  return {
    hours: Object.fromEntries(TIMESHEET_WORK_TYPE_ORDER.map(type => [type, 0])),
    shares: Object.fromEntries(TIMESHEET_WORK_TYPE_ORDER.map(type => [type, 0])),
    totalHours: 0,
    hasData: false,
  };
}

function createTeamSummaryMonthRecord(year, month) {
  return {
    key: teamSummaryMonthKey(year, month),
    year: Number(year),
    month: Number(month),
    label: teamSummaryMonthLabel(year, month),
    actualLabels: new Set(),
    planned: createTeamSummarySourceTotals(),
    actual: createTeamSummarySourceTotals(),
  };
}

function finalizeTeamSummarySource(source) {
  source.totalHours = TIMESHEET_WORK_TYPE_ORDER.reduce(
    (total, type) => total + (Number(source.hours[type]) || 0),
    0,
  );

  for (const type of TIMESHEET_WORK_TYPE_ORDER) {
    const hours = Number(source.hours[type]) || 0;
    source.hours[type] = +hours.toFixed(2);
    source.shares[type] = source.totalHours
      ? +((hours / source.totalHours) * 100).toFixed(2)
      : 0;
  }

  source.totalHours = +source.totalHours.toFixed(2);
  source.hasData = source.totalHours > 0;
}

function getTeamSummaryComparisonAssignments() {
  if (Array.isArray(S.comparisonAssignments) && S.comparisonAssignments.length) {
    return S.comparisonAssignments;
  }

  return S.assignments || [];
}

function getTeamSummaryProjectName(assignment) {
  if (typeof getSummaryAssignmentProjectName === 'function') {
    return getSummaryAssignmentProjectName(assignment);
  }

  return assignment.project_name || assignment.projectName || '';
}

function enumerateTeamSummaryMonths(startYear, startMonth, endYear, endMonth) {
  const months = [];
  let year = Number(startYear);
  let month = Number(startMonth);

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year, month });
    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function buildTeamSummaryComparisonSeries() {
  const monthMap = new Map();
  const actualRows = getVisibleTimesheetRows();
  const assignments = getTeamSummaryComparisonAssignments();
  const activeEmployeeIds = typeof getActiveEmployeeIdSet === 'function'
    ? getActiveEmployeeIdSet()
    : new Set((S.employees || []).filter(employee => employee.active !== 0).map(employee => Number(employee.id)));

  const ensureMonth = (year, month) => {
    const key = teamSummaryMonthKey(year, month);

    if (!monthMap.has(key)) {
      monthMap.set(key, createTeamSummaryMonthRecord(year, month));
    }

    return monthMap.get(key);
  };

  for (const row of actualRows) {
    const parsedMonth = parseTeamSummaryMonth(row.month);
    if (!parsedMonth) continue;

    const workType = normalizeTimesheetWorkType(row.workType);
    const hours = Number(row.qty) || 0;
    if (!workType || hours <= 0) continue;

    const month = ensureMonth(parsedMonth.year, parsedMonth.month);
    month.actual.hours[workType] += hours;
    month.actualLabels.add(String(row.month || month.label));
  }

  const actualMonthKeys = new Set(monthMap.keys());
  const fiscalYearMonthKeys = new Set(
    fiscalMonths(S.fiscalYear).map(row => teamSummaryMonthKey(row.y, row.m)),
  );
  const comparisonMonthKeys = new Set([
    ...actualMonthKeys,
    ...fiscalYearMonthKeys,
  ]);

  for (const assignment of assignments) {
    if (!activeEmployeeIds.has(Number(assignment.employee_id))) continue;

    const year = Number(assignment.year);
    const monthNumber = Number(assignment.month);
    const percentage = Number(assignment.percentage);

    if (!Number.isFinite(year) || monthNumber < 1 || monthNumber > 12) continue;
    if (!Number.isFinite(percentage) || percentage <= 0) continue;
    if (!comparisonMonthKeys.has(teamSummaryMonthKey(year, monthNumber))) continue;

    const workType = classifyTeamSummaryPlannedWorkType(
      getTeamSummaryProjectName(assignment),
    );
    const hours = TEAM_SUMMARY_HOURS_PER_WEEK * (percentage / 100);
    ensureMonth(year, monthNumber).planned.hours[workType] += hours;
  }

  const actualMonthDates = [...monthMap.values()]
    .filter(row => row.actualLabels.size)
    .map(row => ({ year: row.year, month: row.month }));
  const fiscalYearMonths = fiscalMonths(S.fiscalYear).map(row => ({
    year: row.y,
    month: row.m,
  }));

  const boundaryMonths = [...actualMonthDates, ...fiscalYearMonths];

  if (boundaryMonths.length) {
    boundaryMonths.sort((a, b) => (
      a.year * 12 + a.month - (b.year * 12 + b.month)
    ));

    const first = boundaryMonths[0];
    const last = boundaryMonths[boundaryMonths.length - 1];

    for (const item of enumerateTeamSummaryMonths(
      first.year,
      first.month,
      last.year,
      last.month,
    )) {
      ensureMonth(item.year, item.month);
    }
  }

  const rows = [...monthMap.values()].sort((a, b) => (
    a.year * 12 + a.month - (b.year * 12 + b.month)
  ));

  rows.forEach(row => {
    finalizeTeamSummarySource(row.planned);
    finalizeTeamSummarySource(row.actual);
    row.actualLabels = [...row.actualLabels];
  });

  return {
    rows,
    totalPlannedHours: +rows.reduce((total, row) => total + row.planned.totalHours, 0).toFixed(2),
    totalActualHours: +rows.reduce((total, row) => total + row.actual.totalHours, 0).toFixed(2),
    actualMonthCount: rows.filter(row => row.actual.hasData).length,
    plannedMonthCount: rows.filter(row => row.planned.hasData).length,
  };
}

function buildTeamSummaryComparisonDatasets(series) {
  const datasets = [];

  for (const source of TEAM_SUMMARY_SOURCE_ORDER) {
    for (const type of TIMESHEET_WORK_TYPE_STACK_ORDER) {
      const color = workTypeColor(type);
      const isPlanned = source === 'planned';

      datasets.push({
        label: type,
        workType: type,
        workSource: source,
        timesheetColor: color,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderColor: isPlanned ? '#64748B' : '#FFFFFF',
        borderWidth: isPlanned ? 1.25 : 1.5,
        borderRadius: 0,
        borderSkipped: false,
        grouped: true,
        stack: source,
        barPercentage: 0.84,
        categoryPercentage: 0.76,
        maxBarThickness: 58,
        data: series.rows.map(row => row[source].shares[type]),
        hoursData: series.rows.map(row => row[source].hours[type]),
      });
    }
  }

  return datasets;
}

function setTeamSummaryWorkTypeVisibility(chart, workType, visible) {
  chart.data.datasets.forEach((dataset, datasetIndex) => {
    if (dataset.workType === workType) {
      chart.setDatasetVisibility(datasetIndex, visible);
    }
  });
}

function teamSummaryComparisonLegendLabels() {
  return {
    boxWidth: 10,
    boxHeight: 10,
    font: { size: 11 },
    padding: 10,
    generateLabels(chart) {
      return TIMESHEET_WORK_TYPE_ORDER.map(type => {
        const matchingIndexes = chart.data.datasets
          .map((dataset, index) => dataset.workType === type ? index : -1)
          .filter(index => index >= 0);
        const hidden = !matchingIndexes.some(index => chart.isDatasetVisible(index));
        const color = workTypeColor(type);

        return {
          text: type,
          fillStyle: color,
          strokeStyle: color,
          lineWidth: 0,
          hidden,
          workType: type,
          datasetIndex: matchingIndexes[0],
        };
      });
    },
  };
}

const teamSummarySourceLabelPlugin = {
  id: 'teamSummarySourceLabel',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '600 9px Inter, sans-serif';
    ctx.fillStyle = '#64748B';

    TEAM_SUMMARY_SOURCE_ORDER.forEach(source => {
      const datasetIndex = chart.data.datasets.findIndex(dataset => (
        dataset.workSource === source
      ));
      if (datasetIndex < 0) return;

      const meta = chart.getDatasetMeta(datasetIndex);
      const label = source === 'planned' ? 'Planned' : 'Actual';

      meta.data.forEach(element => {
        if (!element || !Number.isFinite(element.x)) return;
        ctx.fillText(label, element.x, chartArea.top - 4);
      });
    });

    ctx.restore();
  },
};
