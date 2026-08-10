/* Workforce Allocation Dashboard — projects/resources.js */

function openResourceModal() {
  const activeEmps = S.employees.filter(e => e.active !== 0);
  const inactiveEmps = S.employees.filter(e => e.active === 0);

  const empRow = (e) => {
    const isActive = e.active !== 0;
    const util = S.employeeUtil ? (S.employeeUtil.get(e.id) || 0) : 0;
    const clr = uc(util), badge = ub(util);
    const searchText = [
      e.employee_code,
      e.name,
      e.email,
      e.dept,
      e.designation,
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
    ? `<table class="w-full text-left border-collapse">
        <thead><tr class="border-b border-gray-200">
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Code</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Name</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Dept</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Designation</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Workdays</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Util</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Status</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Edit</th>
        </tr></thead>
        <tbody>${emps.map(empRow).join('')}</tbody>
      </table>`
    : '<p class="text-sm text-gray-400 py-4 px-4">None</p>';

  openModal(
    mHdr('Team Resources', `${activeEmps.length} active · ${inactiveEmps.length} inactive · productivity calculated on active only`)
    + `<div class="modal-scroll-body nice-scroll">
        <div class="sticky top-0 z-10 px-4 py-3 border-b border-gray-200 bg-white">
          <label for="teamResourcesSearch" class="sr-only">Search team resources</label>
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="teamResourcesSearch" type="search" autocomplete="off"
              placeholder="Search by name, code, email, department, designation or status..."
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
    'max-w-7xl'
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

  const stageCounts = {};
  for (const p of S.projects) stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;

  const STAGE_ORDER = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won', 'Closed Lost'];

  const summaryPills = Object.entries(stageCounts)
    .sort((a, b) => STAGE_ORDER.indexOf(a[0]) - STAGE_ORDER.indexOf(b[0]))
    .map(([stage, count]) => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_PILL[stage] || 'bg-gray-100 text-gray-700'} cursor-pointer hover:opacity-75 transition-opacity" data-stage-pill="${esc(stage)}">${esc(stage)}: ${count}</span>`)
    .join('');

  function isProfessionalServiceProject(project) {
    return typeof classifyProduct === 'function'
      ? classifyProduct(project?.product_name, project?.product_family) === 'PS'
      : (() => {
          const compact = String(project?.product_name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return compact.includes('PSSYSTEMSUPPORT') || [
            'PSPROJECTIMPLEMENTATION',
            'PSPROJECTIMPLEMENT',
            'PSPROJECTIMPLEMETATION',
            'PSPROJECTIMPLEMENTAION',
          ].some(variant => compact.includes(variant));
        })();
  }

  function sortProjects(list, sortMode) {
    if (sortMode === 'closed-won-desc') {
      return [...list].sort((a, b) => {
        const aDate = String(a.end_date || '');
        const bDate = String(b.end_date || '');
        if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return Number(b.id || 0) - Number(a.id || 0);
      });
    }

    return [...list].sort((a, b) => {
      const stageDiff = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
      return stageDiff || Number(a.id || 0) - Number(b.id || 0);
    });
  }

  function buildRows(filterStage, searchQ, projectType, sortMode) {
    const q = (searchQ || '').toLowerCase().trim();
    const filtered = projects.filter(p => {
      if (filterStage && p.stage !== filterStage) return false;
      if (projectType === 'ps' && !isProfessionalServiceProject(p)) return false;
      if (!q) return true;
      return (p.code || '').toLowerCase().includes(q)
        || (p.name || '').toLowerCase().includes(q)
        || (p.product_name || '').toLowerCase().includes(q)
        || (p.fiscal_period || '').toLowerCase().includes(q);
    });

    const sorted = sortProjects(filtered, sortMode);
    const rowsHtml = sorted.map((p, i) => {
      const progress = Math.max(0, Math.min(100, Number(p.progress) || 0));
      return `
      <div class="flex items-start gap-3 py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer last:border-0" data-action="edit-project" data-project="${p.id}">
        <span class="text-xs font-semibold text-gray-400 w-5 flex-shrink-0 pt-0.5">${i + 1}</span>
        <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style="background:${p.color || '#8B5CF6'}"></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5 flex-wrap">
            <span class="text-xs font-bold text-blue-600 mono">${esc(p.code)}</span>
            <span class="px-1.5 py-0.5 rounded text-xs font-semibold ${STAGE_PILL[p.stage] || 'bg-gray-100 text-gray-700'}">${esc(p.stage)}</span>
            ${p.fiscal_period ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">${esc(p.fiscal_period)}</span>` : ''}
            ${p.product_family ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(p.product_family)}</span>` : ''}
          </div>
          <div class="text-sm font-semibold text-gray-900 truncate">${esc(p.name)}</div>
          <div class="text-xs text-gray-500 truncate">${esc(p.account_name || p.client || '—')}${p.opportunity_owner ? ` · ${esc(p.opportunity_owner)}` : ''}</div>
          ${p.product_name ? `<div class="text-xs text-gray-400 truncate mt-0.5">${esc(p.product_name)}</div>` : ''}
        </div>
        <div class="text-right flex-shrink-0 min-w-[190px] space-y-0.5">
          <div class="text-xs font-bold text-gray-800 mono">${(p.product_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} USD</div>
          <div class="text-[11px] text-gray-500">Closed Won Date: <span class="font-semibold text-gray-700">${esc(p.end_date || '—')}</span></div>
          <div class="text-[11px] text-gray-500">Project Close Date: <span class="font-semibold text-gray-700">${esc(p.project_closing_date || '—')}</span></div>
          <div class="text-[11px] text-gray-500">Progress: <span class="font-semibold text-gray-700">${progress.toFixed(progress % 1 ? 1 : 0)}%</span></div>
        </div>
      </div>`;
    }).join('');

    return { rowsHtml, count: sorted.length };
  }

  openModal(`${mHdr('All Projects', `${S.projects.length} total`)}
    <div class="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-1.5" id="projStagePills">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700 cursor-pointer hover:opacity-75 transition-opacity" data-stage-pill="">All</span>
      ${summaryPills}
    </div>
    <div class="px-4 py-3 border-b border-gray-100 bg-white grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_210px_220px] gap-2">
      <input id="projModalSearch" type="text" placeholder="Search by SA code, project name, or product name…"
        class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400">
      <select id="projModalTypeFilter" class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent">
        <option value="">All Project Types</option>
        <option value="ps">PS / Professional Service</option>
      </select>
      <select id="projModalSort" class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent">
        <option value="closed-won-desc" selected>Closed Won Date (Desc)</option>
        <option value="stage">Stage</option>
      </select>
    </div>
    <div class="overflow-y-auto nice-scroll" id="projModalList" style="max-height:55vh">
      ${buildRows('', '', '', 'closed-won-desc').rowsHtml || '<p class="text-sm text-gray-400 text-center py-8">No projects found</p>'}
    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
      <span class="text-xs text-gray-400" id="projModalCount">${S.projects.length} project${S.projects.length === 1 ? '' : 's'}</span>
      <div class="flex items-center gap-2">
        <button onclick="window.downloadAllProjectsExcel()" class="btn-blue">Download Excel</button>
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>
    </div>`, 'max-w-5xl');

  let activeStage = '';

  function refresh() {
    const q = document.getElementById('projModalSearch')?.value || '';
    const projectType = document.getElementById('projModalTypeFilter')?.value || '';
    const sortMode = document.getElementById('projModalSort')?.value || 'closed-won-desc';
    const { rowsHtml, count } = buildRows(activeStage, q, projectType, sortMode);
    const list = document.getElementById('projModalList');
    const countEl = document.getElementById('projModalCount');
    if (list) list.innerHTML = rowsHtml || '<p class="text-sm text-gray-400 text-center py-8">No projects found</p>';
    if (countEl) countEl.textContent = `${count} project${count === 1 ? '' : 's'}`;
  }

  document.getElementById('projModalSearch')?.addEventListener('input', refresh);
  document.getElementById('projModalTypeFilter')?.addEventListener('change', refresh);
  document.getElementById('projModalSort')?.addEventListener('change', refresh);

  document.getElementById('projStagePills')?.addEventListener('click', e => {
    const pill = e.target.closest('[data-stage-pill]');
    if (!pill) return;
    activeStage = pill.dataset.stagePill;
    document.querySelectorAll('#projStagePills [data-stage-pill]').forEach(p => {
      const isActive = p.dataset.stagePill === activeStage;
      p.classList.toggle('ring-2', isActive);
      p.classList.toggle('ring-offset-1', isActive);
      p.classList.toggle('ring-gray-400', isActive);
    });
    refresh();
  });
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
