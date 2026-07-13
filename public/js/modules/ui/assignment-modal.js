function openAssignmentModal(opts = {}) {
  const editing = !!opts.id, cur = editing ? S.assignments.find(a => a.id === opts.id) : null;
  const selectableEmployees = getActiveEmployees();
  const employeeOptions = selectableEmployees.length ? selectableEmployees : S.employees;
  let empId = opts.employee_id || (cur && cur.employee_id) || (employeeOptions[0] && employeeOptions[0].id);

  if (!employeeOptions.some(e => e.id === empId)) {
    empId = employeeOptions[0] && employeeOptions[0].id;
  }

  const pct = (cur && cur.percentage) || 50;
  const today = new Date();
  let defStart = formatDateInputLocal(today), defEnd = formatDateInputLocal(today);
  if (editing && cur && cur.year && cur.month && cur.week) {
    const dr = weekDateRange(cur.year, cur.month, cur.week);
    defStart = dr.start;
    defEnd = dr.end;
  } else if (!editing && opts.year && opts.month && opts.week) {
    const dr = weekDateRange(opts.year, opts.month, opts.week);
    defStart = dr.start;
    defEnd = dr.end;
  }
  const findProjectById = (id) => {
    if (id === null || id === undefined || id === '') return null;
    return S.projects.find(p => String(p.id) === String(id)) || null;
  };

  const getCustomerName = (proj, fallback = {}) => {
    return (
      proj?.account_name ||
      proj?.client ||
      proj?.customer_name ||
      fallback?.account_name ||
      fallback?.client ||
      fallback?.customer_name ||
      '—'
    );
  };

  const getProductName = (proj, fallback = {}) => {
    return (
      proj?.product_name ||
      fallback?.product_name ||
      '—'
    );
  };

  /* Searchable project combobox markup — shared by add & edit */
  const projCombo = (selectedId) => {
    const selProj = findProjectById(selectedId);
    const displayVal = selProj ? `${selProj.code} — ${selProj.name}` : '';
    return `
      <div class="proj-combo-wrap" style="position:relative">
        <input id="fa_proj_search" type="text" class="field-input" autocomplete="off"
          placeholder="Type SA code or project name…"
          value="${esc(displayVal)}"
          style="padding-right:2rem">
        <input type="hidden" id="fa_proj" value="${selectedId || ''}">
        <div id="fa_proj_dropdown"
          class="nice-scroll"
          style="display:none;position:absolute;z-index:9999;left:0;right:0;top:100%;
                 background:#fff;border:1px solid #e5e7eb;border-radius:0.5rem;
                 box-shadow:0 4px 16px rgba(0,0,0,0.10);max-height:220px;overflow-y:auto;margin-top:2px">
        </div>
      </div>`;
  };

  /* Customer Name / Product Name info block — shared by add & edit, auto-filled from the selected project */
  const projInfoBlock = (selectedId, fallback = {}) => {
    const proj = findProjectById(selectedId);
    const custVal = getCustomerName(proj, fallback);
    const prodVal = getProductName(proj, fallback);

    return `
      <div class="grid grid-cols-2 gap-4 -mt-2">
        <div>
          <label class="field-label">Customer Name</label>
          <input id="fa_customer_name" type="text" class="field-input bg-gray-50 text-gray-700 font-semibold cursor-default" value="${esc(custVal)}" readonly title="${esc(custVal)}">
        </div>
        <div>
          <label class="field-label">Product Name</label>
          <input id="fa_product_name" type="text" class="field-input bg-gray-50 text-gray-700 font-semibold cursor-default" value="${esc(prodVal)}" readonly title="${esc(prodVal)}">
        </div>
      </div>`;
  };

  const pctScaleHtml = () => `
    <div class="relative text-xs text-gray-400 mt-2 h-4">
      <span style="position:absolute;left:0%;transform:translateX(0);">0%</span>
      <span style="position:absolute;left:20%;transform:translateX(-50%);">20%</span>
      <span style="position:absolute;left:40%;transform:translateX(-50%);">40%</span>
      <span style="position:absolute;left:50%;transform:translateX(-50%);">50%</span>
      <span style="position:absolute;left:60%;transform:translateX(-50%);">60%</span>
      <span style="position:absolute;left:80%;transform:translateX(-50%);">80%</span>
      <span style="position:absolute;left:100%;transform:translateX(-100%);">100%</span>
    </div>`;

  if (editing) {
    openModal(`${mHdr('Edit Assignment', 'Update workload allocation')}
      <div class="p-6 space-y-4">
        <div><label class="field-label">Resource</label>
          <select id="fa_emp" class="field-input">${employeeOptions.map(e => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}</select>
        </div>
        <div><label class="field-label">Project</label>${projCombo(cur?.project_id)}</div>
        ${projInfoBlock(cur?.project_id, cur)}
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">Start Date</label>
            <input id="fa_start" type="date" class="field-input" value="${defStart}"></div>
          <div><label class="field-label">End Date</label>
            <input id="fa_end" type="date" class="field-input" value="${defEnd}"></div>
        </div>
        <div>
          <label class="field-label flex justify-between"><span>Workload Allocation</span>
            <span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span>
          </label>
          <div class="flex gap-2 mb-2">
            <button type="button" onclick="setPct(50)"  class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">½ Day (50%)</button>
            <button type="button" onclick="setPct(100)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Full Day (100%)</button>
            <button type="button" onclick="setPct(0)"   class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Off (0%)</button>
          </div>
          <input id="fa_pct" type="range" min="0" max="100" step="1" value="${pct}" class="w-full accent-blue-600"
            oninput="syncPctLabel(this.value)">
          ${pctScaleHtml()}
        </div>
      </div>
      ${mFtr(opts.id, 'saveAssignment', 'deleteAssignment')}`);
  } else {
    openModal(`${mHdr('Add Assignment', 'Assign a resource to a project across a date range')}
      <div class="p-6 space-y-4">
        <div><label class="field-label">Resource</label>
          <select id="fa_emp" class="field-input">${employeeOptions.map(e => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}</select>
        </div>
        <div><label class="field-label">Project</label>${projCombo(opts.project_id || null)}</div>
        ${projInfoBlock(opts.project_id || null, {})}
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">Start Date</label>
            <input id="fa_start" type="date" class="field-input" value="${defStart}" oninput="updateSlotPreview()"></div>
          <div><label class="field-label">End Date</label>
            <input id="fa_end" type="date" class="field-input" value="${defEnd}" oninput="updateSlotPreview()"></div>
        </div>
        <div><label class="field-label">Quick Presets</label>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-preset" onclick="setDateRange('week')">This Week</button>
            <button type="button" class="btn-preset" onclick="setDateRange('month')">This Month</button>
            <button type="button" class="btn-preset" onclick="setDateRange('3months')">Next 3 Months</button>
            <button type="button" class="btn-preset" onclick="setDateRange('fiscalyear')">Full Fiscal Year</button>
          </div>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800" id="slotPreview">
          Will create <span class="font-semibold">0</span> weekly assignments
        </div>
        <div>
          <label class="field-label flex justify-between"><span>Workload per Week</span>
            <span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span>
          </label>
          <div class="flex gap-2 mb-2">
            <button type="button" onclick="setPct(50)"  class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">½ Day (50%)</button>
            <button type="button" onclick="setPct(100)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Full Day (100%)</button>
            <button type="button" onclick="setPct(0)"   class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Off (0%)</button>
          </div>
          <input id="fa_pct" type="range" min="0" max="100" step="1" value="${pct}" class="w-full accent-blue-600"
            oninput="syncPctLabel(this.value)">
          ${pctScaleHtml()}
        </div>
      </div>
      ${mFtr(null, 'saveAssignment', 'deleteAssignment')}`);
    updateSlotPreview();
  }

  /* ── Wire up percentage preset buttons ── */
  window.setPct = function (val) {
    const slider = document.getElementById('fa_pct');
    if (slider) { slider.value = val; syncPctLabel(val); }
  };
  window.syncPctLabel = function (val) {
    const lbl = document.getElementById('pctLbl');
    if (lbl) lbl.textContent = val + '%';
    // Highlight active preset button
    document.querySelectorAll('.pct-preset-btn').forEach(b => {
      const m = b.getAttribute('onclick'); const bVal = m && m.match(/setPct.(\d+)/)?.[1];
      const isActive = bVal && +bVal === +val;
      b.style.background = isActive ? '#1e40af' : 'white';
      b.style.color = isActive ? 'white' : '#374151';
      b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
    });
  };
  // Sync on open
  syncPctLabel(document.getElementById('fa_pct')?.value || 100);

  /* ── Wire up searchable project combobox ── */
  const searchInput = document.getElementById('fa_proj_search');
  const hiddenInput = document.getElementById('fa_proj');
  const dropdown = document.getElementById('fa_proj_dropdown');
  if (!searchInput || !dropdown) return;

  /* Distinct projects by id */
  const projList = S.projects.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

  /* Update Customer Name / Product Name info block to reflect the currently selected project */
  function syncProjInfo(projId) {
    const proj = findProjectById(projId);
    const custVal = getCustomerName(proj, {});
    const prodVal = getProductName(proj, {});

    const custEl = document.getElementById('fa_customer_name');
    const prodEl = document.getElementById('fa_product_name');

    if (custEl) {
      custEl.value = custVal;
      custEl.title = custVal;
    }

    if (prodEl) {
      prodEl.value = prodVal;
      prodEl.title = prodVal;
    }
  }

  function renderDropdown(q) {
    const lq = q.toLowerCase().trim();
    const matches = lq
      ? projList.filter(p =>
        (p.code || '').toLowerCase().includes(lq) ||
        (p.name || '').toLowerCase().includes(lq) ||
        (p.product_name || '').toLowerCase().includes(lq))
      : projList;

    if (!matches.length) {
      dropdown.innerHTML = `<div class="px-4 py-3 text-sm text-gray-400">No projects found</div>`;
    } else {
      dropdown.innerHTML = matches.slice(0, 80).map(p => `
        <div class="proj-opt px-3 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 last:border-0"
             data-id="${p.id}" data-label="${esc(p.code + ' — ' + p.name)}"
             style="display:flex;flex-direction:column;gap:1px">
          <span style="font-size:12px;font-weight:700;color:#2563eb;font-family:monospace">${esc(p.code)}</span>
          <span style="font-size:13px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
          ${p.product_name ? `<span style="font-size:11px;color:#9ca3af">${esc(p.product_name)}</span>` : ''}
        </div>`).join('');
    }
    dropdown.style.display = 'block';
  }

  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => {
    hiddenInput.value = ''; // clear selection when typing
    syncProjInfo('');
    renderDropdown(searchInput.value);
  });

  dropdown.addEventListener('mousedown', e => {
    const opt = e.target.closest('.proj-opt');
    if (!opt) return;
    e.preventDefault();
    hiddenInput.value = opt.dataset.id;
    searchInput.value = opt.dataset.label;
    syncProjInfo(opt.dataset.id);
    dropdown.style.display = 'none';
  });

  document.addEventListener('mousedown', function outsideClick(e) {
    if (!e.target.closest('.proj-combo-wrap')) {
      dropdown.style.display = 'none';
      if (!hiddenInput.value) { searchInput.value = ''; syncProjInfo(''); }
      document.removeEventListener('mousedown', outsideClick);
    }
  }, true);
}

function setDateRange(preset) {
  const t = new Date();
  let s, e;

  if (preset === 'week') {
    s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    e = addDaysLocal(s, 6);
  } else if (preset === 'month') {
    s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    e = new Date(t.getFullYear(), t.getMonth() + 1, t.getDate());
  } else if (preset === '3months') {
    s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    e = new Date(t.getFullYear(), t.getMonth() + 3, t.getDate());
  } else {
    s = new Date(S.fiscalYear, 3, 1);
    e = new Date(S.fiscalYear + 1, 2, 31);
  }

  document.getElementById('fa_start').value = formatDateInputLocal(s);
  document.getElementById('fa_end').value = formatDateInputLocal(e);
  updateSlotPreview();
}

function updateSlotPreview() { const s = document.getElementById('fa_start'), e = document.getElementById('fa_end'), pv = document.getElementById('slotPreview'); if (!s || !e || !pv) return; const slots = expandDateRange(s.value, e.value); pv.innerHTML = `Will create <span class="font-semibold">${slots.length}</span> weekly assignment${slots.length === 1 ? '' : 's'}`; pv.className = slots.length > 0 ? 'bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800' : 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800'; }

async function saveAssignment(id) {
  const projId = document.getElementById('fa_proj')?.value;
  if (!projId) { toast('Please select a project', 'error'); return; }
  const slots = expandDateRange(document.getElementById('fa_start').value, document.getElementById('fa_end').value);
  if (!slots.length) { toast('Invalid date range', 'error'); return; }
  const payload = { employee_id: +document.getElementById('fa_emp').value, project_id: +projId, percentage: +document.getElementById('fa_pct').value, slots };
  try {
    if (id) {
      const r = await api('POST', `/api/assignments/${id}/reschedule`, payload);
      closeModal(); toast(`Assignment updated across ${r.created} week slot${r.created === 1 ? '' : 's'}`); await loadAll(); return;
    }
    const r = await api('POST', '/api/assignments/bulk', payload);
    closeModal(); toast(`Created ${r.created} assignment${r.created === 1 ? '' : 's'}`); await loadAll();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAssignment(id) { if (!confirm('Delete this assignment?')) return; try { await api('DELETE', `/api/assignments/${id}`); closeModal(); toast('Assignment deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

