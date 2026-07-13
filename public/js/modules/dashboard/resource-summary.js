/* Workforce Allocation Dashboard — dashboard/resource-summary.js */

/* ================================================================ MATRIX */
const RESOURCE_SUMMARY_COLUMNS = {
  allocation: [
    { key: 'intrasourcing', label: 'Intrasourcing' },
    { key: 'local', label: 'Local' },
    { key: 'preSale', label: 'Pre Sale' },
    { key: 'training', label: 'Training' },
    { key: 'generalAdmin', label: 'General Admin' },
  ],
  revenue: [
    { key: 'service', label: 'Service' },
    { key: 'preSale', label: 'Pre Sale' },
  ],
};

const RESOURCE_ALLOCATION_RULES = Object.freeze([
  Object.freeze({
    key: 'intrasourcing',
    label: 'Intrasourcing',
    pattern: /intrasource/i,
    description: 'Project name contains “Intrasource”.',
  }),
  Object.freeze({
    key: 'preSale',
    label: 'Pre Sale',
    pattern: /pre[\s-]*sale/i,
    description: 'Project name contains “Pre Sale” or “Pre-Sale”.',
  }),
  Object.freeze({
    key: 'training',
    label: 'Training',
    pattern: /training[\s-]*delivery/i,
    description: 'Project name contains “Training Delivery” or “Training-Delivery”.',
  }),
  Object.freeze({
    key: 'generalAdmin',
    label: 'General Admin',
    pattern: /general[\s-]*admin/i,
    description: 'Project name contains “General Admin” or “General-Admin”.',
  }),
]);

const RESOURCE_ALLOCATION_RULE_BY_KEY = Object.freeze(
  Object.fromEntries(RESOURCE_ALLOCATION_RULES.map(rule => [rule.key, rule])),
);

function getSummaryAssignmentProjectName(assignment) {
  if (assignment.project_name) return String(assignment.project_name).trim();

  const project = S.projects.find(item =>
    Number(item.id) === Number(assignment.project_id),
  );

  return String(project?.name || '').trim();
}

/*
 * Category matching is case-insensitive and searches the complete project name.
 * The flexible separators allow both spaces and hyphens, including repeated
 * combinations such as "Pre - Sale" after normalization.
 */
function normalizeAllocationProjectName(value) {
  return String(value || '')
    .replace(/[‐‑‒–—−_]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyAllocationProject(projectName) {
  const normalizedName = normalizeAllocationProjectName(projectName);
  const matchingRule = RESOURCE_ALLOCATION_RULES.find(rule =>
    rule.pattern.test(normalizedName),
  );

  return matchingRule?.key || 'local';
}

/*
 * Assignment rows are stored once per matrix week. For a category, duplicate
 * rows in the same week are added together, then the weekly totals are averaged
 * across the weeks where that category has an assignment. Local includes every
 * project that does not match one of the four named non-local categories.
 */
function getEmployeeCategoryAllocation(employeeId, categoryKey) {
  const weeklyTotals = new Map();

  S.assignments.forEach(assignment => {
    if (Number(assignment.employee_id) !== Number(employeeId)) return;

    const projectName = getSummaryAssignmentProjectName(assignment);
    if (classifyAllocationProject(projectName) !== categoryKey) return;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage)) return;

    const slotKey = `${assignment.year}-${assignment.month}-${assignment.week}`;
    weeklyTotals.set(slotKey, (weeklyTotals.get(slotKey) || 0) + percentage);
  });

  if (!weeklyTotals.size) return 0;

  const values = [...weeklyTotals.values()];
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getResourceSummaryViewData(employee) {
  return {
    allocation: {
      intrasourcing: getEmployeeCategoryAllocation(employee.id, 'intrasourcing'),
      local: getEmployeeCategoryAllocation(employee.id, 'local'),
      preSale: getEmployeeCategoryAllocation(employee.id, 'preSale'),
      training: getEmployeeCategoryAllocation(employee.id, 'training'),
      generalAdmin: getEmployeeCategoryAllocation(employee.id, 'generalAdmin'),
    },
    // Revenue calculations remain intentionally unimplemented for now.
    revenue: {
      service: null,
      preSale: null,
    },
  };
}

function formatAllocationViewValue(value) {
  return value === null || value === undefined
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function formatRevenueViewValue(value) {
  return value === null || value === undefined
    ? '—'
    : `$${Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
}

function getFilteredMatrixEmployees() {
  const query = S.searchQuery.toLowerCase().trim();
  const activeEmployees = getActiveEmployees();

  let employees = activeEmployees.filter(employee => {
    if (!query) return true;

    return [
      employee.name,
      employee.designation,
      employee.dept,
      employee.employee_code,
      employee.email,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  if (S.matrixProjectFilter) {
    const projectId = Number(S.matrixProjectFilter);
    employees = employees.filter(employee =>
      S.assignments.some(assignment =>
        assignment.employee_id === employee.id &&
        assignment.project_id === projectId,
      ),
    );
  }

  if (S.matrixResourceFilter) {
    employees = employees.filter(employee =>
      employee.id === Number(S.matrixResourceFilter),
    );
  }

  if (S.matrixMonthFilter) {
    const [year, month] = S.matrixMonthFilter.split('-').map(Number);
    employees = employees.filter(employee =>
      S.assignments.some(assignment =>
        assignment.employee_id === employee.id &&
        assignment.year === year &&
        assignment.month === month,
      ),
    );
  }

  if (
    S.matrixStageFilt ||
    S.matrixAmountFilt ||
    S.matrixCloseDateFilt ||
    S.matrixProjCloseFilt
  ) {
    const matchingProjectIds = new Set(
      S.projects
        .filter(project => {
          if (S.matrixStageFilt && project.stage !== S.matrixStageFilt) return false;
          if (!getAmountOk(project.opp_amount, S.matrixAmountFilt)) return false;
          if (!matchDateFilter(project.end_date, S.matrixCloseDateFilt)) return false;
          if (!matchDateFilter(project.project_closing_date, S.matrixProjCloseFilt)) return false;
          return true;
        })
        .map(project => project.id),
    );

    employees = employees.filter(employee =>
      S.assignments.some(assignment =>
        assignment.employee_id === employee.id &&
        matchingProjectIds.has(assignment.project_id),
      ),
    );
  }

  if (S.matrixSortAssigned) {
    employees = [...employees].sort((a, b) =>
      S.assignments.filter(item => item.employee_id === b.id).length -
      S.assignments.filter(item => item.employee_id === a.id).length,
    );
  } else if (S.matrixSortHigh) {
    employees = [...employees].sort((a, b) =>
      (S.employeeUtil.get(b.id) || 0) - (S.employeeUtil.get(a.id) || 0),
    );
  } else if (S.matrixSortLow) {
    employees = [...employees].sort((a, b) =>
      (S.employeeUtil.get(a.id) || 0) - (S.employeeUtil.get(b.id) || 0),
    );
  }

  const filterInfo = document.getElementById('matrixFilterInfo');
  if (filterInfo) {
    filterInfo.textContent = employees.length < activeEmployees.length
      ? `Showing ${employees.length} active resource${employees.length === 1 ? '' : 's'}`
      : '';
  }

  return employees;
}

function renderMatrixHeader(months) {
  let header = '<tr class="months">';

  header += `
    <th class="sticky-sn col-sn matrix-fixed-heading" rowspan="2">SN</th>
    <th class="sticky-name col-name matrix-fixed-heading" rowspan="2">
      <div class="matrix-resource-heading">
        <span>Resource</span>
        <div class="col-resizer" data-col="name"></div>
      </div>
    </th>
    <th
      class="sticky-allocation-group matrix-summary-group matrix-allocation-group"
      colspan="${RESOURCE_SUMMARY_COLUMNS.allocation.length}"
    >Allocation</th>
    <th
      class="sticky-revenue-group matrix-summary-group matrix-revenue-group"
      colspan="${RESOURCE_SUMMARY_COLUMNS.revenue.length}"
    >Revenue</th>
  `;

  months.forEach((month, index) => {
    header += `
      <th
        colspan="4"
        class="border-b border-gray-200 px-2 py-3 text-center text-xs font-semibold text-gray-700 bg-gray-50 ${index < months.length - 1 ? 'border-r border-gray-200' : ''}"
      >${esc(month.label)}</th>
    `;
  });

  header += '</tr><tr class="weeks">';

  RESOURCE_SUMMARY_COLUMNS.allocation.forEach((column, index) => {
    header += `
      <th
        class="sticky-allocation-${index + 1} col-allocation matrix-summary-subheading matrix-allocation-subheading"
        title="${esc(column.label)}"
      ><span>${esc(column.label)}</span></th>
    `;
  });

  RESOURCE_SUMMARY_COLUMNS.revenue.forEach((column, index) => {
    header += `
      <th
        class="sticky-revenue-${index + 1} col-revenue matrix-summary-subheading matrix-revenue-subheading"
        title="${esc(column.label)}"
      ><span>${esc(column.label)}</span></th>
    `;
  });

  months.forEach(() => {
    for (let week = 1; week <= 4; week += 1) {
      header += `
        <th
          class="border-b border-gray-200 px-2 py-2 text-center text-xs text-gray-500 font-medium bg-gray-50 col-week ${week === 4 ? 'border-r border-gray-200' : 'border-r border-dotted border-gray-200'}"
        >W${week}</th>
      `;
    }
  });

  header += '</tr>';
  return header;
}

function renderResourceSummaryCells(employee) {
  const summary = getResourceSummaryViewData(employee);

  const allocationCells = RESOURCE_SUMMARY_COLUMNS.allocation.map((column, index) => {
    const rule = RESOURCE_ALLOCATION_RULE_BY_KEY[column.key];
    const description = rule?.description ||
      'All projects not classified as Intrasourcing, Pre Sale, Training, or General Admin.';

    return `
      <td
        class="matrix-fixed-cell sticky-allocation-${index + 1} col-allocation matrix-summary-cell matrix-allocation-cell"
        data-employee-id="${employee.id}"
        data-summary-group="allocation"
        data-summary-metric="${column.key}"
        title="${esc(description)}"
      >${formatAllocationViewValue(summary.allocation[column.key])}</td>
    `;
  }).join('');

  const revenueCells = RESOURCE_SUMMARY_COLUMNS.revenue.map((column, index) => `
    <td
      class="matrix-fixed-cell sticky-revenue-${index + 1} col-revenue matrix-summary-cell matrix-revenue-cell"
      data-employee-id="${employee.id}"
      data-summary-group="revenue"
      data-summary-metric="${column.key}"
    >${formatRevenueViewValue(summary.revenue[column.key])}</td>
  `).join('');

  return allocationCells + revenueCells;
}

function renderAssignmentCells(employee, months) {
  let cells = '';

  months.forEach(month => {
    for (let week = 1; week <= 4; week += 1) {
      const key = `${month.y}-${month.m}-${week}`;
      const assignments = (S.matrix[employee.id] && S.matrix[employee.id][key]) || [];

      cells += `
        <td
          class="cell col-week ${week === 4 ? 'month-end' : ''}"
          data-emp="${employee.id}"
          data-year="${month.y}"
          data-month="${month.m}"
          data-week="${week}"
        >
      `;

      assignments.forEach(assignment => {
        const project = S.projects.find(item => item.id === assignment.project_id) || {};
        const customer = assignment.account_name || project.account_name || project.client || '—';
        const product = assignment.product_name || project.product_name || '—';
        const title = `${assignment.project_code || project.code || ''} — ${assignment.project_name || project.name || ''}\nCustomer Name: ${customer}\nProduct Name: ${product}`;
        const displayName = shortCustomerName(customer) || assignment.project_code;

        cells += `
          <div
            class="chip"
            data-action="edit-assign"
            data-id="${assignment.id}"
            style="background:${assignment.project_color}20;border-left:3px solid ${assignment.project_color};min-width:0;width:100%;box-sizing:border-box;"
            title="${esc(title)}"
          >
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:4px;min-width:0;">
              <span class="chip-code" style="color:${assignment.project_color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:11px;">${esc(displayName)}</span>
              <span class="chip-pct" style="color:#6b7280;white-space:nowrap;flex-shrink:0;font-size:11px;">${assignment.percentage}%</span>
            </div>
            <span class="chip-del" data-action="delete-assign" data-id="${assignment.id}">×</span>
          </div>
        `;
      });

      cells += '<span class="cell-add">+</span></td>';
    }
  });

  return cells;
}

function renderMatrix() {
  const table = document.getElementById('matrixTable');
  const months = fiscalMonths(S.fiscalYear);
  const employees = getFilteredMatrixEmployees();

  table.querySelector('thead').innerHTML = renderMatrixHeader(months);

  const rows = employees.map((employee, index) => {
    const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';

    return `
      <tr class="matrix-row ${rowClass}" data-emp="${employee.id}">
        <td class="matrix-fixed-cell sticky-sn col-sn matrix-sn-cell">${index + 1}</td>
        <td class="matrix-fixed-cell sticky-name col-name matrix-resource-cell">
          <button
            type="button"
            class="matrix-resource-button"
            data-action="edit-emp"
            data-emp="${employee.id}"
          >
            <span class="matrix-avatar avatar-grad">${esc(inits(employee.name))}</span>
            <span class="matrix-resource-copy">
              <span class="matrix-resource-name">${esc(employee.name)}</span>
              <span class="matrix-resource-designation">${esc(employee.designation || 'No designation')}</span>
            </span>
          </button>
        </td>
        ${renderResourceSummaryCells(employee)}
        ${renderAssignmentCells(employee, months)}
      </tr>
    `;
  });

  const columnCount = 2 +
    RESOURCE_SUMMARY_COLUMNS.allocation.length +
    RESOURCE_SUMMARY_COLUMNS.revenue.length +
    (months.length * 4);

  table.querySelector('tbody').innerHTML = rows.join('') || `
    <tr>
      <td colspan="${columnCount}" class="matrix-empty-state">No resources found.</td>
    </tr>
  `;
}
