/* Workforce Allocation Dashboard — ui/events.js */

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
    if (b.dataset.add === 'project-excel') document.getElementById('projectExcelUpload')?.click();
    if (b.dataset.add === 'assignment-excel') document.getElementById('assignmentExcelUpload')?.click();
  }));

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

    const del = e.target.closest('[data-action="delete-assign"]');
    if (del) {
      e.stopPropagation();
      deleteAssignment(Number(del.dataset.id));
      return;
    }

    const chip = e.target.closest('[data-action="edit-assign"]');
    if (chip) {
      e.stopPropagation();
      openAssignmentModal({
        id: Number(chip.dataset.id),
        year: Number(chip.dataset.year),
        month: Number(chip.dataset.month),
        week: Number(chip.dataset.week),
        start_date: chip.dataset.start,
        end_date: chip.dataset.end,
      });
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

  matrixTable.addEventListener('keydown', e => {
    if (!['Enter', ' '].includes(e.key)) return;
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

  document.getElementById('timesheetUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleTimesheetUpload(file);
    e.target.value = '';
  });

  document.getElementById('projectExcelUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleProjectExcelUpload(file);
    e.target.value = '';
  });

  document.getElementById('assignmentExcelUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleAssignmentExcelUpload(file);
    e.target.value = '';
  });

  document.getElementById('downloadAssignmentExcelBtn')?.addEventListener('click', downloadAssignmentExcel);
  document.getElementById('reserveRevenueBtn')?.addEventListener('click', openRevenueRatesModal);

  initColResize(); initSectionDrag();
}

/* ── Column resize ────────────────────────────────────────────── */
function initColResize() { const root = document.documentElement; let ac = null, sx = 0, sw = 0; const gw = col => parseInt(getComputedStyle(root).getPropertyValue(`--${col}-w`), 10) || (col === 'name' ? 220 : 160); document.getElementById('matrixWrap').addEventListener('mousedown', e => { const h = e.target.closest('.col-resizer'); if (!h) return; e.preventDefault(); ac = h.dataset.col; sx = e.clientX; sw = gw(ac); h.classList.add('active'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }); document.addEventListener('mousemove', e => { if (!ac) return; root.style.setProperty(`--${ac}-w`, Math.max(100, sw + (e.clientX - sx)) + 'px'); }); document.addEventListener('mouseup', () => { if (!ac) return; document.querySelectorAll('.col-resizer.active').forEach(el => el.classList.remove('active')); ac = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; }); }

/* ── Section drag ─────────────────────────────────────────────── */
function initSectionDrag() { const canvas = document.getElementById('dashboard-canvas'); let dSrc = null, lTgt = null, lInd = null; let raf = null, py = 0; const EDGE = 130, SPD = 18; function loop() { const vh = window.innerHeight; if (py < EDGE) window.scrollBy(0, -SPD * (1 - py / EDGE)); else if (py > vh - EDGE) window.scrollBy(0, SPD * ((py - (vh - EDGE)) / EDGE)); raf = requestAnimationFrame(loop); } const start = () => { if (!raf) raf = requestAnimationFrame(loop); }; const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } }; document.addEventListener('dragover', e => { if (!dSrc) return; py = e.clientY; start(); }); document.addEventListener('dragend', stop); document.addEventListener('drop', stop); function clrInd() { canvas.querySelectorAll('.ds').forEach(s => s.classList.remove('drop-above', 'drop-below')); } canvas.querySelectorAll('.ds').forEach(sec => { const h = sec.querySelector(':scope > .drag-handle'); if (!h) return; h.addEventListener('mousedown', () => sec.setAttribute('draggable', 'true')); document.addEventListener('mouseup', () => sec.setAttribute('draggable', 'false')); sec.addEventListener('dragstart', e => { dSrc = sec; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'section'); requestAnimationFrame(() => sec.classList.add('is-dragging')); }); sec.addEventListener('dragend', () => { sec.classList.remove('is-dragging'); sec.setAttribute('draggable', 'false'); clrInd(); stop(); dSrc = null; lTgt = null; }); sec.addEventListener('dragover', e => { if (!dSrc) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dSrc === sec) { clrInd(); return; } const rect = sec.getBoundingClientRect(), above = e.clientY < rect.top + rect.height / 2; if (lTgt !== sec || lInd !== (above ? 'above' : 'below')) { clrInd(); sec.classList.add(above ? 'drop-above' : 'drop-below'); lTgt = sec; lInd = above ? 'above' : 'below'; } }); sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) { sec.classList.remove('drop-above', 'drop-below'); if (lTgt === sec) lTgt = null; } }); sec.addEventListener('drop', e => { e.preventDefault(); if (!dSrc || dSrc === sec) return; const above = e.clientY < sec.getBoundingClientRect().top + sec.getBoundingClientRect().height / 2; if (above) canvas.insertBefore(dSrc, sec); else sec.after(dSrc); clrInd(); }); }); }

/* ── Card drag ────────────────────────────────────────────────── */
let cDragSrc = null;
function initCardDrag() { document.querySelectorAll('.dc:not([data-drag-init])').forEach(card => { card.setAttribute('data-drag-init', '1'); const h = card.querySelector(':scope > .dc-handle'); if (!h) return; h.addEventListener('mousedown', () => card.setAttribute('draggable', 'true')); document.addEventListener('mouseup', () => card.setAttribute('draggable', 'false')); card.addEventListener('dragstart', e => { e.stopPropagation(); cDragSrc = card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'card'); requestAnimationFrame(() => card.classList.add('is-dragging-card')); }); card.addEventListener('dragend', e => { e.stopPropagation(); card.classList.remove('is-dragging-card'); card.setAttribute('draggable', 'false'); document.querySelectorAll('.dc.drop-target').forEach(el => el.classList.remove('drop-target')); cDragSrc = null; }); card.addEventListener('dragover', e => { if (!cDragSrc || cDragSrc.parentElement !== card.parentElement) return; e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.dc.drop-target').forEach(el => { if (el !== card) el.classList.remove('drop-target'); }); if (card !== cDragSrc) card.classList.add('drop-target'); }); card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('drop-target'); }); card.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (!cDragSrc || cDragSrc === card || cDragSrc.parentElement !== card.parentElement) return; const par = card.parentElement, si = Array.from(par.children).indexOf(cDragSrc), di = Array.from(par.children).indexOf(card); if (si < di) par.insertBefore(cDragSrc, card.nextSibling); else par.insertBefore(cDragSrc, card); card.classList.remove('drop-target'); }); }); }

