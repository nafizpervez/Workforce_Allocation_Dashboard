/* Workforce Allocation Dashboard — core/data.js */

/* ================================================================ LOAD */
async function loadAll() {
  try {
    const fy = S.fiscalYear;
    const [emps, projs, asgs, revenueRates, stats, trends, wl, util, pipe, dl, nlChart, psRevChart, psTypeChart] = await Promise.all([
      api('GET', '/api/employees'), api('GET', '/api/projects'),
      api('GET', `/api/assignments?fiscalYear=${fy}`),
      api('GET', '/api/revenue-rates'),
      api('GET', `/api/dashboard/stats?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/trends?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/workload?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/utilization?fiscalYear=${fy}`),
      api('GET', '/api/dashboard/pipeline'),
      api('GET', '/api/dashboard/deadlines'),
      api('GET', '/api/dashboard/new-logo-chart'),
      api('GET', '/api/dashboard/ps-revenue-chart'),
      api('GET', '/api/dashboard/ps-type-chart'),
    ]);
    S.employees = emps; S.projects = projs; S.assignments = asgs; S.revenueRates = revenueRates;
    buildMatrix();
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
    S.psRevenueData = psRevChart;  // keyed by category
    S.psTypeData = psTypeChart;
    renderInsights();
    S.lastRunningData = dl;
    applyAndRenderRunning();
    renderServicePipeline(projs);
    populateMatrixFilter();
    populatePipelineStageFilter();
    populateProductFamilyDropdowns();

    await loadSavedTimesheetFromDb();

    initCardDrag();
  } catch (e) { toast(e.message, 'error'); console.error(e); }
}

function buildMatrix() { S.matrix = {}; for (const a of S.assignments) { const k = `${a.year}-${a.month}-${a.week}`; S.matrix[a.employee_id] ||= {}; (S.matrix[a.employee_id][k] ||= []).push(a); } }

/* ================================================================ FILTER POPULATION */
function populateMatrixFilter() {
  const activeEmployeeIds = getActiveEmployeeIdSet();

  if (S.matrixResourceFilter && !activeEmployeeIds.has(+S.matrixResourceFilter)) {
    S.matrixResourceFilter = null;
  }

  const ps = document.getElementById('matrixProjectFilter');
  if (ps) {
    const pids = new Set(
      S.assignments
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
  if (ms && ms.options.length <= 1) {
    ms.innerHTML =
      '<option value="">All Months</option>' +
      fiscalMonths(S.fiscalYear)
        .map(m => `<option value="${m.y}-${m.m}">${esc(m.label)}</option>`)
        .join('');
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

