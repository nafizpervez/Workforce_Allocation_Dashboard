/* Workforce Allocation Dashboard — core/data.js */

let matrixFiscalYearLoadInProgress = false;

function syncMatrixFiscalYearControl() {
  const input = document.getElementById('matrixFiscalYearInput');
  const range = document.getElementById('matrixFiscalYearRange');
  const control = document.getElementById('matrixFiscalYearControl');
  const endYear = getFiscalYearEnd(S.matrixFiscalYear);

  if (input) input.value = String(endYear);
  if (range) range.textContent = fiscalYearRangeLabel(S.matrixFiscalYear);
  if (control) {
    control.setAttribute(
      'aria-label',
      `${fiscalYearDisplayLabel(S.matrixFiscalYear)}, ${fiscalYearRangeLabel(S.matrixFiscalYear)}`,
    );
  }
}

function setMatrixFiscalYearControlBusy(isBusy) {
  matrixFiscalYearLoadInProgress = Boolean(isBusy);
  ['matrixFiscalYearInput', 'matrixFiscalYearPrevBtn', 'matrixFiscalYearNextBtn'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.disabled = matrixFiscalYearLoadInProgress;
  });
  document.getElementById('matrixFiscalYearControl')?.classList.toggle(
    'opacity-60',
    matrixFiscalYearLoadInProgress,
  );
}

function resetMatrixFiscalYearFilters() {
  S.matrixProjectFilter = null;
  S.matrixMonthFilter = '';

  const projectFilter = document.getElementById('matrixProjectFilter');
  if (projectFilter) projectFilter.value = '';

  const monthFilter = document.getElementById('matrixMonthFilter');
  if (monthFilter) monthFilter.value = '';
}

function buildMatrixEmployeeUtilization() {
  const effectiveAssignments = getEffectiveFiscalAssignments(
    S.matrixFiscalYear,
    S.matrixAssignments,
  );
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
        employee.id,
        S.matrixFiscalYear,
        S.matrixAssignments,
      );
      const utilization = availableWeeks
        ? (percentageByEmployee.get(Number(employee.id)) || 0) / availableWeeks
        : 0;
      return [Number(employee.id), +utilization.toFixed(1)];
    }),
  );
}

async function loadMatrixAssignments({ announce = false } = {}) {
  const fiscalYear = S.matrixFiscalYear;
  const [assignments, stats] = await Promise.all([
    api('GET', `/api/assignments?fiscalYear=${fiscalYear}`),
    api('GET', `/api/dashboard/stats?fiscalYear=${fiscalYear}`),
  ]);

  // Ignore stale responses if another FY was selected while these requests were running.
  if (fiscalYear !== S.matrixFiscalYear) return false;

  S.matrixAssignments = assignments;
  buildMatrix();
  buildMatrixEmployeeUtilization();
  populateMatrixFilter();
  renderMatrix({ refreshCapacity: false });
  renderYearlyWorkByProjectChart();
  renderProjectWisePeopleChart();

  // The top KPI row is part of the Matrix FY scope. renderStats also refreshes
  // the seven capacity-planning cards from the newly loaded matrix assignments.
  renderStats(stats);

  // Planned vs Actual and Work Summary now belong to the global Matrix FY scope.
  // Keep the Planned vs Actual local FY selector synchronized, and re-filter
  // uploaded Time Sheet summaries to the newly selected Apr–Mar window.
  if (typeof syncMonthlyPlannedWorkFiscalYearToMatrix === 'function') {
    syncMonthlyPlannedWorkFiscalYearToMatrix();
  }
  if (typeof loadPsTeamAssignmentsForFiscalYear === 'function') {
    try { await loadPsTeamAssignmentsForFiscalYear(fiscalYear); }
    catch (error) { console.error('Failed to load PS team assignments for selected FY:', error); }
  }
  if (typeof refreshWorkSummaryForMatrixFiscalYear === 'function') {
    refreshWorkSummaryForMatrixFiscalYear();
  }

  renderInsights();
  applyAndRenderRunning();
  applyAndRenderPipeline();
  populateProductFamilyDropdowns();
  syncMatrixFiscalYearControl();

  if (announce) {
    const assignmentText = assignments.length
      ? `${assignments.length} assignment row${assignments.length === 1 ? '' : 's'} loaded`
      : 'new empty assignment cells are ready';
    toast(`${fiscalYearDisplayLabel(fiscalYear)} selected — ${assignmentText}`);
  }

  return true;
}

async function changeMatrixFiscalYear(fiscalStartYear, announce = true) {
  if (matrixFiscalYearLoadInProgress) return false;

  const nextFiscalYear = normalizeFiscalYearStart(fiscalStartYear, S.matrixFiscalYear);
  if (nextFiscalYear === S.matrixFiscalYear) {
    syncMatrixFiscalYearControl();
    return true;
  }

  const previousFiscalYear = S.matrixFiscalYear;
  S.matrixFiscalYear = nextFiscalYear;
  resetMatrixFiscalYearFilters();
  syncMatrixFiscalYearControl();
  setMatrixFiscalYearControlBusy(true);

  try {
    await loadMatrixAssignments({ announce });
    return true;
  } catch (error) {
    S.matrixFiscalYear = previousFiscalYear;
    syncMatrixFiscalYearControl();
    toast(error.message, 'error');
    console.error(error);
    return false;
  } finally {
    setMatrixFiscalYearControlBusy(false);
  }
}

/* ================================================================ LOAD */
async function loadAll() {
  syncMatrixFiscalYearControl();

  try {
    const fy = S.fiscalYear;
    const matrixFy = S.matrixFiscalYear;
    const fixedAssignmentsRequest = api('GET', `/api/assignments?fiscalYear=${fy}`);
    const matrixAssignmentsRequest = matrixFy === fy
      ? fixedAssignmentsRequest
      : api('GET', `/api/assignments?fiscalYear=${matrixFy}`);

    const [appConfig, emps, projs, asgs, matrixAsgs, revenueRates, committedTargets, preSaleProducts, preSaleProductThresholds, stats, trends, wl, util, pipe, dl, nlChart, psRevChart, psTypeChart] = await Promise.all([
      api('GET', '/api/app-config'),
      api('GET', '/api/employees'), api('GET', '/api/projects'),
      fixedAssignmentsRequest,
      matrixAssignmentsRequest,
      api('GET', '/api/revenue-rates'),
      api('GET', '/api/committed-targets'),
      api('GET', '/api/presale-products'),
      api('GET', '/api/presale-product-settings'),
      api('GET', `/api/dashboard/stats?fiscalYear=${matrixFy}`),
      api('GET', `/api/dashboard/trends?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/workload?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/utilization?fiscalYear=${fy}`),
      api('GET', '/api/dashboard/pipeline'),
      api('GET', '/api/dashboard/deadlines'),
      api('GET', '/api/dashboard/new-logo-chart'),
      api('GET', '/api/dashboard/ps-revenue-chart'),
      api('GET', '/api/dashboard/ps-type-chart'),
    ]);
    S.appConfig = appConfig || S.appConfig;
    S.employees = emps.map(employee => ({
      ...employee,
      name: canonicalPersonName(employee.name),
      designation: canonicalResourceDesignationLabel(employee.designation),
    }));
    S.projects = projs;
    S.assignments = asgs;
    S.matrixAssignments = matrixAsgs;
    if (S.matrixSelectedAssignmentIds instanceof Set) {
      const availableAssignmentIds = new Set(matrixAsgs.map(assignment => Number(assignment.id)));
      [...S.matrixSelectedAssignmentIds].forEach(id => {
        if (!availableAssignmentIds.has(Number(id))) S.matrixSelectedAssignmentIds.delete(id);
      });
    }
    S.revenueRates = revenueRates;
    S.committedTargets = committedTargets;
    S.preSaleProducts = preSaleProducts;
    S.preSaleProductThresholds = preSaleProductThresholds;
    buildMatrix();
    buildMatrixEmployeeUtilization();
    S.employeeUtil = new Map(util.all.map(u => [u.id, u.utilization]));
    renderStats(stats);
    renderMatrix();
    renderTrends(trends);
    renderBurndownChart();
    renderBurnupChart();
    renderMonthlyPlannedWorkChart();
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

    // Load manual monthly Local PS / Intra-Sourcing membership during initial
    // application startup. PS Team Utilization and Team Resources both depend
    // on this state; previously it was loaded only after a Matrix FY change,
    // which left the current assignment month empty on a fresh page load.
    if (typeof loadPsTeamAssignmentsForFiscalYear === 'function') {
      try {
        await loadPsTeamAssignmentsForFiscalYear(matrixFy);
      } catch (error) {
        console.error('Failed to load initial PS team assignments:', error);
      }
    }

    await loadSavedTimesheetFromDb();

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
    const validMonths = fiscalMonths(S.matrixFiscalYear);
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

