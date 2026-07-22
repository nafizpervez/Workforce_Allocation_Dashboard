/* Workforce Allocation Dashboard — core/data.js */

let globalFiscalYearLoadInProgress = false;

function syncGlobalFiscalYearControl() {
  const input = document.getElementById('globalFiscalYearInput');
  const range = document.getElementById('globalFiscalYearRange');
  const control = document.getElementById('globalFiscalYearControl');
  const endYear = getFiscalYearEnd(S.fiscalYear);

  if (input) input.value = String(endYear);
  if (range) range.textContent = fiscalYearRangeLabel(S.fiscalYear);
  if (control) {
    control.setAttribute(
      'aria-label',
      `${fiscalYearDisplayLabel(S.fiscalYear)}, ${fiscalYearRangeLabel(S.fiscalYear)}`,
    );
  }
}

function setGlobalFiscalYearControlBusy(isBusy) {
  globalFiscalYearLoadInProgress = Boolean(isBusy);
  ['globalFiscalYearInput', 'globalFiscalYearPrevBtn', 'globalFiscalYearNextBtn'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.disabled = globalFiscalYearLoadInProgress;
  });
  document.getElementById('globalFiscalYearControl')?.classList.toggle(
    'opacity-60',
    globalFiscalYearLoadInProgress,
  );
}

function resetGlobalFiscalYearFilters() {
  S.matrixProjectFilter = null;
  S.matrixMonthFilter = '';
  S.individualSummaryMonthFilter = '';
  S.monthlyPlannedWorkFiscalYear = S.fiscalYear;

  const projectFilter = document.getElementById('matrixProjectFilter');
  if (projectFilter) projectFilter.value = '';
  const monthFilter = document.getElementById('matrixMonthFilter');
  if (monthFilter) monthFilter.value = '';
}

function buildMatrixEmployeeUtilization() {
  const effectiveAssignments = getEffectiveFiscalAssignments(S.fiscalYear, S.matrixAssignments);
  const percentageByEmployee = new Map();

  effectiveAssignments.forEach(assignment => {
    const employeeId = Number(assignment.employee_id);
    percentageByEmployee.set(
      employeeId,
      (percentageByEmployee.get(employeeId) || 0) + (Number(assignment.percentage) || 0),
    );
  });

  S.matrixEmployeeUtil = new Map(
    getActiveEmployees().map(employee => {
      const availableWeeks = getEmployeeAvailableFiscalWeekCount(
        employee.id, S.fiscalYear, S.matrixAssignments,
      );
      const utilization = availableWeeks
        ? (percentageByEmployee.get(Number(employee.id)) || 0) / availableWeeks
        : 0;
      return [Number(employee.id), +utilization.toFixed(1)];
    }),
  );
}

async function changeGlobalFiscalYear(fiscalStartYear, announce = true) {
  if (globalFiscalYearLoadInProgress) return false;

  const nextFiscalYear = normalizeFiscalYearStart(fiscalStartYear, S.fiscalYear);
  if (nextFiscalYear === S.fiscalYear) {
    syncGlobalFiscalYearControl();
    return true;
  }

  const previousFiscalYear = S.fiscalYear;
  S.fiscalYear = nextFiscalYear;
  try { localStorage.setItem('dashboardFiscalYear', String(nextFiscalYear)); } catch (_) {}
  resetGlobalFiscalYearFilters();
  syncGlobalFiscalYearControl();
  setGlobalFiscalYearControlBusy(true);

  try {
    const loaded = await loadAll({ preserveTimesheet: true });
    if (!loaded) throw new Error(`Unable to load ${fiscalYearDisplayLabel(nextFiscalYear)}.`);
    if (announce) {
      const assignmentText = S.assignments.length
        ? `${S.assignments.length} assignment row${S.assignments.length === 1 ? '' : 's'} loaded`
        : 'empty future/historical sheets are ready';
      toast(`${fiscalYearDisplayLabel(nextFiscalYear)} selected — ${assignmentText}`);
    }
    return true;
  } catch (error) {
    S.fiscalYear = previousFiscalYear;
    try { localStorage.setItem('dashboardFiscalYear', String(previousFiscalYear)); } catch (_) {}
    syncGlobalFiscalYearControl();
    await loadAll({ preserveTimesheet: true });
    toast(error.message, 'error');
    console.error(error);
    return false;
  } finally {
    setGlobalFiscalYearControlBusy(false);
  }
}


function createEmptyFiscalChartRow(fiscalYearEnd, chartType = 'generic') {
  const base = { fy: fiscalYearEnd, label: `FY ${fiscalYearEnd}` };
  if (chartType === 'new-logo') {
    return {
      ...base,
      'NEW LOGO': 0,
      REPEAT: 0,
      REACTIVE: 0,
      projects: { 'NEW LOGO': [], REPEAT: [], REACTIVE: [] },
    };
  }
  if (chartType === 'ps-revenue') {
    return {
      ...base,
      total_amount: 0,
      ps_amount: 0,
      pct: 0,
      all_projects: [],
      ps_projects: [],
    };
  }
  if (chartType === 'ps-type') {
    return {
      ...base,
      support: 0,
      impl: 0,
      supportProjects: [],
      implProjects: [],
    };
  }
  return base;
}

function scopeFiscalChartData(data, fiscalYearEnd, chartType = 'generic') {
  const emptyRow = createEmptyFiscalChartRow(fiscalYearEnd, chartType);
  if (Array.isArray(data)) {
    const rows = data.filter(row => Number(row?.fy) === Number(fiscalYearEnd));
    return rows.length ? rows : [{ ...emptyRow }];
  }

  const source = data && typeof data === 'object' ? data : { ALL: [] };
  const entries = Object.entries(source);
  if (!entries.length) entries.push(['ALL', []]);

  return Object.fromEntries(entries.map(([key, rows]) => {
    if (!Array.isArray(rows)) return [key, rows];
    const filtered = rows.filter(row => Number(row?.fy) === Number(fiscalYearEnd));
    return [key, filtered.length ? filtered : [{ ...emptyRow }]];
  }));
}

/* ================================================================ LOAD */
async function loadAll({ preserveTimesheet = false } = {}) {
  syncGlobalFiscalYearControl();

  try {
    const fy = S.fiscalYear;
    const assignmentsRequest = api('GET', `/api/assignments?fiscalYear=${fy}`);

    const [emps, projs, asgs, revenueRates, committedTargets, preSaleProducts, stats, trends, wl, util, pipe, dl, nlChart, psRevChart, psTypeChart] = await Promise.all([
      api('GET', '/api/employees'), api('GET', '/api/projects'),
      assignmentsRequest,
      api('GET', '/api/revenue-rates'),
      api('GET', '/api/committed-targets'),
      api('GET', '/api/presale-products'),
      api('GET', `/api/dashboard/stats?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/trends?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/workload?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/utilization?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/pipeline?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/deadlines?fiscalYear=${getOperationalFiscalYearStart()}`),
      api('GET', '/api/dashboard/new-logo-chart'),
      api('GET', '/api/dashboard/ps-revenue-chart'),
      api('GET', '/api/dashboard/ps-type-chart'),
    ]);
    S.employees = emps.map(employee => ({
      ...employee,
      name: canonicalPersonName(employee.name),
    }));
    S.projects = projs;
    S.assignments = asgs;
    S.matrixAssignments = asgs;
    S.revenueRates = revenueRates;
    S.committedTargets = committedTargets;
    S.preSaleProducts = preSaleProducts;
    buildMatrix();
    buildMatrixEmployeeUtilization();
    S.employeeUtil = new Map(util.all.map(u => [u.id, u.utilization]));
    renderStats(stats);
    renderMatrix();
    renderTrends(trends);
    renderBurndownChart();
    renderBurnupChart();
    renderMonthlyPlannedWorkChart();
    // Deal Acquisition, Revenue and PS Engagement are operational/all-history views.
    // They intentionally do not follow the global Dashboard FY selector.
    renderNewLogoChart(nlChart);
    // Sync initial category button states
    document.querySelectorAll('.nl-prod-btn').forEach(b => {
      const isActive = S.nlProductFilter.has(b.dataset.prod);
      b.style.background = isActive ? '#1e40af' : 'white';
      b.style.color = isActive ? 'white' : '#374151';
      b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
    });
    S.psRevenueData = psRevChart;
    S.psTypeData = psTypeChart;
    renderInsights();
    S.lastRunningData = dl;
    applyAndRenderRunning();
    renderServicePipeline(projs);
    populateMatrixFilter();
    populatePipelineStageFilter();
    populateProductFamilyDropdowns();

    if (!preserveTimesheet || !S.timesheetRows.length) await loadSavedTimesheetFromDb();
    else {
      if (typeof renderPlannedActualEffortChart === 'function') renderPlannedActualEffortChart();
      if (typeof renderMonthlyPlannedWorkChart === 'function') renderMonthlyPlannedWorkChart();
      if (typeof renderBurndownChart === 'function') renderBurndownChart();
      if (typeof renderBurnupChart === 'function') renderBurnupChart();
    }

    initCardDrag();
    return true;
  } catch (e) {
    toast(e.message, 'error');
    console.error(e);
    return false;
  }
}

function buildMatrix() {
  S.matrix = {};
  for (const assignment of S.matrixAssignments || []) {
    const key = `${assignment.year}-${assignment.month}-${assignment.week}`;
    S.matrix[assignment.employee_id] ||= {};
    (S.matrix[assignment.employee_id][key] ||= []).push(assignment);
  }
}

/* ================================================================ FILTER POPULATION */
function populateMatrixFilter() {
  const activeEmployeeIds = getActiveEmployeeIdSet();

  if (S.matrixResourceFilter && !activeEmployeeIds.has(+S.matrixResourceFilter)) {
    S.matrixResourceFilter = null;
  }

  const ps = document.getElementById('matrixProjectFilter');
  if (ps) {
    const pids = new Set(
      S.matrixAssignments
        .filter(a => activeEmployeeIds.has(a.employee_id))
        .map(a => a.project_id)
    );

    ps.innerHTML =
      '<option value="">All Projects</option>' +
      S.projects
        .filter(p => pids.has(p.id))
        .map(p => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}</option>`)
        .join('');

    ps.value = String(S.matrixProjectFilter || '');
  }

  const rs = document.getElementById('matrixResourceFilter');
  if (rs) {
    rs.innerHTML =
      '<option value="">All Resources</option>' +
      getActiveEmployees()
        .map(e => `<option value="${e.id}">${esc(e.name)}</option>`)
        .join('');

    rs.value = String(S.matrixResourceFilter || '');
  }

  const ms = document.getElementById('matrixMonthFilter');
  if (ms) {
    const validMonths = fiscalMonths(S.fiscalYear);
    const validValues = new Set(validMonths.map(month => `${month.y}-${month.m}`));
    if (S.matrixMonthFilter && !validValues.has(S.matrixMonthFilter)) S.matrixMonthFilter = '';
    ms.innerHTML =
      '<option value="">All Months</option>' +
      validMonths
        .map(m => `<option value="${m.y}-${m.m}">${esc(m.label)}</option>`)
        .join('');
    ms.value = S.matrixMonthFilter || '';
  }

  const ss = document.getElementById('matrixStageFilter');
  if (ss && ss.options.length <= 1) {
    ss.innerHTML =
      '<option value="">All Stages</option>' +
      STAGES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
}

function populatePipelineStageFilter() {
  const sel = document.getElementById('pipeStageFilt');
  if (sel && sel.options.length <= 1) {
    sel.innerHTML = '<option value="">All Stages</option>' +
      SERVICE_PIPELINE_STAGES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
}

