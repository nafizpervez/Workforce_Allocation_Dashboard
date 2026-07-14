/* Workforce Allocation Dashboard — ui/assignment-modal.js */

function getAssignmentProjectById(projectId) {
  if (projectId === null || projectId === undefined || projectId === '') return null;
  return S.projects.find(project => String(project.id) === String(projectId)) || null;
}

function isPreSaleAssignmentProject(project) {
  return Boolean(project) && classifyAllocationProject(project.name) === 'preSale';
}

function cleanAssignmentInfoValue(value) {
  const text = String(value ?? '').trim();
  return !text || text === '—' ? '' : text;
}

function getAssignmentCustomerName(project, assignment = {}) {
  return cleanAssignmentInfoValue(
    assignment.assignment_customer_name ||
    assignment.customer_name ||
    assignment.account_name ||
    project?.account_name ||
    project?.client ||
    project?.customer_name ||
    project?.name,
  );
}

function getAssignmentProductName(project, assignment = {}) {
  return cleanAssignmentInfoValue(
    assignment.assignment_product_name ||
    assignment.product_name ||
    project?.product_name,
  );
}

function getAssignmentModalDateRange(opts, assignment, editing) {
  if (opts.start_date || opts.end_date) {
    return {
      start: opts.start_date || opts.end_date,
      end: opts.end_date || opts.start_date,
    };
  }

  const year = editing ? assignment?.year : opts.year;
  const month = editing ? assignment?.month : opts.month;
  const week = editing ? assignment?.week : opts.week;

  if (year && month && week) return weekDateRange(year, month, week);

  const today = formatDateInputLocal(new Date());
  return { start: today, end: today };
}

function assignmentProjectCombo(selectedId) {
  const selectedProject = getAssignmentProjectById(selectedId);
  const displayValue = selectedProject
    ? `${selectedProject.code} — ${selectedProject.name}`
    : '';

  return `
    <div class="proj-combo-wrap" style="position:relative">
      <input
        id="fa_proj_search"
        type="text"
        class="field-input"
        autocomplete="off"
        placeholder="Type SA code or project name…"
        value="${esc(displayValue)}"
        style="padding-right:2rem"
      >
      <input type="hidden" id="fa_proj" value="${selectedId || ''}">
      <div
        id="fa_proj_dropdown"
        class="nice-scroll"
        style="display:none;position:absolute;z-index:9999;left:0;right:0;top:100%;
          background:#fff;border:1px solid #e5e7eb;border-radius:0.5rem;
          box-shadow:0 4px 16px rgba(0,0,0,0.10);max-height:220px;
          overflow-y:auto;margin-top:2px"
      ></div>
    </div>
  `;
}

function assignmentProjectInfoBlock(selectedId, assignment, editing) {
  const project = getAssignmentProjectById(selectedId);
  const editable = editing && isPreSaleAssignmentProject(project);
  const customerName = getAssignmentCustomerName(project, assignment);
  const productName = getAssignmentProductName(project, assignment);
  const readonly = editable ? '' : 'readonly';
  const fieldClass = editable
    ? 'field-input'
    : 'field-input bg-gray-50 text-gray-700 font-semibold cursor-default';

  return `
    <div class="grid grid-cols-2 gap-4 -mt-2">
      <div>
        <label class="field-label">Customer Name</label>
        <input
          id="fa_customer_name"
          type="text"
          class="${fieldClass}"
          value="${esc(customerName)}"
          ${readonly}
          title="${esc(customerName)}"
        >
      </div>
      <div>
        <label class="field-label">Product Name</label>
        <input
          id="fa_product_name"
          type="text"
          class="${fieldClass}"
          value="${esc(productName)}"
          ${readonly}
          title="${esc(productName)}"
        >
      </div>
    </div>
    <p id="fa_project_info_hint" class="text-xs ${editable ? 'text-blue-600' : 'text-gray-400'} -mt-2">
      ${editable
        ? 'Pre Sale assignment: Customer Name and Product Name can be edited.'
        : 'Customer Name and Product Name are read-only except for Pre Sale assignments.'}
    </p>
  `;
}

function assignmentPercentageScale() {
  return `
    <div class="relative text-xs text-gray-400 mt-2 h-4">
      <span style="position:absolute;left:0%;transform:translateX(0);">0%</span>
      <span style="position:absolute;left:20%;transform:translateX(-50%);">20%</span>
      <span style="position:absolute;left:40%;transform:translateX(-50%);">40%</span>
      <span style="position:absolute;left:50%;transform:translateX(-50%);">50%</span>
      <span style="position:absolute;left:60%;transform:translateX(-50%);">60%</span>
      <span style="position:absolute;left:80%;transform:translateX(-50%);">80%</span>
      <span style="position:absolute;left:100%;transform:translateX(-100%);">100%</span>
    </div>
  `;
}

function assignmentPercentageField(percentage, editing) {
  return `
    <div>
      <label class="field-label flex justify-between">
        <span>${editing ? 'Workload Allocation' : 'Workload per Week'}</span>
        <span class="text-blue-600 font-semibold" id="pctLbl">${percentage}%</span>
      </label>
      <div class="flex gap-2 mb-2">
        <button type="button" onclick="setPct(50)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">½ Day (50%)</button>
        <button type="button" onclick="setPct(100)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Full Day (100%)</button>
        <button type="button" onclick="setPct(0)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Off (0%)</button>
      </div>
      <input
        id="fa_pct"
        type="range"
        min="0"
        max="100"
        step="1"
        value="${percentage}"
        class="w-full accent-blue-600"
        oninput="syncPctLabel(this.value)"
      >
      ${assignmentPercentageScale()}
    </div>
  `;
}

function openAssignmentModal(opts = {}) {
  const editing = Boolean(opts.id);
  const assignment = editing
    ? S.assignments.find(item => Number(item.id) === Number(opts.id))
    : null;

  if (editing && !assignment) {
    toast('Assignment could not be found. Refresh the page and try again.', 'error');
    return;
  }

  const selectableEmployees = getActiveEmployees();
  const employeeOptions = selectableEmployees.length ? selectableEmployees : S.employees;
  let employeeId = Number(opts.employee_id || assignment?.employee_id || employeeOptions[0]?.id);

  if (!employeeOptions.some(employee => Number(employee.id) === employeeId)) {
    employeeId = Number(employeeOptions[0]?.id);
  }

  const percentage = assignment?.percentage ?? 50;
  const dateRange = getAssignmentModalDateRange(opts, assignment, editing);
  const selectedProjectId = assignment?.project_id || opts.project_id || '';
  const employeeSelect = `
    <div>
      <label class="field-label">Resource</label>
      <select id="fa_emp" class="field-input">
        ${employeeOptions.map(employee => `
          <option value="${employee.id}" ${Number(employee.id) === employeeId ? 'selected' : ''}>
            ${esc(employee.name)} – ${esc(employee.dept)}
          </option>
        `).join('')}
      </select>
    </div>
  `;
  const projectFields = `
    <div><label class="field-label">Project</label>${assignmentProjectCombo(selectedProjectId)}</div>
    ${assignmentProjectInfoBlock(selectedProjectId, assignment || {}, editing)}
  `;
  const dateFields = `
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="field-label">Start Date</label>
        <input id="fa_start" type="date" class="field-input" value="${dateRange.start}" ${editing ? '' : 'oninput="updateSlotPreview()"'}>
      </div>
      <div>
        <label class="field-label">End Date</label>
        <input id="fa_end" type="date" class="field-input" value="${dateRange.end}" ${editing ? '' : 'oninput="updateSlotPreview()"'}>
      </div>
    </div>
  `;

  if (editing) {
    openModal(`
      ${mHdr('Edit Assignment', 'Update workload allocation')}
      <div class="p-6 space-y-4">
        ${employeeSelect}
        ${projectFields}
        ${dateFields}
        ${assignmentPercentageField(percentage, true)}
      </div>
      ${mFtr(opts.id, 'saveAssignment', 'deleteAssignment')}
    `);
  } else {
    openModal(`
      ${mHdr('Add Assignment', 'Assign a resource to a project across a date range')}
      <div class="p-6 space-y-4">
        ${employeeSelect}
        ${projectFields}
        ${dateFields}
        <div>
          <label class="field-label">Quick Presets</label>
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
        ${assignmentPercentageField(percentage, false)}
      </div>
      ${mFtr(null, 'saveAssignment', 'deleteAssignment')}
    `);
    updateSlotPreview();
  }

  wireAssignmentPercentageControls();
  wireAssignmentProjectCombobox({ editing, assignment });
}

function wireAssignmentPercentageControls() {
  window.setPct = function setPct(value) {
    const slider = document.getElementById('fa_pct');
    if (!slider) return;
    slider.value = value;
    syncPctLabel(value);
  };

  window.syncPctLabel = function syncPctLabel(value) {
    const label = document.getElementById('pctLbl');
    if (label) label.textContent = `${value}%`;

    document.querySelectorAll('.pct-preset-btn').forEach(button => {
      const match = button.getAttribute('onclick')?.match(/setPct.(\d+)/);
      const active = match && Number(match[1]) === Number(value);
      button.style.background = active ? '#1e40af' : 'white';
      button.style.color = active ? 'white' : '#374151';
      button.style.borderColor = active ? '#1e40af' : '#e5e7eb';
    });
  };

  syncPctLabel(document.getElementById('fa_pct')?.value ?? 50);
}

function wireAssignmentProjectCombobox({ editing, assignment }) {
  const searchInput = document.getElementById('fa_proj_search');
  const hiddenInput = document.getElementById('fa_proj');
  const dropdown = document.getElementById('fa_proj_dropdown');
  if (!searchInput || !hiddenInput || !dropdown) return;

  const projects = S.projects.filter((project, index, all) =>
    all.findIndex(item => Number(item.id) === Number(project.id)) === index,
  );
  let selectedProjectId = hiddenInput.value;

  function projectLabel(projectId) {
    const project = getAssignmentProjectById(projectId);
    return project ? `${project.code} — ${project.name}` : '';
  }

  function setInfoFieldMode(input, editable) {
    if (!input) return;
    input.readOnly = !editable;
    input.classList.toggle('bg-gray-50', !editable);
    input.classList.toggle('text-gray-700', !editable);
    input.classList.toggle('font-semibold', !editable);
    input.classList.toggle('cursor-default', !editable);
  }

  function syncProjectInfo(projectId, preserveExistingValues = false) {
    const project = getAssignmentProjectById(projectId);
    const editable = editing && isPreSaleAssignmentProject(project);
    const customerInput = document.getElementById('fa_customer_name');
    const productInput = document.getElementById('fa_product_name');
    const hint = document.getElementById('fa_project_info_hint');

    setInfoFieldMode(customerInput, editable);
    setInfoFieldMode(productInput, editable);

    if (!preserveExistingValues) {
      const fallback = Number(projectId) === Number(assignment?.project_id)
        ? assignment
        : {};
      const customerName = getAssignmentCustomerName(project, fallback);
      const productName = getAssignmentProductName(project, fallback);

      if (customerInput) {
        customerInput.value = customerName;
        customerInput.title = customerName;
      }
      if (productInput) {
        productInput.value = productName;
        productInput.title = productName;
      }
    }

    if (hint) {
      hint.textContent = editable
        ? 'Pre Sale assignment: Customer Name and Product Name can be edited.'
        : 'Customer Name and Product Name are read-only except for Pre Sale assignments.';
      hint.className = `text-xs ${editable ? 'text-blue-600' : 'text-gray-400'} -mt-2`;
    }
  }

  function renderDropdown(query) {
    const normalizedQuery = String(query || '').toLowerCase().trim();
    const matches = normalizedQuery
      ? projects.filter(project =>
        [project.code, project.name, project.product_name, project.account_name]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(normalizedQuery)),
      )
      : projects;

    dropdown.innerHTML = matches.length
      ? matches.slice(0, 80).map(project => `
          <div
            class="proj-opt px-3 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 last:border-0"
            data-id="${project.id}"
            data-label="${esc(`${project.code} — ${project.name}`)}"
            style="display:flex;flex-direction:column;gap:1px"
          >
            <span style="font-size:12px;font-weight:700;color:#2563eb;font-family:monospace">${esc(project.code)}</span>
            <span style="font-size:13px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(project.name)}</span>
            ${project.product_name ? `<span style="font-size:11px;color:#9ca3af">${esc(project.product_name)}</span>` : ''}
          </div>
        `).join('')
      : '<div class="px-4 py-3 text-sm text-gray-400">No projects found</div>';

    dropdown.style.display = 'block';
  }

  function restoreSelectedProject() {
    if (!selectedProjectId) return;
    hiddenInput.value = selectedProjectId;
    searchInput.value = projectLabel(selectedProjectId);
    syncProjectInfo(selectedProjectId, true);
  }

  searchInput.addEventListener('focus', () => renderDropdown(''));
  searchInput.addEventListener('input', () => {
    hiddenInput.value = '';
    renderDropdown(searchInput.value);
  });
  searchInput.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    restoreSelectedProject();
    dropdown.style.display = 'none';
    searchInput.blur();
  });
  searchInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!hiddenInput.value) restoreSelectedProject();
      dropdown.style.display = 'none';
    }, 0);
  });

  dropdown.addEventListener('mousedown', event => {
    const option = event.target.closest('.proj-opt');
    if (!option) return;
    event.preventDefault();

    selectedProjectId = option.dataset.id;
    hiddenInput.value = selectedProjectId;
    searchInput.value = option.dataset.label;
    syncProjectInfo(selectedProjectId, false);
    dropdown.style.display = 'none';
  });
}

function setDateRange(preset) {
  const today = new Date();
  let start;
  let end;

  if (preset === 'week') {
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    end = addDaysLocal(start, 6);
  } else if (preset === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    end = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  } else if (preset === '3months') {
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    end = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
  } else {
    start = new Date(S.fiscalYear, 3, 1);
    end = new Date(S.fiscalYear + 1, 2, 31);
  }

  document.getElementById('fa_start').value = formatDateInputLocal(start);
  document.getElementById('fa_end').value = formatDateInputLocal(end);
  updateSlotPreview();
}

function updateSlotPreview() {
  const startInput = document.getElementById('fa_start');
  const endInput = document.getElementById('fa_end');
  const preview = document.getElementById('slotPreview');
  if (!startInput || !endInput || !preview) return;

  const slots = expandDateRange(startInput.value, endInput.value);
  preview.innerHTML = `Will create <span class="font-semibold">${slots.length}</span> weekly assignment${slots.length === 1 ? '' : 's'}`;
  preview.className = slots.length > 0
    ? 'bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800'
    : 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800';
}

async function saveAssignment(id) {
  const projectId = document.getElementById('fa_proj')?.value;
  if (!projectId) {
    toast('Please select a project', 'error');
    return;
  }

  const startDate = document.getElementById('fa_start')?.value;
  const endDate = document.getElementById('fa_end')?.value;
  const slots = expandDateRange(startDate, endDate);
  if (!slots.length) {
    toast('Invalid date range', 'error');
    return;
  }

  const project = getAssignmentProjectById(projectId);
  const payload = {
    employee_id: Number(document.getElementById('fa_emp').value),
    project_id: Number(projectId),
    percentage: Number(document.getElementById('fa_pct').value),
    slots,
  };

  if (id && isPreSaleAssignmentProject(project)) {
    payload.customer_name = cleanAssignmentInfoValue(
      document.getElementById('fa_customer_name')?.value,
    );
    payload.product_name = cleanAssignmentInfoValue(
      document.getElementById('fa_product_name')?.value,
    );
  }

  try {
    if (id) {
      const response = await api('POST', `/api/assignments/${id}/reschedule`, payload);
      closeModal();
      toast(`Assignment updated across ${response.created} week slot${response.created === 1 ? '' : 's'}`);
      await loadAll();
      return;
    }

    const response = await api('POST', '/api/assignments/bulk', payload);
    closeModal();
    toast(`Created ${response.created} assignment${response.created === 1 ? '' : 's'}`);
    await loadAll();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteAssignment(id) {
  if (!confirm('Delete this assignment?')) return;

  try {
    await api('DELETE', `/api/assignments/${id}`);
    closeModal();
    toast('Assignment deleted');
    await loadAll();
  } catch (error) {
    toast(error.message, 'error');
  }
}
