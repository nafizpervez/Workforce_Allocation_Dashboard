/* Workforce Allocation Dashboard — projects/lists.js */

/* ================================================================ RUNNING PROJECTS */
function runningProjectRowHtml(d) {
  const barColor = '#10B981';
  const amount = fmtUsd(d.product_amount || 0);
  const closingDate = d.project_closing_date || d.closing_date || '';
  const today = new Date();
  const daysVal = closingDate ? Math.round((new Date(closingDate) - today) / 864e5) : null;
  const isPast = daysVal !== null && daysVal < 0;
  const isSoon = daysVal !== null && daysVal >= 0 && daysVal < 14;
  const status = daysVal === null ? '—' : isPast ? 'PS Work Begins' : isSoon ? 'Due Soon' : 'On Track';
  const statC = isPast ? 'text-green-600' : isSoon ? 'text-orange-500' : 'text-green-600';
  const absD = Math.abs(daysVal || 0);
  const daysLabel = daysVal === null ? '' : daysVal === 0 ? 'Today' : isPast ? `${absD} days ago` : `in ${daysVal} days`;
  const daysColor = isPast ? 'text-green-600' : isSoon ? 'text-orange-500' : 'text-gray-500';

  return `<div class="px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer relative" data-action="edit-project" data-project="${d.id}">
    <div class="absolute left-0 top-0 bottom-0 w-1 rounded-r" style="background:${barColor}"></div>
    <div class="ml-2">
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="text-xs font-bold text-blue-600 mono tracking-wide">${esc(d.code)}</span>
        <span class="text-sm font-bold text-gray-800 mono flex-shrink-0">${amount}</span>
      </div>
      <div class="text-sm font-semibold text-gray-900 mb-1 leading-snug">${esc(d.name)}</div>
      ${(d.account_name || d.client) ? `<div class="text-xs text-gray-600 mb-1"><span class="font-medium">${esc(d.account_name || d.client || '—')}</span>${d.product_name ? `<span class="text-gray-400 mx-1">·</span><span class="text-gray-500">${esc(d.product_name)}</span>` : ''}</div>` : ''}
      ${(d.product_family || d.product_name) ? `<div class="mb-1 flex items-center gap-1.5 flex-wrap">${d.product_family ? `<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(d.product_family)}</span>` : ''}${d.product_name ? `<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">${esc(d.product_name)}</span>` : ''}</div>` : ''}
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-green-100 text-green-700">Closed Won</span>
          ${dealStatusBadge(d.deal_status)}
          ${d.opportunity_owner ? `<span class="text-xs text-gray-500 truncate">${esc(d.opportunity_owner)}</span>` : ''}
        </div>
        ${d.end_date ? `<span class="text-xs text-gray-500 flex-shrink-0">Closed Won Date: <span class="font-medium text-gray-700">${esc(d.end_date)}</span></span>` : ''}
      </div>
      ${closingDate ? `<div class="flex items-center gap-1.5 text-xs mb-2">
        <svg class="w-3 h-3 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span class="text-gray-500">Project Closing Date: <span class="font-medium text-gray-700">${esc(closingDate)}</span></span>
        <span class="font-semibold ${daysColor}">${daysLabel}</span>
        <span class="ml-auto font-semibold ${statC}">${status}</span>
      </div>` : '<div class="mb-2"></div>'}
      <div class="flex items-center gap-2">
        <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${d.progress || 0}%;background:${barColor}"></div></div>
        <span class="text-xs font-medium text-gray-600 w-8 text-right">${d.progress || 0}%</span>
      </div>
    </div>
  </div>`;
}

function applyAndRenderRunning() {
  const el = document.getElementById('runningProjectsList');
  if (!el) return;
  const filtered = applyRunningFilters(S.lastRunningData);
  el.innerHTML = filtered.map(runningProjectRowHtml).join('') || '<div class="px-6 py-8 text-center text-sm text-gray-400">No running projects</div>';
}

function renderRunningProjects(data) { S.lastRunningData = data; applyAndRenderRunning(); }


function professionalServicesRevenueRowHtml(project, basis) {
  const amount = fmtUsd(project.product_amount || 0);
  const stageClass = STAGE_PILL[project.stage] || 'bg-gray-100 text-gray-700';
  const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));

  return `<div class="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer last:border-0" data-action="edit-project" data-project="${project.id}">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 flex-wrap mb-1">
          <span class="text-xs font-bold text-blue-600 mono">${esc(project.code || '—')}</span>
          <span class="px-1.5 py-0.5 rounded text-[11px] font-semibold ${stageClass}">${esc(project.stage || '—')}</span>
          ${project.deal_status ? dealStatusBadge(project.deal_status) : ''}
        </div>
        <div class="text-sm font-semibold text-gray-900 leading-snug">${esc(project.name || '—')}</div>
        <div class="text-xs text-gray-500 mt-0.5 truncate">${esc(project.account_name || project.client || '—')}</div>
        ${project.product_name ? `<div class="text-[11px] text-gray-400 mt-0.5 truncate">${esc(project.product_name)}</div>` : ''}
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-sm font-bold text-gray-800 mono">${amount}</div>
      </div>
    </div>
    <div class="mt-2 grid grid-cols-1 gap-0.5 text-[11px] text-gray-500">
      <div>Closed Won Date: <span class="font-semibold text-gray-700">${esc(project.end_date || '—')}</span></div>
      <div>Project Close Date: <span class="font-semibold text-gray-700">${esc(project.project_closing_date || '—')}</span></div>
      <div>Progress: <span class="font-semibold text-gray-700">${progress.toFixed(progress % 1 ? 1 : 0)}%</span></div>
    </div>
  </div>`;
}

const RUNNING_PROJECT_METRIC_MODAL_CONFIG = Object.freeze({
  delayed: Object.freeze({
    title: 'Delayed Professional Services Projects',
    empty: 'No delayed Professional Services projects',
  }),
  'on-time': Object.freeze({
    title: 'On-Time Professional Services Projects',
    empty: 'No on-time Professional Services projects',
  }),
  revenue: Object.freeze({
    title: 'Professional Services Revenue Projects',
    empty: 'No Professional Services running projects',
  }),
});

async function openRunningProjectMetricModal(metric) {
  const config = RUNNING_PROJECT_METRIC_MODAL_CONFIG[metric];
  if (!config) return;

  openModal(`
    ${mHdr(config.title, 'Loading project list…')}
    <div class="p-8 text-center text-sm text-gray-400">Loading…</div>
    <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
      <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, metric === 'revenue' ? 'max-w-6xl' : 'max-w-4xl');

  try {
    const result = await api(
      'GET',
      `/api/dashboard/running-project-metrics?metric=${encodeURIComponent(metric)}&fiscalYear=${encodeURIComponent(S.matrixFiscalYear)}`,
    );

    if (metric === 'revenue') {
      const realizationProjects = Array.isArray(result.revenue_realization_projects)
        ? result.revenue_realization_projects
        : [];
      const securedProjects = Array.isArray(result.revenue_secured_projects)
        ? result.revenue_secured_projects
        : [];
      const fyLabel = fiscalYearDisplayLabel(S.matrixFiscalYear);

      openModal(`
        ${mHdr(
          config.title,
          `${fyLabel} · Professional Services projects classified by realization and secured revenue`,
        )}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-gray-50">
          <section class="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-0">
            <div class="px-4 py-3 border-b border-gray-200 bg-blue-50/70">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-bold text-gray-900">Revenue Realization</div>
                  <div class="text-[11px] text-gray-500 mt-0.5">Project Closing Date in ${fyLabel} · Progress = 100%</div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-sm font-bold text-blue-700">${fmtUsd(result.revenue_realization_total || 0)}</div>
                  <div class="text-[11px] text-gray-500">${realizationProjects.length} project${realizationProjects.length === 1 ? '' : 's'}</div>
                </div>
              </div>
            </div>
            <div class="nice-scroll overflow-y-auto" style="max-height:58vh">
              ${realizationProjects.length
                ? realizationProjects.map(project => professionalServicesRevenueRowHtml(project, 'realization')).join('')
                : '<div class="px-5 py-10 text-center text-sm text-gray-400">No Revenue Realization projects in this fiscal year</div>'}
            </div>
          </section>

          <section class="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-0">
            <div class="px-4 py-3 border-b border-gray-200 bg-emerald-50/70">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-bold text-gray-900">Revenue Secured</div>
                  <div class="text-[11px] text-gray-500 mt-0.5">Closed Won Date in ${fyLabel}</div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-sm font-bold text-emerald-700">${fmtUsd(result.revenue_secured_total || 0)}</div>
                  <div class="text-[11px] text-gray-500">${securedProjects.length} project${securedProjects.length === 1 ? '' : 's'}</div>
                </div>
              </div>
            </div>
            <div class="nice-scroll overflow-y-auto" style="max-height:58vh">
              ${securedProjects.length
                ? securedProjects.map(project => professionalServicesRevenueRowHtml(project, 'secured')).join('')
                : '<div class="px-5 py-10 text-center text-sm text-gray-400">No Revenue Secured projects in this fiscal year</div>'}
            </div>
          </section>
        </div>
        <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
          <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
        </div>
      `, 'max-w-6xl');
      return;
    }

    const projects = Array.isArray(result.projects) ? result.projects : [];
    openModal(`
      ${mHdr(
        config.title,
        `${projects.length} project${projects.length === 1 ? '' : 's'} · Closed Won Mar 1, 2025 or later`,
      )}
      <div class="nice-scroll overflow-y-auto" style="max-height:68vh">
        ${projects.length
          ? projects.map(runningProjectRowHtml).join('')
          : `<div class="px-6 py-12 text-center text-sm text-gray-400">${esc(config.empty)}</div>`}
      </div>
      <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
        <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
      </div>
    `, 'max-w-4xl');
  } catch (error) {
    closeModal();
    toast(error.message, 'error');
  }
}


const PROJECT_PORTFOLIO_MODAL_CONFIG = Object.freeze({
  running: Object.freeze({
    title: 'Running Professional Services Projects',
    empty: 'No running Professional Services projects in the Closed Won date window',
    subtitle: 'Closed Won from March 1, 2025 onward · progress below 100%',
  }),
  weighted: Object.freeze({
    title: 'Weighted Prospects',
    empty: 'No non-Closed Won projects with probability at or above 75%',
    subtitle: 'Stage is not Closed Won · probability ≥ 75%',
  }),
  prospect: Object.freeze({
    title: 'Prospects',
    empty: 'No non-Closed Won projects with probability below 75%',
    subtitle: 'Stage is not Closed Won · probability < 75%',
  }),
});

async function openProjectPortfolioMetricModal(metric) {
  const config = PROJECT_PORTFOLIO_MODAL_CONFIG[metric];
  if (!config) return;

  openModal(`
    ${mHdr(config.title, 'Loading project list…')}
    <div class="p-8 text-center text-sm text-gray-400">Loading…</div>
    <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
      <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, 'max-w-4xl');

  try {
    const result = await api(
      'GET',
      `/api/dashboard/project-portfolio-metrics?metric=${encodeURIComponent(metric)}&fiscalYear=${encodeURIComponent(S.matrixFiscalYear)}`,
    );
    const projects = Array.isArray(result.projects) ? result.projects : [];
    const rowRenderer = metric === 'running'
      ? runningProjectRowHtml
      : servicePipelineRowHtml;

    openModal(`
      ${mHdr(
        config.title,
        `${projects.length.toLocaleString()} project${projects.length === 1 ? '' : 's'} · ${config.subtitle}`,
      )}
      <div class="nice-scroll modal-scroll-body">
        ${projects.length
          ? projects.map(rowRenderer).join('')
          : `<div class="px-6 py-12 text-center text-sm text-gray-400">${esc(config.empty)}</div>`}
      </div>
      <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
        <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
      </div>
    `, 'max-w-4xl');
  } catch (error) {
    closeModal();
    toast(error.message, 'error');
  }
}

/* ================================================================ SERVICE PIPELINE */
function servicePipelineRowHtml(p) {
  const barColor = STAGE_COLOR[p.stage] || '#6B7280', pillCls = STAGE_PILL[p.stage] || 'bg-gray-100 text-gray-700';
  const amount = fmtUsd(p.product_amount ?? 0);
  let projCloseDateHtml = '<div class="text-xs text-gray-400 mt-0.5">Project Close Date: —</div>';
  if (p.project_closing_date) {
    const today = new Date(), dv = Math.round((new Date(p.project_closing_date) - today) / 864e5);
    const isPast = dv < 0, lbl = dv === 0 ? 'Today' : isPast ? `${Math.abs(dv)} days ago` : `${dv} days left`;
    const lc = isPast ? 'text-green-600' : 'text-red-500';
    projCloseDateHtml = `<div class="text-xs text-gray-500 mt-0.5">Project Close Date: <span class="font-medium text-gray-700">${esc(p.project_closing_date)}</span> <span class="font-semibold ${lc}">${lbl}</span></div>`;
  }
  return `<div class="px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer relative" data-action="edit-project" data-project="${p.id}">
    <div class="absolute left-0 top-0 bottom-0 w-1 rounded-r" style="background:${barColor}"></div>
    <div class="ml-2">
      <div class="flex items-center justify-between gap-2 mb-1"><span class="text-xs font-bold text-blue-600 mono tracking-wide">${esc(p.code)}</span><span class="text-sm font-bold text-gray-800 mono flex-shrink-0">${amount}</span></div>
      <div class="text-sm font-semibold text-gray-900 mb-1 leading-snug">${esc(p.name)}</div>
      <div class="text-xs text-gray-600 mb-1"><span class="font-medium">${esc(p.account_name || p.client || '—')}</span>${p.product_name ? `<span class="text-gray-400 mx-1">·</span><span class="text-gray-500">${esc(p.product_name)}</span>` : ''}</div>
      ${p.product_family ? `<div class="mb-1"><span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(p.product_family)}</span></div>` : ''}
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-1.5 min-w-0 pt-0.5 flex-wrap"><span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${pillCls}">${esc(p.stage)}</span>${dealStatusBadge(p.deal_status)}${p.opportunity_owner ? `<span class="text-xs text-gray-500 truncate">${esc(p.opportunity_owner)}</span>` : ''}</div>
        <div class="text-right flex-shrink-0 ml-3">${p.end_date ? `<div class="text-xs text-gray-500">Close Date: <span class="font-medium text-gray-700">${esc(p.end_date)}</span></div>` : ''}${projCloseDateHtml}</div>
      </div>
      <div class="flex items-center gap-2"><div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${p.progress || 0}%;background:${barColor}"></div></div><span class="text-xs font-medium text-gray-600 w-8 text-right">${p.progress || 0}%</span></div>
    </div>
  </div>`;
}

function applyAndRenderPipeline() {
  const filtered = applyPipelineFilters(getServicePipelineBaseProjects());
  document.getElementById('pipelineList').innerHTML = filtered.map(servicePipelineRowHtml).join('') || `<div class="px-6 py-8 text-center text-sm text-gray-400">No FY ${getServicePipelineFiscalYear()} service pipeline projects</div>`;
}

function renderServicePipeline(projects) { applyAndRenderPipeline(); }

/* ── Populate Product Family / Product Type dropdowns ───────────────────────── */
function populateProductFamilyDropdowns() {
  const selectedFyRunningProjects = (S.lastRunningData || []).filter(project => isRunningProjectInMatrixFiscalYear(project));
  const runFamilies = [...new Set(selectedFyRunningProjects.map(d => d.product_family).filter(Boolean))].sort();
  const servicePipelineProjects = getServicePipelineBaseProjects();
  const pipeFamilies = [...new Set(servicePipelineProjects.map(p => p.product_family).filter(Boolean))].sort();
  const runProductTypes = uniqueNormalizedProductTypes(selectedFyRunningProjects);
  const pipeProductTypes = uniqueNormalizedProductTypes(servicePipelineProjects);
  const fillSelect = (id, opts, allLabel, normalize = false) => { const el = document.getElementById(id); if (!el) return; const cur = normalize ? normalizeProductTypeName(el.value) : el.value; el.innerHTML = `<option value="">${allLabel}</option>` + opts.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join(''); el.value = opts.includes(cur) ? cur : ''; };
  fillSelect('runProdFamilyFilt', runFamilies, 'All Families');
  fillSelect('pipeProdFamilyFilt', pipeFamilies, 'All Families');
  fillSelect('runProductTypeFilt', runProductTypes, 'All Product Name', true);
  fillSelect('pipeProductTypeFilt', pipeProductTypes, 'All Product Name', true);
}

