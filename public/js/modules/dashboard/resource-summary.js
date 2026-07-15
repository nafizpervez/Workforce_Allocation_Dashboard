/* Workforce Allocation Dashboard — dashboard/resource-summary.js */

/* Matrix filtering and rendering. Allocation/revenue formulas live in resource-summary-metrics.js. */

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
    const effectiveAssignments = getEffectiveFiscalAssignments(S.fiscalYear);
    employees = [...employees].sort((a, b) =>
      effectiveAssignments.filter(item => item.employee_id === b.id).length -
      effectiveAssignments.filter(item => item.employee_id === a.id).length,
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
    const percentageTotal = summary.allocationMeta.percentageTotals[column.key];
    const title = `${description} ${percentageTotal.toFixed(1)} total weekly percentage points ÷ ${summary.allocationMeta.fiscalWeekCount} available FY weeks = ${summary.allocation[column.key].toFixed(1)}%.`;

    return `
      <td
        class="matrix-fixed-cell sticky-allocation-${index + 1} col-allocation matrix-summary-cell matrix-allocation-cell"
        data-employee-id="${employee.id}"
        data-summary-group="allocation"
        data-summary-metric="${column.key}"
        title="${esc(title)}"
      >${formatAllocationViewValue(summary.allocation[column.key])}</td>
    `;
  }).join('');

  const revenueCells = RESOURCE_SUMMARY_COLUMNS.revenue.map((column, index) => {
    const meta = summary.revenueMeta[column.key];
    const revenue = summary.revenue[column.key];
    const title = meta.hasRevenueRate
      ? `${employee.name} · ${column.label}: ${meta.hours.toFixed(1)}h × ${formatHourlyRateValue(meta.rate)} = ${formatExactRevenueValue(revenue)}. Click for the project-level breakdown.`
      : `${employee.name} · ${column.label}: assign a supported designation and save the ${column.label} hourly rate in Reserve Revenue. Click for the assignment breakdown.`;

    return `
      <td
        class="matrix-fixed-cell sticky-revenue-${index + 1} col-revenue matrix-summary-cell matrix-revenue-cell"
        data-action="open-revenue-breakdown"
        data-employee-id="${employee.id}"
        data-revenue-key="${column.key}"
        data-summary-group="revenue"
        data-summary-metric="${column.key}"
        role="button"
        tabindex="0"
        aria-label="Open ${esc(employee.name)} ${esc(column.label)} revenue breakdown"
        title="${esc(title)}"
      >${formatRevenueViewValue(revenue)}</td>
    `;
  }).join('');

  return allocationCells + revenueCells;
}

function renderAssignmentCells(employee, months) {
  let cells = '';

  months.forEach(month => {
    for (let week = 1; week <= 4; week += 1) {
      const key = `${month.y}-${month.m}-${week}`;
      const assignments = (S.matrix[employee.id] && S.matrix[employee.id][key]) || [];
      const slotRange = weekDateRange(month.y, month.m, week);

      cells += `
        <td
          class="cell col-week ${week === 4 ? 'month-end' : ''}"
          data-emp="${employee.id}"
          data-year="${month.y}"
          data-month="${month.m}"
          data-week="${week}"
          data-start="${slotRange.start}"
          data-end="${slotRange.end}"
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
            data-year="${month.y}"
            data-month="${month.m}"
            data-week="${week}"
            data-start="${slotRange.start}"
            data-end="${slotRange.end}"
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

  const totalsRow = renderMatrixTotalsRow(employees, months);

  table.querySelector('tbody').innerHTML = employees.length
    ? totalsRow + rows.join('')
    : `
      <tr>
        <td colspan="${columnCount}" class="matrix-empty-state">No resources found.</td>
      </tr>
    `;
}
