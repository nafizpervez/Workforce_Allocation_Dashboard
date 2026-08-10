/* Workforce Allocation Dashboard — ui/events.js */

function getMatrixSelectedAssignmentSet() {
  if (!(S.matrixSelectedAssignmentIds instanceof Set)) {
    S.matrixSelectedAssignmentIds = new Set();
  }
  return S.matrixSelectedAssignmentIds;
}

function updateMatrixAssignmentChipSelection(chip, selected) {
  if (!chip) return;
  chip.classList.toggle('is-selected', selected);
  chip.setAttribute('aria-selected', selected ? 'true' : 'false');
}

function clearMatrixAssignmentSelection() {
  getMatrixSelectedAssignmentSet().clear();
  document.querySelectorAll('#matrixTable .chip.is-selected').forEach(chip => {
    updateMatrixAssignmentChipSelection(chip, false);
  });
}

function openMatrixAssignmentChip(chip) {
  if (!chip) return;
  openAssignmentModal({
    id: Number(chip.dataset.id),
    year: Number(chip.dataset.year),
    month: Number(chip.dataset.month),
    week: Number(chip.dataset.week),
    start_date: chip.dataset.start,
    end_date: chip.dataset.end,
  });
}

function toggleMatrixAssignmentChipSelection(chip) {
  const id = Number(chip?.dataset.id);
  if (!id) return;

  const selectedIds = getMatrixSelectedAssignmentSet();
  const shouldSelect = !selectedIds.has(id);

  if (shouldSelect) selectedIds.add(id);
  else selectedIds.delete(id);

  updateMatrixAssignmentChipSelection(chip, shouldSelect);
}

function ensureMatrixAssignmentChipSelected(chip) {
  const id = Number(chip?.dataset.id);
  if (!id) return;

  const selectedIds = getMatrixSelectedAssignmentSet();
  selectedIds.add(id);
  updateMatrixAssignmentChipSelection(chip, true);
}

/* ================================================================ EVENTS */
function initEvents() {
  const matrixFiscalYearInput = document.getElementById('matrixFiscalYearInput');
  const commitMatrixFiscalYearInput = async () => {
    const endYear = Math.trunc(Number(matrixFiscalYearInput?.value));
    if (!Number.isFinite(endYear) || endYear < 1901 || endYear > 9999) {
      syncMatrixFiscalYearControl();
      toast('Enter a fiscal-year ending year between 1901 and 9999.', 'error');
      return;
    }
    await changeMatrixFiscalYear(endYear - 1);
  };

  document.getElementById('matrixFiscalYearPrevBtn')?.addEventListener('click', () => {
    changeMatrixFiscalYear(S.matrixFiscalYear - 1);
  });
  document.getElementById('matrixFiscalYearNextBtn')?.addEventListener('click', () => {
    changeMatrixFiscalYear(S.matrixFiscalYear + 1);
  });
  matrixFiscalYearInput?.addEventListener('change', commitMatrixFiscalYearInput);
  matrixFiscalYearInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitMatrixFiscalYearInput();
      matrixFiscalYearInput.blur();
    }
  });
  syncMatrixFiscalYearControl();
  const addBtn = document.getElementById('addMenuBtn'), addMenu = document.getElementById('addMenu');
  addBtn.addEventListener('click', e => { e.stopPropagation(); addMenu.classList.toggle('hidden'); });
  document.addEventListener('click', () => addMenu.classList.add('hidden'));
  addMenu.querySelectorAll('button[data-add]').forEach(b => b.addEventListener('click', () => {
    addMenu.classList.add('hidden');
    if (b.dataset.add === 'resource') openEmployeeModal();
    if (b.dataset.add === 'project') openProjectModal();
    if (b.dataset.add === 'assignment') openAssignmentModal();
    if (b.dataset.add === 'project-excel-historical') document.getElementById('historicalProjectExcelUpload')?.click();
    if (b.dataset.add === 'project-excel-forecast') document.getElementById('forecastProjectExcelUpload')?.click();
    if (b.dataset.add === 'assignment-excel') document.getElementById('assignmentExcelUpload')?.click();
  }));

  if (typeof initFiscalYearReportExport === 'function') initFiscalYearReportExport();

  document.getElementById('searchBox').addEventListener('input', e => { S.searchQuery = e.target.value; renderMatrix(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* Matrix filter listeners */
  const mfBind = (id, key) => { const el = document.getElementById(id); if (el) el.addEventListener('change', e => { S[key] = e.target.value || null; renderMatrix(); }); };
  mfBind('matrixProjectFilter', 'matrixProjectFilter');
  mfBind('matrixResourceFilter', 'matrixResourceFilter');
  document.getElementById('matrixMonthFilter')?.addEventListener('change', e => { S.matrixMonthFilter = e.target.value; renderMatrix(); });
  document.getElementById('matrixStageFilter')?.addEventListener('change', e => { S.matrixStageFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixAmountFilter')?.addEventListener('change', e => { S.matrixAmountFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixCloseDateFilter')?.addEventListener('change', e => { S.matrixCloseDateFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixProjCloseFilter')?.addEventListener('change', e => { S.matrixProjCloseFilt = e.target.value; renderMatrix(); });

  function bindSortBtn(id, activeKey, clearKeys) {
    const btn = document.getElementById(id); if (!btn) return;
    btn.addEventListener('click', () => {
      S[activeKey] = !S[activeKey];
      if (S[activeKey]) clearKeys.forEach(k => S[k] = false);
      btn.classList.toggle('active', S[activeKey]);
      clearKeys.forEach(k => { const el = document.getElementById({ 'matrixSortHigh': 'matrixSortHighBtn', 'matrixSortLow': 'matrixSortLowBtn', 'matrixSortAssigned': 'matrixSortAssignedBtn' }[k]); if (el) el.classList.remove('active'); });
      renderMatrix();
    });
  }
  bindSortBtn('matrixSortHighBtn', 'matrixSortHigh', ['matrixSortLow', 'matrixSortAssigned']);
  bindSortBtn('matrixSortLowBtn', 'matrixSortLow', ['matrixSortHigh', 'matrixSortAssigned']);
  bindSortBtn('matrixSortAssignedBtn', 'matrixSortAssigned', ['matrixSortHigh', 'matrixSortLow']);

  /* Pipeline filter listeners */
  document.getElementById('pipeStageFilt')?.addEventListener('change', e => { S.pipelineStageFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeDealStatusFilt')?.addEventListener('change', e => { S.pipelineDealStatusFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeAmountFilt')?.addEventListener('change', e => { S.pipelineAmountFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeCloseFilt')?.addEventListener('change', e => { S.pipelineCloseFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProjCloseFilt')?.addEventListener('change', e => { S.pipelineProjCloseFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProdFamilyFilt')?.addEventListener('change', e => { S.pipelineProdFamilyFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProductTypeFilt')?.addEventListener('change', e => { S.pipelineProductTypeFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeSearch')?.addEventListener('input', e => { S.pipelineSearch = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeSortAssignedBtn')?.addEventListener('click', () => { S.pipelineSortAssigned = !S.pipelineSortAssigned; document.getElementById('pipeSortAssignedBtn').classList.toggle('active', S.pipelineSortAssigned); applyAndRenderPipeline(); });

  /* Running filter listeners */
  document.getElementById('runAmountFilt')?.addEventListener('change', e => { S.runAmountFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runCloseFilt')?.addEventListener('change', e => { S.runCloseFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProjCloseFilt')?.addEventListener('change', e => { S.runProjCloseFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProdFamilyFilt')?.addEventListener('change', e => { S.runProdFamilyFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProductTypeFilt')?.addEventListener('change', e => { S.runProductTypeFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runSearch')?.addEventListener('input', e => { S.runSearch = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runSortAssignedBtn')?.addEventListener('click', () => { S.runSortAssigned = !S.runSortAssigned; document.getElementById('runSortAssignedBtn').classList.toggle('active', S.runSortAssigned); applyAndRenderRunning(); });

  /* Matrix table click */
  const matrixTable = document.getElementById('matrixTable');
  matrixTable.addEventListener('click', e => {
    const selectedAssignments = getMatrixSelectedAssignmentSet();
    const hadSelectedAssignments = selectedAssignments.size > 0;
    const clickedAssignmentChip = e.target.closest('[data-action="edit-assign"]');
    const clickedAssignmentDelete = e.target.closest('[data-action="delete-assign"]');
    if (!clickedAssignmentChip && !clickedAssignmentDelete) {
      clearMatrixAssignmentSelection();
    }

    const revenueCell = e.target.closest('[data-action="open-revenue-breakdown"]');
    if (revenueCell) {
      e.stopPropagation();
      const employeeId = revenueCell.dataset.employeeId
        ? Number(revenueCell.dataset.employeeId)
        : null;
      const revenueKey = revenueCell.dataset.revenueKey ||
        revenueCell.dataset.totalMetric ||
        revenueCell.dataset.summaryMetric;
      openRevenueBreakdownModal(revenueKey, employeeId);
      return;
    }

    const del = clickedAssignmentDelete;
    if (del) {
      e.stopPropagation();
      deleteAssignment(Number(del.dataset.id), { includeMatrixSelection: true });
      return;
    }

    const chip = clickedAssignmentChip;
    if (chip) {
      e.stopPropagation();
      // The first click in a click sequence toggles selection. The second
      // click of an immediate double-click is ignored here and handled by
      // the dedicated dblclick listener below.
      if (e.detail === 1) toggleMatrixAssignmentChipSelection(chip);
      return;
    }

    const employee = e.target.closest('[data-action="edit-emp"]');
    if (employee) {
      e.stopPropagation();
      openEmployeeModal({ id: Number(employee.dataset.emp) });
      return;
    }

    const cell = e.target.closest('td.cell');
    if (cell) {
      // Selection takes priority over creating a new assignment. The first
      // empty-cell click after one or more assignments were selected only
      // clears that selection; a later click can open Add Assignment.
      if (hadSelectedAssignments) return;

      openAssignmentModal({
        employee_id: Number(cell.dataset.emp),
        year: Number(cell.dataset.year),
        month: Number(cell.dataset.month),
        week: Number(cell.dataset.week),
        start_date: cell.dataset.start,
        end_date: cell.dataset.end,
      });
    }
  });

  matrixTable.addEventListener('dblclick', e => {
    if (e.target.closest('[data-action="delete-assign"]')) return;

    const chip = e.target.closest('[data-action="edit-assign"]');
    if (!chip) return;

    e.preventDefault();
    e.stopPropagation();
    ensureMatrixAssignmentChipSelected(chip);
    openMatrixAssignmentChip(chip);
  });

  document.addEventListener('click', e => {
    if (!getMatrixSelectedAssignmentSet().size) return;
    if (e.target.closest('#matrixTable [data-action="edit-assign"]')) return;
    if (e.target.closest('#matrixTable [data-action="delete-assign"]')) return;
    clearMatrixAssignmentSelection();
  });

  matrixTable.addEventListener('keydown', e => {
    if (!['Enter', ' '].includes(e.key)) return;

    const chip = e.target.closest('[data-action="edit-assign"]');
    if (chip) {
      e.preventDefault();
      toggleMatrixAssignmentChipSelection(chip);
      return;
    }

    const revenueCell = e.target.closest('[data-action="open-revenue-breakdown"]');
    if (!revenueCell) return;
    e.preventDefault();
    const employeeId = revenueCell.dataset.employeeId
      ? Number(revenueCell.dataset.employeeId)
      : null;
    const revenueKey = revenueCell.dataset.revenueKey ||
      revenueCell.dataset.totalMetric ||
      revenueCell.dataset.summaryMetric;
    openRevenueBreakdownModal(revenueKey, employeeId);
  });

  /* Body delegation */
  document.body.addEventListener('click', e => {
    const designationResources = e.target.closest('[data-action="open-designation-resources"]');
    if (designationResources) {
      e.preventDefault();
      e.stopPropagation();
      openDesignationResourceModal(designationResources.dataset.designation);
      return;
    }

    const utilizationDetails = e.target.closest('[data-action="open-utilization-details"]');
    if (utilizationDetails) {
      e.preventDefault();
      e.stopPropagation();
      openUtilizationDetailsModal(utilizationDetails.dataset.utilizationMetric);
      return;
    }

    const pipelinePreSaleSummary = e.target.closest('[data-action="open-pipeline-presale-summary"]');
    if (pipelinePreSaleSummary) {
      e.preventDefault();
      e.stopPropagation();
      openPipelinePreSaleSummaryModal();
      return;
    }

    const projectPortfolioMetric = e.target.closest('[data-action="open-project-portfolio-metric"]');
    if (projectPortfolioMetric) {
      e.preventDefault();
      e.stopPropagation();
      openProjectPortfolioMetricModal(projectPortfolioMetric.dataset.projectPortfolioMetric);
      return;
    }

    const runningMetric = e.target.closest('[data-action="open-running-project-metric"]');
    if (runningMetric) {
      e.preventDefault();
      e.stopPropagation();
      openRunningProjectMetricModal(runningMetric.dataset.runningProjectMetric);
      return;
    }

    const capacityDetails = e.target.closest('[data-action="open-capacity-details"]');
    if (capacityDetails) {
      e.preventDefault();
      e.stopPropagation();
      openCapacityAllocationDetailsModal(capacityDetails.dataset.capacityMetric);
      return;
    }

    const committedTarget = e.target.closest('[data-action="edit-committed-target"]');
    if (committedTarget) {
      e.preventDefault();
      e.stopPropagation();
      openCommittedTargetModal(committedTarget.dataset.targetKey);
      return;
    }

    const ep = e.target.closest('[data-action="edit-emp-side"]'); if (ep) openEmployeeModal({ id: +ep.dataset.emp });
    const pr = e.target.closest('[data-action="edit-project"]'); if (pr) openProjectModal({ id: +pr.dataset.project });
    const va = e.target.closest('[data-view-all]'); if (va) openViewAllModal(va.dataset.viewAll);
    const sa = e.target.closest('[data-stat-action]');
    if (sa) {
      if (sa.dataset.statAction === 'view-employees') openResourceModal();
      if (sa.dataset.statAction === 'view-projects') openProjectsModal();
      if (sa.dataset.statAction === 'view-total-ps-projects') openRunningProjectMetricModal('total');
      if (sa.dataset.statAction === 'view-pipeline-presale-summary') openPipelinePreSaleSummaryModal();
    }
  });

  /* Chart section tab buttons */
  document.querySelectorAll('.chart-tab-btn').forEach(b => b.addEventListener('click', () => switchChartTab(b.dataset.chartTab)));

  /* New Logo deal-status filter buttons (COMBINED / NEW LOGO / REPEAT / REACTIVE) */
  document.querySelectorAll('.nl-filter-btn').forEach(b =>
    b.addEventListener('click', () => renderNewLogoChart(null, b.dataset.status, S.nlProductFilter))
  );

  /* Category filter buttons — multi-select, shared across Deal Acquisition + Revenue tabs */
  document.querySelectorAll('.nl-prod-btn').forEach(b =>
    b.addEventListener('click', () => {
      const prod = b.dataset.prod;
      const pf = S.nlProductFilter;

      if (prod === 'ALL') {
        // ALL clears everything and selects only ALL
        S.nlProductFilter = new Set(['ALL']);
      } else {
        // Remove ALL when selecting specific categories
        pf.delete('ALL');
        if (pf.has(prod)) {
          pf.delete(prod);
          // If nothing left, fall back to ALL
          if (pf.size === 0) S.nlProductFilter = new Set(['ALL']);
        } else {
          pf.add(prod);
        }
      }

      // Sync button visuals
      document.querySelectorAll('.nl-prod-btn').forEach(btn => {
        const active = S.nlProductFilter.has(btn.dataset.prod);
        btn.style.background = active ? '#1e40af' : 'white';
        btn.style.color = active ? 'white' : '#374151';
        btn.style.borderColor = active ? '#1e40af' : '#e5e7eb';
      });

      const activeTab = document.querySelector('.chart-tab-btn.active')?.dataset?.chartTab;
      if (activeTab === 'revenue') {
        renderPsRevenueChart(null, S.nlProductFilter);
      } else {
        renderNewLogoChart(null, S.newLogoFilter, S.nlProductFilter);
      }
    })
  );



  /* Resource Assignment Matrix / Yearly Work by Project tabs */
  document.querySelectorAll('.resource-matrix-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchResourceMatrixTab(btn.dataset.resourceMatrixTab));
  });

  /* Work Summary tabs + Time Sheet Excel upload */
  document.querySelectorAll('.work-summary-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchWorkSummaryTab(btn.dataset.workSummaryTab));
  });
  document.getElementById('individualSummaryMonthFilter')?.addEventListener('change', e => {
    S.individualSummaryMonthFilter = e.target.value || '';
    renderIndividualSummaryChart();
  });

  document.getElementById('timesheetReportBtn')?.addEventListener('click', () => {
    openTimesheetReportModal();
  });

  document.getElementById('timesheetUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleTimesheetUpload(file);
    e.target.value = '';
  });

  document.getElementById('historicalProjectExcelUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleProjectExcelUpload(file, 'historical');
    e.target.value = '';
  });

  document.getElementById('forecastProjectExcelUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleProjectExcelUpload(file, 'forecast');
    e.target.value = '';
  });

  document.getElementById('assignmentExcelUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleAssignmentExcelUpload(file);
    e.target.value = '';
  });

  document.getElementById('downloadAssignmentExcelBtn')?.addEventListener('click', downloadAssignmentExcel);
  document.getElementById('preSaleProductBtn')?.addEventListener('click', () => {
    requestProtectedModalAccess('Pre-Sale Product', openPreSaleProductsModal);
  });
  document.getElementById('reserveRevenueBtn')?.addEventListener('click', () => {
    requestProtectedModalAccess('Resource Revenue', openRevenueRatesModal);
  });

  prepareDashboardCardControls();
  initCardCollapse();
  initReportSectionToggle();
  initColResize(); initSectionDrag();
}

/* ── Column resize ────────────────────────────────────────────── */
function initColResize() { const root = document.documentElement; let ac = null, sx = 0, sw = 0; const gw = col => parseInt(getComputedStyle(root).getPropertyValue(`--${col}-w`), 10) || (col === 'name' ? 220 : 160); document.getElementById('matrixWrap').addEventListener('mousedown', e => { const h = e.target.closest('.col-resizer'); if (!h) return; e.preventDefault(); ac = h.dataset.col; sx = e.clientX; sw = gw(ac); h.classList.add('active'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }); document.addEventListener('mousemove', e => { if (!ac) return; root.style.setProperty(`--${ac}-w`, Math.max(100, sw + (e.clientX - sx)) + 'px'); }); document.addEventListener('mouseup', () => { if (!ac) return; document.querySelectorAll('.col-resizer.active').forEach(el => el.classList.remove('active')); ac = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; }); }

/* ── Section drag ─────────────────────────────────────────────── */
function initSectionDrag() { const canvas = document.getElementById('dashboard-canvas'); let dSrc = null, lTgt = null, lInd = null; let raf = null, py = 0; const EDGE = 130, SPD = 18; function loop() { const vh = window.innerHeight; if (py < EDGE) window.scrollBy(0, -SPD * (1 - py / EDGE)); else if (py > vh - EDGE) window.scrollBy(0, SPD * ((py - (vh - EDGE)) / EDGE)); raf = requestAnimationFrame(loop); } const start = () => { if (!raf) raf = requestAnimationFrame(loop); }; const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } }; document.addEventListener('dragover', e => { if (!dSrc) return; py = e.clientY; start(); }); document.addEventListener('dragend', stop); document.addEventListener('drop', stop); function clrInd() { canvas.querySelectorAll('.ds').forEach(s => s.classList.remove('drop-above', 'drop-below')); } canvas.querySelectorAll('.ds').forEach(sec => { const h = sec.querySelector(':scope > .drag-handle'); if (!h) return; h.addEventListener('mousedown', () => sec.setAttribute('draggable', 'true')); document.addEventListener('mouseup', () => sec.setAttribute('draggable', 'false')); sec.addEventListener('dragstart', e => { dSrc = sec; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'section'); requestAnimationFrame(() => sec.classList.add('is-dragging')); }); sec.addEventListener('dragend', () => { sec.classList.remove('is-dragging'); sec.setAttribute('draggable', 'false'); clrInd(); stop(); dSrc = null; lTgt = null; }); sec.addEventListener('dragover', e => { if (!dSrc) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dSrc === sec) { clrInd(); return; } const rect = sec.getBoundingClientRect(), above = e.clientY < rect.top + rect.height / 2; if (lTgt !== sec || lInd !== (above ? 'above' : 'below')) { clrInd(); sec.classList.add(above ? 'drop-above' : 'drop-below'); lTgt = sec; lInd = above ? 'above' : 'below'; } }); sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) { sec.classList.remove('drop-above', 'drop-below'); if (lTgt === sec) lTgt = null; } }); sec.addEventListener('drop', e => { e.preventDefault(); if (!dSrc || dSrc === sec) return; const above = e.clientY < sec.getBoundingClientRect().top + sec.getBoundingClientRect().height / 2; if (above) canvas.insertBefore(dSrc, sec); else sec.after(dSrc); clrInd(); }); }); }

/* ── Card drag + dashboard-wide collapse controls ─────────────── */
let cDragSrc = null;

const CARD_COLLAPSE_STORAGE_KEY = 'allocation-dashboard-card-collapse-v2';
const DEFAULT_COLLAPSED_CARD_KEYS = new Set([
  'capacity-allocation',
  'executive-metrics',
  'available-capacity-summary',
  'maximum-revenue-capacity',
  'revenue-targets',
  'capacity-value-allocation',
  'pipeline-target-summary',
]);

const REPORT_SECTION_KEYS = Object.freeze(['capacity-executive', 'capacity-planning']);

const DASHBOARD_CARD_SECTION_META = Object.freeze({
  stats: { rowLabel: 'KPI cards' },
  'capacity-executive': { rowLabel: 'Executive Matrix, Capacity Allocation and Available Capacity Summary' },
  'capacity-planning': { rowLabel: 'Capacity planning tables' },
  matrix: { rowLabel: 'Resource Assignment', singleCardTitle: 'Resource Assignment' },
  charts: { rowLabel: 'Assignment analytics' },
  worksummarychart: { rowLabel: 'Work Summary', singleCardTitle: 'Work Summary' },
  newlogochart: { rowLabel: 'Deal Acquisition and Revenue charts', singleCardTitle: 'Deal Acquisition Chart' },
  insights: { rowLabel: 'Allocation insights' },
  pipeline: { rowLabel: 'Project operations' },
});

function collapseSlug(value) {
  return String(value || 'card')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'card';
}

function cardControlIcon(type) {
  if (type === 'expand') {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 12.5 4.5-4.5 4.5 4.5"/></svg>';
}

function cardDragIcon() {
  return '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg>';
}

function getDashboardCardTitle(card, fallback = 'Dashboard card') {
  const explicit = String(card.dataset.cardTitle || '').trim();
  if (explicit) return explicit;

  const heading = card.querySelector('h2, h3, [data-card-heading]');
  const headingText = String(heading?.textContent || '').replace(/\s+/g, ' ').trim();
  if (headingText) return headingText;

  const activeTab = card.querySelector('.chart-tab-btn.active');
  const tabText = String(activeTab?.textContent || '').replace(/\s+/g, ' ').trim();
  return tabText || fallback;
}

function createRowExpandButton(label) {
  const button = document.createElement('button');
  button.className = 'card-row-expand-button';
  button.type = 'button';
  button.dataset.cardRowExpand = '';
  button.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `
    <span class="card-row-expand-button__icon" aria-hidden="true">${cardControlIcon('expand')}</span>
    <span class="card-row-expand-button__copy">
      <strong>Expand ${label}</strong>
      <small>All cards in this row are minimized</small>
    </span>
    <span class="card-row-expand-button__action">Restore row</span>`;
  return button;
}

function enhanceRowExpandButton(button, label, cardCount) {
  if (!button) return;
  button.classList.add('card-row-expand-button');
  button.dataset.cardRowExpand = '';
  button.innerHTML = `
    <span class="card-row-expand-button__icon" aria-hidden="true">${cardControlIcon('expand')}</span>
    <span class="card-row-expand-button__copy">
      <strong>Expand ${label}</strong>
      <small>${cardCount} ${cardCount === 1 ? 'card is' : 'cards are'} minimized</small>
    </span>
    <span class="card-row-expand-button__action">Restore row</span>`;
}

function ensureSingleSectionCard(section, meta) {
  if (!meta?.singleCardTitle || section.querySelector('.dc')) return;
  const card = [...section.children].find(child =>
    child instanceof HTMLElement
    && !child.classList.contains('drag-handle')
    && !child.matches('[data-card-row-expand]')
    && !child.matches('[data-card-collapse-group]')
  );
  if (!card) return;
  card.classList.add('dc', 'dashboard-section-card');
  card.dataset.cardTitle = meta.singleCardTitle;
  card.dataset.cardKey = collapseSlug(meta.singleCardTitle);
}

function ensureSectionCollapseGroup(section, meta) {
  let group = section.querySelector(':scope > [data-card-collapse-group]');
  if (group) return group;

  group = document.createElement('div');
  group.className = 'dashboard-card-collapse-group';
  const sectionKey = section.dataset.section || 'dashboard';
  group.dataset.cardCollapseGroup = `section-${sectionKey}`;
  group.dataset.cardRowLabel = meta?.rowLabel || sectionKey;

  const movableChildren = [...section.children].filter(child =>
    !child.classList.contains('drag-handle')
    && !child.matches('[data-card-row-expand]')
  );
  const first = movableChildren[0] || null;
  section.insertBefore(group, first);
  movableChildren.forEach(child => group.appendChild(child));
  return group;
}

function ensureCardControlRail(card, title) {
  card.classList.add('dashboard-collapsible-card');
  card.dataset.cardTitle = title;
  if (!card.dataset.cardKey) card.dataset.cardKey = collapseSlug(title);

  let rail = card.querySelector(':scope > .card-control-rail');
  if (!rail) {
    rail = document.createElement('div');
    rail.className = 'card-control-rail';
    card.insertBefore(rail, card.firstChild);
  }

  let handle = card.querySelector(':scope > .dc-handle, :scope > .card-control-rail > .dc-handle');
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'dc-handle';
    handle.innerHTML = cardDragIcon();
  }
  handle.title = `Drag ${title} left or right`;
  handle.setAttribute('aria-label', `Drag ${title} left or right`);
  rail.appendChild(handle);

  let toggle = card.querySelector(':scope > .card-collapse-toggle, :scope > .card-control-rail > .card-collapse-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.className = 'card-collapse-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.innerHTML = cardControlIcon('collapse');
  }
  rail.appendChild(toggle);

  let shell = card.querySelector(':scope > .card-collapsed-shell');
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'card-collapsed-shell';
    shell.setAttribute('aria-hidden', 'true');
    rail.after(shell);
  }

  if (!shell.querySelector('.card-collapsed-shell__copy')) {
    const oldValue = String(shell.querySelector('.card-collapsed-shell__value')?.textContent || '').trim() || 'Expand';
    shell.innerHTML = `
      <span class="card-collapsed-shell__marker" aria-hidden="true">${cardControlIcon('expand')}</span>
      <span class="card-collapsed-shell__copy">
        <span class="card-collapsed-shell__title"></span>
        <span class="card-collapsed-shell__subtitle">Minimized card</span>
      </span>
      <span class="card-collapsed-shell__value"></span>`;
    const valueNode = shell.querySelector('.card-collapsed-shell__value');
    if (valueNode) valueNode.textContent = oldValue;
  }

  const shellTitle = shell.querySelector('.card-collapsed-shell__title');
  if (shellTitle) shellTitle.textContent = title;

  let content = card.querySelector(':scope > .card-expandable-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'card-expandable-content';
    const children = [...card.children].filter(child => child !== rail && child !== shell);
    children.forEach(child => content.appendChild(child));
    card.appendChild(content);
  }
}

function collectCollapsibleCards(group) {
  if (!group) return [];
  const cards = [...group.querySelectorAll('.dc[data-card-key]')];
  if (group.matches?.('.dc[data-card-key]')) cards.unshift(group);
  return [...new Set(cards)];
}

function prepareDashboardCardControls() {
  document.querySelectorAll('.ds[data-section]').forEach(section => {
    const sectionKey = section.dataset.section || 'dashboard';
    const meta = DASHBOARD_CARD_SECTION_META[sectionKey];
    if (!meta) return;

    section.classList.add('card-collapse-section');
    section.dataset.cardRowKey ||= `row-${sectionKey}`;
    ensureSingleSectionCard(section, meta);
    const group = ensureSectionCollapseGroup(section, meta);
    group.dataset.cardRowLabel ||= meta.rowLabel;

    const cards = [...group.querySelectorAll('.dc')];
    group.dataset.cardCount = String(cards.length);
    cards.forEach((card, index) => {
      const title = getDashboardCardTitle(card, `${meta.rowLabel} ${index + 1}`);
      if (!card.dataset.cardKey) card.dataset.cardKey = collapseSlug(title);
      ensureCardControlRail(card, title);
    });

    let rowButton = section.querySelector(':scope > [data-card-row-expand]');
    if (!rowButton) {
      rowButton = createRowExpandButton(meta.rowLabel);
      section.insertBefore(rowButton, group);
    }
    enhanceRowExpandButton(rowButton, meta.rowLabel, cards.length);
  });
}

function initCardDrag() {
  prepareDashboardCardControls();

  document.querySelectorAll('.dc:not([data-drag-init])').forEach(card => {
    card.setAttribute('data-drag-init', '1');
    const handle = card.querySelector(':scope > .card-control-rail > .dc-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', event => {
      event.stopPropagation();
      card.setAttribute('draggable', 'true');
    });
    handle.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('mouseup', () => card.setAttribute('draggable', 'false'));

    card.addEventListener('dragstart', event => {
      event.stopPropagation();
      cDragSrc = card;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'card');
      requestAnimationFrame(() => card.classList.add('is-dragging-card'));
    });

    card.addEventListener('dragend', event => {
      event.stopPropagation();
      card.classList.remove('is-dragging-card');
      card.setAttribute('draggable', 'false');
      document.querySelectorAll('.dc.drop-target').forEach(element => element.classList.remove('drop-target'));
      cDragSrc = null;
    });

    card.addEventListener('dragover', event => {
      if (!cDragSrc || cDragSrc.parentElement !== card.parentElement) return;
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.dc.drop-target').forEach(element => {
        if (element !== card) element.classList.remove('drop-target');
      });
      if (card !== cDragSrc) card.classList.add('drop-target');
    });

    card.addEventListener('dragleave', event => {
      if (!card.contains(event.relatedTarget)) card.classList.remove('drop-target');
    });

    card.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!cDragSrc || cDragSrc === card || cDragSrc.parentElement !== card.parentElement) return;

      const parent = card.parentElement;
      const sourceIndex = Array.from(parent.children).indexOf(cDragSrc);
      const destinationIndex = Array.from(parent.children).indexOf(card);
      if (sourceIndex < destinationIndex) parent.insertBefore(cDragSrc, card.nextSibling);
      else parent.insertBefore(cDragSrc, card);
      card.classList.remove('drop-target');
    });
  });

  initCardCollapse();
}

/* ── Independent card minimize / expand ───────────────────────── */
function readCardCollapseState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CARD_COLLAPSE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeCardCollapseState(state) {
  try {
    localStorage.setItem(CARD_COLLAPSE_STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // The dashboard still works when browser storage is unavailable.
  }
}

function getCardCollapseStateKey(card) {
  const group = card.closest('[data-card-collapse-group]');
  const groupKey = group?.dataset.cardCollapseGroup || 'dashboard';
  return `${groupKey}:${card.dataset.cardKey || card.dataset.cardTitle || 'card'}`;
}

function isCardCollapsedByDefault(card) {
  return DEFAULT_COLLAPSED_CARD_KEYS.has(String(card?.dataset?.cardKey || '').trim());
}

function refreshExpandedCardVisuals() {
  requestAnimationFrame(() => {
    if (typeof S !== 'undefined' && S?.charts) {
      Object.values(S.charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function') chart.resize();
      });
    }
    window.dispatchEvent(new Event('resize'));
  });
}

function getReportSectionContainers() {
  return REPORT_SECTION_KEYS
    .map(sectionKey => document.querySelector(`.ds[data-section="${sectionKey}"]`))
    .filter(Boolean);
}

function setReportSectionHidden(hidden) {
  const sections = getReportSectionContainers();
  if (!sections.length) return;

  sections.forEach(section => {
    section.classList.toggle('is-report-section-hidden', hidden);
    section.setAttribute('aria-hidden', String(hidden));
  });

  const button = document.getElementById('reportSectionToggleBtn');
  if (button) {
    const label = button.querySelector('[data-report-section-toggle-label]');
    const icon = button.querySelector('.report-section-toggle-btn__icon');
    button.classList.toggle('is-report-hidden', hidden);
    button.setAttribute('aria-expanded', String(!hidden));
    button.title = hidden ? 'Show all Report cards' : 'Hide all Report cards';
    if (label) label.textContent = hidden ? 'Show Report Cards' : 'Hide Report Cards';
    if (icon) icon.textContent = hidden ? '+' : '−';
  }

  const exportButton = document.getElementById('exportFiscalYearReportBtn');
  if (exportButton) {
    exportButton.classList.toggle('is-report-hidden', hidden);
    exportButton.setAttribute('aria-hidden', String(hidden));
    exportButton.tabIndex = hidden ? -1 : 0;
  }

  if (!hidden) {
    requestAnimationFrame(() => {
      if (typeof getCapacityExecutiveSummary === 'function' && typeof renderCapacityExecutiveChart === 'function') {
        renderCapacityExecutiveChart(getCapacityExecutiveSummary());
      }
      refreshExpandedCardVisuals();
    });
  }
}

function initReportSectionToggle() {
  const button = document.getElementById('reportSectionToggleBtn');
  if (!button || button.hasAttribute('data-report-section-toggle-init')) return;

  button.setAttribute('data-report-section-toggle-init', '1');
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const sections = getReportSectionContainers();
    if (!sections.length) return;
    const currentlyHidden = sections.every(section => section.classList.contains('is-report-section-hidden'));
    setReportSectionHidden(!currentlyHidden);
  });
  setReportSectionHidden(false);
}

function updateCardCollapseControl(card, collapsed) {
  const button = card.querySelector(':scope > .card-control-rail > .card-collapse-toggle');
  const shell = card.querySelector(':scope > .card-collapsed-shell');
  const title = card.dataset.cardTitle || 'card';

  if (button) {
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Minimize'} ${title}`);
    button.title = `${collapsed ? 'Expand' : 'Minimize'} ${title}`;
    button.innerHTML = cardControlIcon(collapsed ? 'expand' : 'collapse');
  }
  if (shell) shell.setAttribute('aria-hidden', String(!collapsed));
}

function setCardCollapsed(card, collapsed, options = {}) {
  const { persist = true, updateRow = true } = options;
  const wasCollapsed = card.classList.contains('is-card-collapsed');
  card.classList.toggle('is-card-collapsed', collapsed);
  updateCardCollapseControl(card, collapsed);

  if (persist) {
    const state = readCardCollapseState();
    const key = getCardCollapseStateKey(card);
    // Persist both states so a user-expanded card can override a default
    // minimized card on subsequent page loads.
    state[key] = Boolean(collapsed);
    writeCardCollapseState(state);
  }

  if (updateRow) {
    const group = card.closest('[data-card-collapse-group]');
    if (group) updateCardRowCollapseState(group);
  }

  if (wasCollapsed && !collapsed) refreshExpandedCardVisuals();
}

function updateCardRowCollapseState(group) {
  const cards = collectCollapsibleCards(group);
  if (!cards.length) return;

  const allCollapsed = cards.every(card => card.classList.contains('is-card-collapsed'));
  const section = group.closest('.card-collapse-section');
  const rowButton = section?.querySelector(':scope > [data-card-row-expand]');

  section?.classList.toggle('is-card-row-collapsed', allCollapsed);
  group.setAttribute('aria-hidden', String(allCollapsed));
  if (rowButton) {
    rowButton.hidden = !allCollapsed;
    rowButton.setAttribute('aria-expanded', String(!allCollapsed));
  }
}

function initCardCollapse() {
  prepareDashboardCardControls();
  const state = readCardCollapseState();

  document.querySelectorAll('[data-card-collapse-group]').forEach(group => {
    collectCollapsibleCards(group).forEach(card => {
      const button = card.querySelector(':scope > .card-control-rail > .card-collapse-toggle');
      if (!button) return;

      if (!card.hasAttribute('data-collapse-init')) {
        card.setAttribute('data-collapse-init', '1');
        button.addEventListener('mousedown', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          setCardCollapsed(card, !card.classList.contains('is-card-collapsed'));
        });
      }

      const stateKey = getCardCollapseStateKey(card);
      const hasSavedState = Object.prototype.hasOwnProperty.call(state, stateKey);
      const shouldCollapse = hasSavedState
        ? Boolean(state[stateKey])
        : isCardCollapsedByDefault(card);
      setCardCollapsed(card, shouldCollapse, {
        persist: false,
        updateRow: false,
      });
    });

    updateCardRowCollapseState(group);
  });

  document.querySelectorAll('[data-card-row-expand]:not([data-row-expand-init])').forEach(button => {
    button.setAttribute('data-row-expand-init', '1');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const section = button.closest('.card-collapse-section');
      const group = section?.querySelector(':scope > [data-card-collapse-group]');
      if (!group) return;

      collectCollapsibleCards(group).forEach(card => {
        setCardCollapsed(card, false, { persist: true, updateRow: false });
      });
      updateCardRowCollapseState(group);
      refreshExpandedCardVisuals();
    });
  });
}

