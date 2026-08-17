/* Workforce Allocation Dashboard — projects/resources.js */

function openResourceModal() {
  const activeEmps = S.employees.filter(e => e.active !== 0);
  const inactiveEmps = S.employees.filter(e => e.active === 0);

  const empRow = (e) => {
    const isActive = e.active !== 0;
    const util = S.employeeUtil ? (S.employeeUtil.get(e.id) || 0) : 0;
    const clr = uc(util), badge = ub(util);
    const teamAssignment = getCurrentPsTeamAssignment(e.id);
    const assignedTo = teamAssignment?.assignedTo || '';
    const assignmentMonthLabel = psTeamAssignmentMonthLabel(teamAssignment?.monthKey || S.psTeamAssignments?.current?.monthKey || currentPsTeamAssignmentMonthKey());
    const effectiveMonthLabel = psTeamAssignmentMonthLabel(teamAssignment?.effectiveMonth || '');
    let assignmentSource = `— · never assigned`;
    if (assignedTo) {
      assignmentSource = teamAssignment?.source === 'carried-forward'
        ? `Carried forward from ${effectiveMonthLabel || assignmentMonthLabel || 'earlier month'}`
        : `Manual · ${effectiveMonthLabel || assignmentMonthLabel || 'selected month'}`;
    } else if (teamAssignment?.source === 'manual-unassigned') {
      assignmentSource = `Unassigned manually · ${effectiveMonthLabel || assignmentMonthLabel || 'selected month'}`;
    } else if (teamAssignment?.source === 'carried-forward-unassigned') {
      assignmentSource = `Unassigned since ${effectiveMonthLabel || assignmentMonthLabel || 'earlier month'}`;
    }
    const searchText = [
      e.employee_code,
      e.name,
      e.email,
      e.dept,
      e.designation,
      assignedTo,
      isActive ? 'active' : 'inactive',
    ].filter(Boolean).join(' ').toLowerCase();

    return `<tr data-team-resource-row data-search="${esc(searchText)}" class="${isActive ? '' : 'opacity-50'} hover:bg-gray-50 transition-colors">
      <td class="py-2.5 px-4 text-sm text-gray-500">${esc(e.employee_code || '')}</td>
      <td class="py-2.5 px-4">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(e.name))}</div>
          <div>
            <div class="text-sm font-semibold text-gray-900">${esc(e.name)}</div>
            <div class="text-xs text-gray-400">${esc(e.email || '')}</div>
          </div>
        </div>
      </td>
      <td class="py-2.5 px-4 text-xs text-gray-500">${esc(e.dept || '—')}</td>
      <td class="py-2.5 px-4 text-xs text-gray-500">${esc(e.designation || '—')}</td>
      <td class="py-2.5 px-4 ps-team-assignment-cell">
        <select
          class="ps-team-assignment-select"
          aria-label="Assigned To for ${esc(e.name)}"
          onchange="saveEmployeePsTeamAssignment(${e.id}, this.value, this)"
        >
          <option value="" ${assignedTo ? '' : 'selected'}>—</option>
          <option value="Local PS" ${assignedTo === 'Local PS' ? 'selected' : ''}>Local PS</option>
          <option value="Intra-Sourcing" ${assignedTo === 'Intra-Sourcing' ? 'selected' : ''}>Intra-Sourcing</option>
        </select>
        <div class="ps-team-assignment-source" title="${esc(assignmentSource)}">${esc(assignmentSource)}</div>
      </td>
      <td class="py-2.5 px-4">
        <div class="workdays-inline-editor">
          <input id="teamWorkdays-${e.id}" type="number" min="0" step="1" value="${esc(String(Number(e.workdays) || 0))}" aria-label="Workdays for ${esc(e.name)}">
          <button type="button" onclick="saveEmployeeWorkdays(${e.id}, 'teamWorkdays-${e.id}', 'team')">Save</button>
        </div>
      </td>
      <td class="py-2.5 px-4">
        <span class="${badge} text-xs px-2 py-0.5 rounded-full font-medium">${util}%</span>
      </td>
      <td class="py-2.5 px-4">
        <button onclick="toggleEmployeeActive(${e.id})"
          class="text-xs font-semibold px-3 py-1 rounded-full border transition-all ${isActive
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'}">
          ${isActive ? '✓ Active' : '✗ Inactive'}
        </button>
      </td>
      <td class="py-2.5 px-4">
        <button
          type="button"
          onclick="openEmployeeModal({ id: ${e.id} })"
          class="text-xs font-semibold px-3 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100 hover:border-blue-300"
          aria-label="Edit ${esc(e.name)}"
        >
          Edit
        </button>
      </td>
    </tr>`;
  };

  const tableHtml = (emps) => emps.length
    ? `<div class="team-resources-table-scroll nice-scroll"><table class="team-resources-table w-full text-left border-collapse">
        <colgroup>
          <col class="team-resources-col-code">
          <col class="team-resources-col-name">
          <col class="team-resources-col-dept">
          <col class="team-resources-col-designation">
          <col class="team-resources-col-assigned">
          <col class="team-resources-col-workdays">
          <col class="team-resources-col-util">
          <col class="team-resources-col-status">
          <col class="team-resources-col-edit">
        </colgroup>
        <thead><tr class="border-b border-gray-200">
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Code</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Name</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Dept</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Designation</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500 ps-team-assignment-header">Assigned To</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Workdays</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Util</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Status</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Edit</th>
        </tr></thead>
        <tbody>${emps.map(empRow).join('')}</tbody>
      </table></div>`
    : '<p class="text-sm text-gray-400 py-4 px-4">None</p>';

  const currentTeamMonth = S.psTeamAssignments?.current?.monthKey || currentPsTeamAssignmentMonthKey();
  const assignedToContext = currentTeamMonth
    ? ` · Assigned To for ${psTeamAssignmentMonthLabel(currentTeamMonth)} · carries forward until changed`
    : '';

  openModal(
    mHdr('Team Resources', `${activeEmps.length} active · ${inactiveEmps.length} inactive · productivity calculated on active only${assignedToContext}`)
    + `<div class="modal-scroll-body nice-scroll">
        <div class="sticky top-0 z-10 px-4 py-3 border-b border-gray-200 bg-white">
          <label for="teamResourcesSearch" class="sr-only">Search team resources</label>
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="teamResourcesSearch" type="search" autocomplete="off"
              placeholder="Search by name, code, email, department, designation, Assigned To or status..."
              oninput="filterTeamResources(this.value)"
              class="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
          </div>
          <div id="teamResourcesSearchSummary" class="mt-2 text-xs text-gray-500" aria-live="polite"></div>
        </div>
        <div id="teamResourcesActiveGroup" data-team-resource-group>
          <div class="px-4 pt-4 pb-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
            Active Members (<span data-team-resource-count>${activeEmps.length}</span>)
          </div>
          ${tableHtml(activeEmps)}
        </div>
        ${inactiveEmps.length ? `
        <div id="teamResourcesInactiveGroup" data-team-resource-group>
          <div class="px-4 pt-4 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
            Inactive Members (<span data-team-resource-count>${inactiveEmps.length}</span>)
          </div>
          ${tableHtml(inactiveEmps)}
        </div>` : ''}
        <div id="teamResourcesNoResults" class="hidden px-6 py-12 text-center text-sm text-gray-400">
          No team resources match this search.
        </div>
      </div>
      <div class="modal-footer px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-[1500px] team-resources-modal-panel'
  );

  filterTeamResources('');
  setTimeout(() => document.getElementById('teamResourcesSearch')?.focus(), 0);
}

function filterTeamResources(value = '') {
  const query = String(value || '').trim().toLowerCase();
  const groups = [...document.querySelectorAll('[data-team-resource-group]')];
  let visibleTotal = 0;
  let totalRows = 0;

  groups.forEach(group => {
    const rows = [...group.querySelectorAll('[data-team-resource-row]')];
    let visibleInGroup = 0;
    totalRows += rows.length;

    rows.forEach(row => {
      const matches = !query || String(row.dataset.search || '').includes(query);
      row.classList.toggle('hidden', !matches);
      if (matches) visibleInGroup += 1;
    });

    visibleTotal += visibleInGroup;
    group.classList.toggle('hidden', visibleInGroup === 0);
    const count = group.querySelector('[data-team-resource-count]');
    if (count) count.textContent = String(visibleInGroup);
  });

  const noResults = document.getElementById('teamResourcesNoResults');
  if (noResults) noResults.classList.toggle('hidden', visibleTotal !== 0);

  const summary = document.getElementById('teamResourcesSearchSummary');
  if (summary) {
    summary.textContent = query
      ? `${visibleTotal} of ${totalRows} resource${totalRows === 1 ? '' : 's'} shown`
      : `${totalRows} resource${totalRows === 1 ? '' : 's'}`;
  }
}

window.filterTeamResources = filterTeamResources;

async function toggleEmployeeActive(empId) {
  try {
    const updated = await api('PATCH', `/api/employees/${empId}/active`);

    const idx = S.employees.findIndex(e => e.id === empId);
    if (idx >= 0) {
      S.employees[idx] = {
        ...S.employees[idx],
        ...updated,
      };
    }

    if (!updated.active && S.matrixResourceFilter && +S.matrixResourceFilter === empId) {
      S.matrixResourceFilter = null;
    }

    buildMatrix();
    populateMatrixFilter();
    renderMatrix();
    renderYearlyWorkByProjectChart();
    renderProjectWisePeopleChart();
    renderBurndownChart();
    renderBurnupChart();
    renderMonthlyPlannedWorkChart();
    renderTeamSummaryChart();
    renderIndividualSummaryChart();
    if (typeof renderTeamUtilizationSummary === 'function') renderTeamUtilizationSummary();
    renderInsights();

    openResourceModal();

    const fy = S.matrixFiscalYear;
    api('GET', `/api/dashboard/stats?fiscalYear=${fy}`)
      .then(stats => renderStats(stats))
      .catch(() => {});

    toast(updated.active ? `${updated.name} set to Active` : `${updated.name} set to Inactive`);
  } catch (e) {
    toast('Failed to update status', 'error');
  }
}


function downloadAllProjectsExcel() {
  try {
    if (typeof XLSX === 'undefined') {
      toast('Excel library is not loaded. Please check SheetJS CDN access.', 'error');
      return;
    }

    const projectRows = (S.projects || []).map((p, idx) => {
      const asgs = getEffectiveFiscalAssignments(S.fiscalYear).filter(a => a.project_id === p.id);
      const employeeIds = [...new Set(asgs.map(a => a.employee_id).filter(Boolean))];
      const resourceNames = employeeIds
        .map(id => (S.employees || []).find(e => e.id === id)?.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      const assignedWeightedWeeks = asgs.reduce((sum, a) => sum + ((Number(a.percentage) || 0) / 100), 0);
      return {
        'SL': idx + 1,
        'Project ID': p.id || '',
        'Project Import Row No': p.import_row_no || '',
        'Opportunity Number': p.code || '',
        'Project Name': p.name || '',
        'Account Name': p.account_name || '',
        'Client': p.client || '',
        'Product Name': p.product_name || '',
        'Product Family': p.product_family || '',
        'Opportunity Owner': p.opportunity_owner || '',
        'Stage': p.stage || '',
        'Fiscal Period': p.fiscal_period || '',
        'Not Local Project': Number(p.not_local_project) === 1 ? 'Yes' : 'No',
        'Deal Status': p.deal_status || '',
        'Priority': p.priority || '',
        'Probability (%)': Number(p.probability) || 0,
        'Product Amount': Number(p.product_amount) || 0,
        'Amount': Number(p.opp_amount) || 0,
        'Budget': Number(p.budget) || 0,
        'Progress (%)': Number(p.progress) || 0,
        'Created Date': p.created_date || '',
        'Close Won Date': p.end_date || '',
        'Project Closing Date': p.project_closing_date || '',
        'Assignment Slot Count': asgs.length,
        'Assigned Resource Count': employeeIds.length,
        'Assigned Weighted Weeks': +assignedWeightedWeeks.toFixed(2),
        'Assigned Resource Names': resourceNames.join(', '),
      };
    });

    const stageSummary = {};
    for (const p of S.projects || []) {
      const key = p.stage || 'Unknown';
      stageSummary[key] ||= { 'Stage': key, 'Project Count': 0, 'Total Product Amount': 0, 'Total Amount': 0 };
      stageSummary[key]['Project Count'] += 1;
      stageSummary[key]['Total Product Amount'] += Number(p.product_amount) || 0;
      stageSummary[key]['Total Amount'] += Number(p.opp_amount) || 0;
    }

    const summaryRows = [
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() },
      { 'Metric': 'Total Projects', 'Value': (S.projects || []).length },
      { 'Metric': 'Total Effective Assignment Slots', 'Value': getEffectiveFiscalAssignments(S.fiscalYear).length },
      { 'Metric': 'Project Import Behavior', 'Value': 'No de-duplication. Duplicate project rows are kept exactly as imported.' },
    ];

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsCompare = XLSX.utils.json_to_sheet(projectRows);
    const wsStage = XLSX.utils.json_to_sheet(Object.values(stageSummary));

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Export Summary');
    XLSX.utils.book_append_sheet(wb, wsCompare, 'Projects Compare');
    XLSX.utils.book_append_sheet(wb, wsStage, 'Stage Summary');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `allocation_dashboard_projects_${stamp}.xlsx`);
    toast(`Exported ${projectRows.length} projects`);
  } catch (e) {
    console.error(e);
    toast('Failed to download project Excel', 'error');
  }
}

window.downloadAllProjectsExcel = downloadAllProjectsExcel;

/* ================================================================ PROJECTS DRILL-DOWN (All Projects modal) */
function openProjectsModal() {
  const projects = [...S.projects];
  const STAGE_ORDER = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won', 'Closed Lost'];

  function normalizeProductFamily(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getProjectFiscalYearEndForModal(project) {
    const closedWonDate = String(project?.end_date || '').trim();
    const match = closedWonDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (Number.isInteger(year) && month >= 1 && month <= 12) {
        return month >= FISCAL_YEAR_START_MONTH ? year + 1 : year;
      }
    }

    if (typeof getFiscalYearFromFiscalPeriod === 'function') {
      const fromPeriod = getFiscalYearFromFiscalPeriod(project?.fiscal_period);
      if (Number.isInteger(fromPeriod)) return fromPeriod;
    }

    return null;
  }

  const currentFiscalYearEnd = getFiscalYearEnd(S.matrixFiscalYear);
  const fiscalYearEnds = [...new Set([
    currentFiscalYearEnd,
    ...projects.map(getProjectFiscalYearEndForModal).filter(Number.isInteger),
  ])].sort((a, b) => b - a);

  const productFamilies = [...new Map(
    projects
      .map(project => String(project?.product_family || '').trim())
      .filter(Boolean)
      .map(value => [normalizeProductFamily(value), value]),
  ).values()].sort((a, b) => a.localeCompare(b));

  function projectsForFiscalYear(fiscalYearEnd) {
    if (fiscalYearEnd === '' || fiscalYearEnd === null || fiscalYearEnd === undefined) return [...projects];
    const fyEnd = Number(fiscalYearEnd);
    return projects.filter(project => getProjectFiscalYearEndForModal(project) === fyEnd);
  }

  function buildStagePills(fiscalYearEnd) {
    const stageCounts = {};
    projectsForFiscalYear(fiscalYearEnd).forEach(project => {
      const stage = String(project?.stage || '').trim() || 'Unknown';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    const orderedStages = Object.entries(stageCounts).sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a[0]);
      const bi = STAGE_ORDER.indexOf(b[0]);
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700 cursor-pointer hover:opacity-75 transition-opacity" data-stage-pill="">All</span>${orderedStages
      .map(([stage, count]) => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_PILL[stage] || 'bg-gray-100 text-gray-700'} cursor-pointer hover:opacity-75 transition-opacity" data-stage-pill="${esc(stage)}">${esc(stage)}: ${count}</span>`)
      .join('')}`;
  }

  function sortProjects(list, sortMode) {
    if (sortMode === 'closed-won-asc') {
      return [...list].sort((a, b) => {
        const aDate = String(a.end_date || '');
        const bDate = String(b.end_date || '');
        if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return Number(a.id || 0) - Number(b.id || 0);
      });
    }

    return [...list].sort((a, b) => {
      const aDate = String(a.end_date || '');
      const bDate = String(b.end_date || '');
      if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }

  function getFilteredProjects(filterStage, searchQ, productFamily, fiscalYearEnd) {
    const q = (searchQ || '').toLowerCase().trim();
    const normalizedFamily = normalizeProductFamily(productFamily);
    const hasFiscalYear = !(fiscalYearEnd === '' || fiscalYearEnd === null || fiscalYearEnd === undefined);
    const fyEnd = hasFiscalYear ? Number(fiscalYearEnd) : null;
    return projects.filter(project => {
      if (hasFiscalYear && getProjectFiscalYearEndForModal(project) !== fyEnd) return false;
      if (filterStage && project.stage !== filterStage) return false;
      if (normalizedFamily && normalizeProductFamily(project.product_family) !== normalizedFamily) return false;
      if (!q) return true;
      return (project.code || '').toLowerCase().includes(q)
        || (project.name || '').toLowerCase().includes(q)
        || (project.product_name || '').toLowerCase().includes(q)
        || (project.product_family || '').toLowerCase().includes(q)
        || (project.fiscal_period || '').toLowerCase().includes(q);
    });
  }

  function buildRows(filterStage, searchQ, productFamily, sortMode, fiscalYearEnd) {
    const filtered = getFilteredProjects(filterStage, searchQ, productFamily, fiscalYearEnd);
    const sorted = sortProjects(filtered, sortMode);
    const rowsHtml = sorted.map((project, index) => {
      const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
      return `
      <div class="group mx-4 my-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-200 hover:shadow-md hover:-translate-y-px transition-all cursor-pointer" data-action="edit-project" data-project="${project.id}">
        <div class="flex items-start gap-3">
          <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 flex-shrink-0">${index + 1}</span>
          <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ring-4 ring-white" style="background:${project.color || '#8B5CF6'}"></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 mb-1 flex-wrap">
              <span class="text-xs font-bold text-blue-600 mono">${esc(project.code)}</span>
              <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold ${STAGE_PILL[project.stage] || 'bg-gray-100 text-gray-700'}">${esc(project.stage)}</span>
              ${project.fiscal_period ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">${esc(project.fiscal_period)}</span>` : ''}
              ${project.product_family ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(project.product_family)}</span>` : ''}
            </div>
            <div class="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">${esc(project.name)}</div>
            <div class="text-xs text-slate-500 truncate mt-0.5">${esc(project.account_name || project.client || '—')}${project.opportunity_owner ? ` · ${esc(project.opportunity_owner)}` : ''}</div>
            ${project.product_name ? `<div class="text-xs text-slate-400 truncate mt-0.5">${esc(project.product_name)}</div>` : ''}
          </div>
          <div class="text-right flex-shrink-0 min-w-[210px]">
            <div class="text-sm font-bold text-slate-900 mono mb-1">${(Number(project.product_amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} <span class="text-[10px] font-semibold text-slate-500">USD</span></div>
            <div class="grid grid-cols-[auto_auto] justify-end gap-x-2 gap-y-0.5 text-[11px]">
              <span class="text-slate-400">Closed Won</span><span class="font-semibold text-slate-700">${esc(project.end_date || '—')}</span>
              <span class="text-slate-400">Project Close</span><span class="font-semibold text-slate-700">${esc(project.project_closing_date || '—')}</span>
              <span class="text-slate-400">Progress</span><span class="font-bold ${progress >= 100 ? 'text-emerald-600' : progress > 0 ? 'text-blue-600' : 'text-slate-600'}">${progress.toFixed(progress % 1 ? 1 : 0)}%</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    return { rowsHtml, count: sorted.length };
  }

  const assignmentCache = new Map();
  async function getAssignmentsForFiscalYearEnd(fiscalYearEnd) {
    if (fiscalYearEnd === '' || fiscalYearEnd === null || fiscalYearEnd === undefined) {
      const byProject = new Map();
      const allFiscalAssignments = await Promise.all(fiscalYearEnds.map(endYear => getAssignmentsForFiscalYearEnd(endYear)));
      allFiscalAssignments.flat().forEach(assignment => {
        const key = [assignment?.project_id, assignment?.employee_id, assignment?.year, assignment?.month, assignment?.week].join('|');
        if (!byProject.has(key)) byProject.set(key, assignment);
      });
      return [...byProject.values()];
    }
    const fiscalStartYear = Number(fiscalYearEnd) - 1;
    if (fiscalStartYear === Number(S.matrixFiscalYear)) return S.matrixAssignments || [];
    if (fiscalStartYear === Number(S.fiscalYear)) return S.assignments || [];
    if (!assignmentCache.has(fiscalStartYear)) {
      assignmentCache.set(
        fiscalStartYear,
        api('GET', `/api/assignments?fiscalYear=${fiscalStartYear}`).catch(error => {
          assignmentCache.delete(fiscalStartYear);
          throw error;
        }),
      );
    }
    return assignmentCache.get(fiscalStartYear);
  }

  function isDelayedProjectForFiscalYear(project, fiscalStartYear) {
    if (typeof isRunningProjectInMatrixFiscalYear !== 'function' || !isRunningProjectInMatrixFiscalYear(project, fiscalStartYear)) {
      return false;
    }
    const projectClosingDate = String(project?.project_closing_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(projectClosingDate)) return false;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return projectClosingDate < today;
  }

  function formatProductAmount(value) {
    return `USD ${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function sumProductAmount(rows) {
    return rows.reduce((sum, project) => sum + (Number(project?.product_amount) || 0), 0);
  }

  function summaryRow(label, rows, amountRows = rows) {
    const amount = Array.isArray(amountRows) ? formatProductAmount(sumProductAmount(amountRows)) : '—';
    const tones = {
      'Total Projects': { row: 'bg-blue-50/90', label: 'text-blue-700', value: 'text-blue-900', amount: 'text-blue-800' },
      'Resource Assigned': { row: 'bg-emerald-50/90', label: 'text-emerald-700', value: 'text-emerald-900', amount: 'text-emerald-800' },
      'Resource Not Assigned': { row: 'bg-amber-50/90', label: 'text-amber-700', value: 'text-amber-900', amount: 'text-amber-800' },
      'Closed Won': { row: 'bg-cyan-50/90', label: 'text-cyan-700', value: 'text-cyan-900', amount: 'text-cyan-800' },
      'Running Project': { row: 'bg-violet-50/90', label: 'text-violet-700', value: 'text-violet-900', amount: 'text-violet-800' },
      'Delayed Project': { row: 'bg-rose-50/90', label: 'text-rose-700', value: 'text-rose-900', amount: 'text-rose-800' },
      'Closed Project': { row: 'bg-indigo-50/90', label: 'text-indigo-700', value: 'text-indigo-900', amount: 'text-indigo-800' },
    };
    const tone = tones[label] || { row: 'bg-slate-50', label: 'text-slate-700', value: 'text-slate-900', amount: 'text-slate-700' };
    return `
      <tr class="${tone.row}">
        <td class="py-1.5 px-3 ${tone.label} font-semibold">${esc(label)}</td>
        <td class="py-1.5 px-4 text-right ${tone.value} font-bold">${rows.length.toLocaleString()}</td>
        <td class="py-1.5 px-3 text-right ${tone.amount} font-semibold mono">${amount}</td>
      </tr>`;
  }

  async function buildFiscalYearSummary(fiscalYearEnd, filterStage = '', searchQ = '', productFamily = '') {
    const isAllFiscalYears = fiscalYearEnd === '' || fiscalYearEnd === null || fiscalYearEnd === undefined;
    const fyEnd = isAllFiscalYears ? null : Number(fiscalYearEnd);
    const fyStart = isAllFiscalYears ? null : fyEnd - 1;
    const fiscalProjects = getFilteredProjects(filterStage, searchQ, productFamily, fyEnd);
    const assignments = await getAssignmentsForFiscalYearEnd(fyEnd);
    const assignedProjectIds = new Set(
      (assignments || []).map(assignment => Number(assignment?.project_id)).filter(Number.isFinite),
    );

    const assignedProjects = fiscalProjects.filter(project => assignedProjectIds.has(Number(project.id)));
    const notAssignedProjects = fiscalProjects.filter(project => !assignedProjectIds.has(Number(project.id)));
    const closedWonProjects = fiscalProjects.filter(project => String(project?.stage || '').trim().toLowerCase() === 'closed won');
    const runningProjects = fiscalProjects.filter(project => {
      if (typeof isRunningProjectInMatrixFiscalYear !== 'function') return false;
      const projectFyEnd = getProjectFiscalYearEndForModal(project);
      const projectFyStart = Number.isInteger(projectFyEnd) ? projectFyEnd - 1 : fyStart;
      return Number.isInteger(projectFyStart) && isRunningProjectInMatrixFiscalYear(project, projectFyStart);
    });
    const delayedProjects = fiscalProjects.filter(project => {
      const projectFyEnd = getProjectFiscalYearEndForModal(project);
      const projectFyStart = Number.isInteger(projectFyEnd) ? projectFyEnd - 1 : fyStart;
      return Number.isInteger(projectFyStart) && isDelayedProjectForFiscalYear(project, projectFyStart);
    });
    const closedProjects = fiscalProjects.filter(project => Number(project?.progress) >= 100);

    return `
      <div class="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 16 4-4 3 3 5-7"/></svg>
            </span>
            <div class="min-w-0">
              <div class="text-xs font-bold uppercase tracking-[0.12em] text-slate-800">${isAllFiscalYears ? 'All FY' : `FY ${fyEnd}`} Project Summary</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Updates automatically with the active filters</div>
            </div>
          </div>
          <div class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Filtered portfolio
          </div>
        </div>
        <div class="px-3 py-2">
          <table class="w-full text-xs border-0" style="border-collapse:separate;border-spacing:0 3px">
          <thead>
            <tr class="text-[10px] uppercase tracking-wide text-slate-400">
              <th class="pb-0.5 px-3 text-left font-bold">Metric</th>
              <th class="pb-0.5 px-4 text-right font-bold">Projects</th>
              <th class="pb-0.5 px-3 text-right font-bold">Product Amount</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRow('Total Projects', fiscalProjects)}
            ${summaryRow('Resource Assigned', assignedProjects)}
            ${summaryRow('Resource Not Assigned', notAssignedProjects)}
            ${summaryRow('Closed Won', closedWonProjects)}
            ${summaryRow('Running Project', runningProjects)}
            ${summaryRow('Delayed Project', delayedProjects)}
            ${summaryRow('Closed Project', closedProjects)}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  const initialFiscalYearEnd = '';
  const initialRows = buildRows('', '', '', 'closed-won-desc', initialFiscalYearEnd);

  openModal(`${mHdr('All Projects', `${S.projects.length.toLocaleString()} total`)}
    <div class="modal-scroll-body">
      <div class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div class="px-5 pt-3 pb-2 flex items-start gap-3">
          <div class="pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 flex-shrink-0">Stage</div>
          <div class="flex flex-wrap gap-1.5" id="projStagePills">
            ${buildStagePills(initialFiscalYearEnd)}
          </div>
        </div>
        <div class="px-5 pb-3 grid grid-cols-2 md:grid-cols-[minmax(230px,1fr)_190px_120px_210px] items-end gap-2.5">
          <label class="min-w-0">
            <span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Search projects</span>
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input id="projModalSearch" type="text" placeholder="SA code, project or product name…"
                class="w-full min-w-0 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50/80 text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 placeholder-slate-400 transition-colors">
            </div>
          </label>
          <label class="min-w-0">
            <span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Product family</span>
            <select id="projModalProductFamilyFilter" aria-label="Product Family" title="Product Family" class="w-full min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300">
              <option value="">All Product Families</option>
              ${productFamilies.map(family => `<option value="${esc(family)}">${esc(family)}</option>`).join('')}
            </select>
          </label>
          <label class="min-w-0">
            <span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Fiscal year</span>
            <select id="projModalFiscalYear" aria-label="Select Fiscal Year" title="Select Fiscal Year" class="w-full min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300">
              <option value="" selected>All FY</option>
              ${fiscalYearEnds.map(fyEnd => `<option value="${fyEnd}">FY ${fyEnd}</option>`).join('')}
            </select>
          </label>
          <label class="min-w-0">
            <span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Sort by</span>
            <select id="projModalSort" class="w-full min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300">
              <option value="closed-won-desc" selected>Closed Won Date (DESC)</option>
              <option value="closed-won-asc">Closed Won Date (ASC)</option>
            </select>
          </label>
        </div>
      </div>
      <div class="px-5 py-3 bg-slate-50/60 border-b border-slate-100" id="projModalFiscalSummary">
        <div class="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-400 shadow-sm">Loading All FY summary…</div>
      </div>
      <div class="bg-slate-50/40 py-1.5" id="projModalList">
        ${initialRows.rowsHtml || '<p class="text-sm text-gray-400 text-center py-10">No projects found</p>'}
      </div>
    </div>
    <div class="modal-footer px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-white rounded-b-2xl">
      <div class="flex items-center gap-2 text-xs text-slate-500">
        <span class="inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
        <span id="projModalCount" class="font-semibold text-slate-700">${initialRows.count.toLocaleString()} project${initialRows.count === 1 ? '' : 's'}</span>
        <span>shown</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.downloadAllProjectsExcel()" class="btn-blue">Download Excel</button>
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>
    </div>`, 'max-w-5xl');

  let activeStage = '';
  let summaryRequestToken = 0;

  async function refreshFiscalSummary() {
    const fiscalYearEnd = document.getElementById('projModalFiscalYear')?.value ?? initialFiscalYearEnd;
    const searchQuery = document.getElementById('projModalSearch')?.value || '';
    const productFamily = document.getElementById('projModalProductFamilyFilter')?.value || '';
    const summary = document.getElementById('projModalFiscalSummary');
    if (!summary) return;

    const token = ++summaryRequestToken;
    summary.innerHTML = `<div class="text-xs text-gray-400">Loading ${fiscalYearEnd ? `FY ${fiscalYearEnd}` : 'All FY'} summary…</div>`;
    try {
      const html = await buildFiscalYearSummary(fiscalYearEnd, activeStage, searchQuery, productFamily);
      if (token === summaryRequestToken && document.getElementById('projModalFiscalSummary')) summary.innerHTML = html;
    } catch (error) {
      if (token === summaryRequestToken && document.getElementById('projModalFiscalSummary')) {
        summary.innerHTML = `<div class="text-xs text-red-500">Unable to load fiscal-year assignment summary: ${esc(error?.message || 'Unknown error')}</div>`;
      }
    }
  }

  function refresh() {
    const searchQuery = document.getElementById('projModalSearch')?.value || '';
    const productFamily = document.getElementById('projModalProductFamilyFilter')?.value || '';
    const sortMode = document.getElementById('projModalSort')?.value || 'closed-won-desc';
    const fiscalYearEnd = document.getElementById('projModalFiscalYear')?.value ?? initialFiscalYearEnd;
    const { rowsHtml, count } = buildRows(activeStage, searchQuery, productFamily, sortMode, fiscalYearEnd);
    const list = document.getElementById('projModalList');
    const countEl = document.getElementById('projModalCount');
    if (list) list.innerHTML = rowsHtml || '<p class="text-sm text-gray-400 text-center py-8">No projects found</p>';
    if (countEl) countEl.textContent = `${count} project${count === 1 ? '' : 's'}`;
  }

  document.getElementById('projModalSearch')?.addEventListener('input', () => {
    refresh();
    refreshFiscalSummary();
  });
  document.getElementById('projModalProductFamilyFilter')?.addEventListener('change', () => {
    refresh();
    refreshFiscalSummary();
  });
  document.getElementById('projModalSort')?.addEventListener('change', refresh);
  document.getElementById('projModalFiscalYear')?.addEventListener('change', () => {
    const fiscalYearEnd = document.getElementById('projModalFiscalYear')?.value ?? initialFiscalYearEnd;
    activeStage = '';
    const stagePills = document.getElementById('projStagePills');
    if (stagePills) stagePills.innerHTML = buildStagePills(fiscalYearEnd);
    refresh();
    refreshFiscalSummary();
  });

  document.getElementById('projStagePills')?.addEventListener('click', event => {
    const pill = event.target.closest('[data-stage-pill]');
    if (!pill) return;
    activeStage = pill.dataset.stagePill;
    document.querySelectorAll('#projStagePills [data-stage-pill]').forEach(item => {
      const isActive = item.dataset.stagePill === activeStage;
      item.classList.toggle('ring-2', isActive);
      item.classList.toggle('ring-offset-1', isActive);
      item.classList.toggle('ring-gray-400', isActive);
    });
    refresh();
    refreshFiscalSummary();
  });

  refreshFiscalSummary();
}

async function saveEmployeeWorkdays(empId, inputId, reopenTarget = 'team') {
  const input = document.getElementById(inputId);
  const workdays = Number(input?.value);

  if (!Number.isInteger(workdays) || workdays < 0) {
    toast('Workdays must be a non-negative whole number', 'error');
    input?.focus();
    return;
  }

  try {
    const updated = await api('PATCH', `/api/employees/${empId}/workdays`, { workdays });
    const idx = S.employees.findIndex(employee => employee.id === empId);
    if (idx >= 0) S.employees[idx] = { ...S.employees[idx], ...updated };

    buildMatrix();
    populateMatrixFilter();
    renderMatrix();
    renderYearlyWorkByProjectChart();
    renderProjectWisePeopleChart();
    renderMonthlyPlannedWorkChart();
    renderTeamSummaryChart();
    renderIndividualSummaryChart();
    if (typeof renderTeamUtilizationSummary === 'function') renderTeamUtilizationSummary();
    renderInsights();

    const stats = await api('GET', `/api/dashboard/stats?fiscalYear=${S.matrixFiscalYear}`);
    renderStats(stats);

    if (reopenTarget === 'maximum') openCapacityAllocationDetailsModal('maximum');
    else if (reopenTarget === 'days') openCapacityAllocationDetailsModal('days');
    else openResourceModal();

    toast(`${updated.name} Workdays updated to ${updated.workdays}`);
  } catch (error) {
    toast(error?.message || 'Failed to update Workdays', 'error');
  }
}

function currentPsTeamAssignmentMonthKey(date = new Date()) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  // Team assignment is recorded for the most recently completed calendar
  // month. Example: while the application is running in August 2026, the
  // Team Resources Assigned To control edits July 2026. This keeps manual
  // team membership aligned with the latest completed Time Sheet period.
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function psTeamAssignmentMonthLabel(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(monthKey || '');
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${MN[month - 1] || ''} ${year}`.trim();
}

function psTeamAssignmentDateLabel(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(isoDate || '');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${day} ${MN[month - 1] || ''} ${year}`;
}

function getCurrentPsTeamAssignment(employeeId) {
  return (S.psTeamAssignments?.current?.assignments || []).find(row => (
    Number(row.employeeId) === Number(employeeId)
  )) || null;
}

async function loadPsTeamAssignmentsForFiscalYear(fiscalYear = S.matrixFiscalYear) {
  const fy = normalizeFiscalYearStart(fiscalYear, S.matrixFiscalYear);
  const assignmentMonthKey = currentPsTeamAssignmentMonthKey();
  const assignmentMonthMatch = assignmentMonthKey.match(/^(\d{4})-(\d{2})$/);
  const assignmentYear = assignmentMonthMatch ? Number(assignmentMonthMatch[1]) : new Date().getFullYear();
  const assignmentMonth = assignmentMonthMatch ? Number(assignmentMonthMatch[2]) : new Date().getMonth() + 1;
  const data = await api('GET', `/api/ps-team-assignments?fiscalYear=${fy}&currentYear=${assignmentYear}&currentMonth=${assignmentMonth}`);
  if (fy !== S.matrixFiscalYear) return data;
  S.psTeamAssignments = data || { fiscalYear: fy, months: {}, current: { monthKey: '', assignments: [] } };
  return data;
}

async function saveEmployeePsTeamAssignment(employeeId, assignedTo, selectEl = null) {
  // Team Resources writes an effective-dated assignment for the most
  // recently completed calendar month. That value carries forward into later
  // months until a new manual assignment (or explicit unassignment) is saved.
  const currentMonth = String(
    S.psTeamAssignments?.current?.monthKey || currentPsTeamAssignmentMonthKey(),
  ).trim();
  if (!currentMonth) {
    toast('Unable to determine the current assignment month.', 'error');
    return;
  }
  if (!['', 'Local PS', 'Intra-Sourcing'].includes(assignedTo)) return;

  if (selectEl) selectEl.disabled = true;
  try {
    await api('PATCH', `/api/ps-team-assignments/${Number(employeeId)}`, {
      assignedTo,
      effectiveMonth: currentMonth,
    });
    await loadPsTeamAssignmentsForFiscalYear(S.matrixFiscalYear);
    // The Team Resources dropdown edits the most recently completed month.
    // Keep PS Team Utilization on that same reporting month after a change so
    // the user immediately sees the Time Sheet calculations that were just
    // affected, rather than a future/current month with no actual entries.
    if (typeof selectTeamUtilizationReportingMonth === 'function') {
      selectTeamUtilizationReportingMonth(currentMonth);
    }
    if (typeof renderTeamUtilizationSummary === 'function') renderTeamUtilizationSummary();
    openResourceModal();
    const employee = (S.employees || []).find(e => Number(e.id) === Number(employeeId));
    toast(assignedTo
      ? `${employee?.name || 'Resource'} assigned to ${assignedTo} from ${psTeamAssignmentMonthLabel(currentMonth)} onward`
      : `${employee?.name || 'Resource'} is unassigned from ${psTeamAssignmentMonthLabel(currentMonth)} onward`);
  } catch (error) {
    toast(error.message || 'Failed to update Assigned To', 'error');
    if (selectEl) selectEl.disabled = false;
  }
}

window.saveEmployeePsTeamAssignment = saveEmployeePsTeamAssignment;
