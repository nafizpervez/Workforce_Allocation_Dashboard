/* ── Resource (Employee) modal ────────────────────────────────── */
function openEmployeeModal(opts = {}) {
  const editing = Boolean(opts.id);
  const employee = editing
    ? S.employees.find(item => item.id === opts.id)
    : null;

  const values = {
    name: employee?.name || '',
    code: employee?.employee_code || '',
    email: employee?.email || '',
    dept: employee?.dept || 'Professional Services',
    designation: employee?.designation || '',
    workdays: Number.isInteger(Number(employee?.workdays))
      ? Number(employee.workdays)
      : getDefaultAnnualWorkdays(),
  };

  const departments = [
    'Solution',
    'Professional Services',
    'Finance',
    'Sales',
    'Operations',
    'Management',
  ];

  const supportedDesignation = RESOURCE_DESIGNATIONS.some(designation =>
    normalizeDesignationKey(designation) === normalizeDesignationKey(values.designation),
  );
  const designationOptions = [
    '<option value="">Select designation</option>',
    ...RESOURCE_DESIGNATIONS.map(designation => `
      <option
        value="${esc(designation)}"
        ${normalizeDesignationKey(designation) === normalizeDesignationKey(values.designation) ? 'selected' : ''}
      >${esc(designation)}</option>
    `),
  ];

  if (values.designation && !supportedDesignation) {
    designationOptions.push(`
      <option value="${esc(values.designation)}" selected>
        ${esc(values.designation)} (legacy)
      </option>
    `);
  }

  openModal(`
    ${mHdr(
      editing ? 'Edit Resource' : 'Add Resource',
      editing ? 'Update resource details' : 'Add a new team resource',
    )}

    <div class="p-6 space-y-4 max-h-[65vh] overflow-y-auto nice-scroll">
      <div>
        <label class="field-label">Full Name</label>
        <input
          id="fe_name"
          type="text"
          class="field-input"
          value="${esc(values.name)}"
          placeholder="e.g. Nusrath Jahan Nisha"
        >
      </div>

      <div>
        <label class="field-label">Resource ID (Employee ID)</label>
        <input
          id="fe_code"
          type="text"
          class="field-input mono"
          value="${esc(values.code)}"
          placeholder="e.g. SGESA00055"
        >
      </div>

      <div>
        <label class="field-label">Email</label>
        <input
          id="fe_email"
          type="email"
          class="field-input"
          value="${esc(values.email)}"
          placeholder="employee@example.com"
        >
      </div>

      <div>
        <label class="field-label">Department</label>
        <select id="fe_dept" class="field-input">
          ${departments.map(department => `
            <option
              value="${esc(department)}"
              ${department === values.dept ? 'selected' : ''}
            >
              ${esc(department)}
            </option>
          `).join('')}
        </select>
      </div>

      <div>
        <label class="field-label">Designation</label>
        <select id="fe_designation" class="field-input">
          ${designationOptions.join('')}
        </select>
      </div>

      <div>
        <label class="field-label">Workdays</label>
        <input
          id="fe_workdays"
          type="number"
          class="field-input"
          value="${esc(String(values.workdays))}"
          min="0"
          step="1"
          inputmode="numeric"
        >
      </div>
    </div>

    ${mFtr(editing ? opts.id : null, 'saveEmployee', 'deleteEmployee')}
  `);
}

async function saveEmployee(id) {
  const payload = {
    employee_code: document.getElementById('fe_code').value.trim(),
    name: document.getElementById('fe_name').value.trim(),
    email: document.getElementById('fe_email').value.trim(),
    dept: document.getElementById('fe_dept').value,
    designation: document.getElementById('fe_designation').value.trim(),
    workdays: Number(document.getElementById('fe_workdays').value),
  };

  if (!payload.name) {
    toast('Name is required', 'error');
    return;
  }

  if (!Number.isInteger(payload.workdays) || payload.workdays < 0) {
    toast('Workdays must be a non-negative whole number', 'error');
    return;
  }

  try {
    if (id) {
      await api('PUT', `/api/employees/${id}`, payload);
    } else {
      await api('POST', '/api/employees', payload);
    }

    closeModal();
    toast(`Resource ${id ? 'updated' : 'added'}`);
    await loadAll();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteEmployee(id) {
  if (!confirm('Delete this resource? All their assignments will also be removed.')) return;

  try {
    await api('DELETE', `/api/employees/${id}`);
    closeModal();
    toast('Resource deleted');
    await loadAll();
  } catch (error) {
    toast(error.message, 'error');
  }
}


/* ── Project modal ────────────────────────────────────────────── */
function fiscalPeriodFromProjectDate(dateText) {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) return '';

  const fiscalYearEnd = month >= 4 ? year + 1 : year;
  const quarter = month >= 4 && month <= 6
    ? 1
    : month >= 7 && month <= 9
      ? 2
      : month >= 10
        ? 3
        : 4;
  return `Q${quarter}-${fiscalYearEnd}`;
}

function openProjectModal(opts = {}) {
  const editing = !!opts.id, p = editing ? S.projects.find(x => x.id === opts.id) : null, v = (k, fb) => p ? (p[k] ?? fb) : fb;
  const projectEndDate = v('end_date', '');
  const projectFiscalPeriod = fiscalPeriodFromProjectDate(projectEndDate) || v('fiscal_period', '');
  const OWNER_OPTS = ['Abdullah Al Baki', 'Basher Muhammad Raquibul Raquibul', 'Zobayer Ahmed', 'Most Iffat Ara Ila', 'Md Naiemul Haque Chowdhury', 'Mohammad A. Hadi'];
  const todayStr = new Date().toISOString().slice(0, 10);
  openModal(`${mHdr(editing ? 'Edit Project' : 'Add Project', editing ? 'Update project details' : 'Register a new project')}<div class="p-6 space-y-4 max-h-[55vh] overflow-y-auto nice-scroll">
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Opportunity Number</label><input id="fp_code" type="text" class="field-input mono" value="${esc(v('code', ''))}" placeholder="e.g. SA136664"></div><div><label class="field-label">Priority</label><select id="fp_pri" class="field-input">${PRIORITIES.map(x => `<option ${x === v('priority', 'Medium') ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div><label class="field-label">Project Name</label><input id="fp_name" type="text" class="field-input" value="${esc(v('name', ''))}" placeholder="e.g. Desktop SW for IWM 2026"></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Account Name</label><input id="fp_account" type="text" class="field-input" value="${esc(v('account_name', v('client', '')))}"></div><div><label class="field-label">Product Name</label><input id="fp_product_name" type="text" class="field-input" value="${esc(v('product_name', ''))}"></div></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Product Family</label><input id="fp_product_family" type="text" class="field-input" value="${esc(v('product_family', ''))}" placeholder="e.g. Professional Service, Software…"></div><div><label class="field-label">Opportunity Owner</label><input id="fp_owner" type="text" class="field-input" list="ownerList" value="${esc(v('opportunity_owner', ''))}"><datalist id="ownerList">${OWNER_OPTS.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Stage</label><select id="fp_stage" class="field-input">${STAGES.map(x => `<option ${x === v('stage', 'Prospect') ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label class="field-label">Fiscal Period</label><input id="fp_fiscal_period" type="text" class="field-input bg-gray-50 text-gray-600" value="${esc(projectFiscalPeriod)}" placeholder="Calculated from Closed Won Date" readonly><div class="text-xs text-gray-400 mt-1">Calculated automatically using the April–March fiscal calendar.</div></div></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Product Amount (USD)</label><input id="fp_product_amount" type="number" class="field-input" value="${v('product_amount', 0)}" min="0" step="0.01"></div><div><label class="field-label">Probability (%)</label><input id="fp_probability" type="number" class="field-input" value="${v('probability', 0)}" min="0" max="100" step="5"></div></div>
    <div class="grid grid-cols-3 gap-3"><div><label class="field-label">Created Date</label><input id="fp_created" type="date" class="field-input" value="${esc(v('created_date', todayStr))}"></div><div><label class="field-label">Closed Won Date</label><input id="fp_end" type="date" class="field-input" value="${esc(projectEndDate)}"></div><div><label class="field-label">Project Closing Date</label><input id="fp_closing" type="date" class="field-input" value="${esc(v('project_closing_date', ''))}"></div></div>
    <div><label class="field-label">Amount (USD)</label><input id="fp_opp_amount" type="number" class="field-input" value="${v('opp_amount', 0)}" min="0" step="0.01"></div>
    <div><label class="field-label">Progress (internal) <span class="text-xs text-gray-400 font-normal ml-1">0 – 100</span></label><input id="fp_prog" type="number" min="0" max="100" step="1" value="${v('progress', 0)}" class="field-input" placeholder="0"></div>
    <label class="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 cursor-pointer">
      <input id="fp_not_local_project" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${Number(v('not_local_project', 0)) === 1 ? 'checked' : ''}>
      <span><strong class="block text-sm font-semibold text-gray-800">Not Local Project?</strong><small class="block mt-0.5 text-xs leading-5 text-gray-500">When selected, this project is included under the shared Not Local option in the Plan-to-Execution Map instead of being included in the generic Local work-type bucket.</small></span>
    </label>
    <div><label class="field-label">Color</label><div class="flex flex-wrap gap-2" id="cpkr">${PCOLORS.map(c => `<button type="button" data-c="${c}" title="${c}" class="w-8 h-8 rounded-lg border border-gray-300 hover:scale-105 transition-transform ${c === v('color', '#8B5CF6') ? 'ring-2 ring-offset-2 ring-gray-900' : ''}" style="background:${c}"></button>`).join('')}</div><input type="hidden" id="fp_color" value="${v('color', '#8B5CF6')}"></div>
  </div>${mFtr(editing ? opts.id : null, 'saveProject', 'deleteProject')}`);
  document.querySelectorAll('#cpkr button').forEach(b => b.addEventListener('click', () => { document.getElementById('fp_color').value = b.dataset.c; document.querySelectorAll('#cpkr button').forEach(x => x.classList.remove('ring-2', 'ring-offset-2', 'ring-gray-900')); b.classList.add('ring-2', 'ring-offset-2', 'ring-gray-900'); }));
  const closedWonDateInput = document.getElementById('fp_end');
  const fiscalPeriodInput = document.getElementById('fp_fiscal_period');
  closedWonDateInput?.addEventListener('input', () => {
    fiscalPeriodInput.value = fiscalPeriodFromProjectDate(closedWonDateInput.value);
  });
}

async function saveProject(id) {
  const code = document.getElementById('fp_code').value.trim().toUpperCase();
  const name = document.getElementById('fp_name').value.trim();
  if (!code || !name) { toast('Opportunity Number and Project Name are required', 'error'); return; }
  const amount = +document.getElementById('fp_opp_amount').value;
  const payload = { code, name, account_name: document.getElementById('fp_account').value.trim(), client: document.getElementById('fp_account').value.trim(), product_name: document.getElementById('fp_product_name').value.trim(), product_family: document.getElementById('fp_product_family').value.trim(), opportunity_owner: document.getElementById('fp_owner').value.trim(), stage: document.getElementById('fp_stage').value, fiscal_period: document.getElementById('fp_fiscal_period').value.trim(), priority: document.getElementById('fp_pri').value, product_amount: +document.getElementById('fp_product_amount').value, probability: +document.getElementById('fp_probability').value, created_date: document.getElementById('fp_created').value, end_date: document.getElementById('fp_end').value, project_closing_date: document.getElementById('fp_closing').value, opp_amount: amount, budget: amount, progress: +document.getElementById('fp_prog').value, not_local_project: document.getElementById('fp_not_local_project').checked ? 1 : 0, color: document.getElementById('fp_color').value };
  try { if (id) await api('PUT', `/api/projects/${id}`, payload); else await api('POST', '/api/projects', payload); closeModal(); toast(`Project ${id ? 'updated' : 'created'}`); await loadAll(); } catch (e) { toast(e.message, 'error'); }
}

async function deleteProject(id) { if (!confirm('Delete this project? All its assignments will also be removed.')) return; try { await api('DELETE', `/api/projects/${id}`); closeModal(); toast('Project deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

/* ── Active Resources drill-down ─────────────────────────────── */
function openEmployeesModal() {
  const rows = S.employees.map((e, i) => `
    <div class="flex items-center gap-4 py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer last:border-0" data-action="edit-emp-side" data-emp="${e.id}">
      <span class="text-xs font-semibold text-gray-400 w-5 flex-shrink-0">${i + 1}</span>
      <div class="w-9 h-9 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(e.name))}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-gray-900">${esc(e.name)}</div>
        <div class="text-xs text-gray-500 mono">${esc(e.employee_code || '—')}</div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-xs text-gray-500">${esc(e.dept)}</div>
        <div class="text-xs text-gray-400 truncate max-w-[160px]">${esc(e.email || '—')}</div>
      </div>
      <div class="flex-shrink-0">
        ${(() => { const u = S.employeeUtil.get(e.id) || 0; return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${ub(u)}">${Math.round(u)}%</span>`; })()}
      </div>
    </div>`).join('');

  const tableHtml = (emps) => emps.length
    ? `<table class="w-full text-left border-collapse">
        <thead><tr class="border-b border-gray-200">
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Code</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Name</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Dept</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Util</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Status</th>
        </tr></thead>
        <tbody>${emps.map(e => '').join('')}</tbody>
      </table>`
    : '<p class="text-sm text-gray-400 py-4 px-4">None</p>';

  // (Note: full Active Resources modal is implemented in openResourceModal below)
}

