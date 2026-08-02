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
      S.matrixAssignments.some(assignment =>
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
      S.matrixAssignments.some(assignment =>
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
      S.matrixAssignments.some(assignment =>
        assignment.employee_id === employee.id &&
        matchingProjectIds.has(assignment.project_id),
      ),
    );
  }

  if (S.matrixSortAssigned) {
    const effectiveAssignments = getEffectiveFiscalAssignments(S.matrixFiscalYear, S.matrixAssignments);
    employees = [...employees].sort((a, b) =>
      effectiveAssignments.filter(item => item.employee_id === b.id).length -
      effectiveAssignments.filter(item => item.employee_id === a.id).length,
    );
  } else if (S.matrixSortHigh) {
    employees = [...employees].sort((a, b) =>
      (S.matrixEmployeeUtil.get(b.id) || 0) - (S.matrixEmployeeUtil.get(a.id) || 0),
    );
  } else if (S.matrixSortLow) {
    employees = [...employees].sort((a, b) =>
      (S.matrixEmployeeUtil.get(a.id) || 0) - (S.matrixEmployeeUtil.get(b.id) || 0),
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

function formatMatrixMonthHeaderAllocation(value) {
  const numericValue = Number(value);
  return `${Math.round(Number.isFinite(numericValue) ? numericValue : 0)}%`;
}

function formatMatrixMandays(value) {
  const numericValue = Number(value);
  return (Number.isFinite(numericValue) ? numericValue : 0).toLocaleString(
    'en-US',
    { minimumFractionDigits: 0, maximumFractionDigits: 1 },
  );
}

const MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID = 'matrixMonthBreakdownTooltip';

function formatMatrixBreakdownNumber(value, maximumFractionDigits = 1) {
  const numericValue = Number(value);
  return (Number.isFinite(numericValue) ? numericValue : 0).toLocaleString(
    'en-US',
    { minimumFractionDigits: 0, maximumFractionDigits },
  );
}

function getMatrixMonthBreakdownTooltip() {
  let tooltip = document.getElementById(MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID);
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.id = MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID;
  tooltip.className = 'matrix-month-breakdown-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);
  return tooltip;
}

function getMatrixMonthBreakdownData(heading) {
  const number = key => {
    const value = Number(heading?.dataset?.[key]);
    return Number.isFinite(value) ? value : 0;
  };

  return {
    monthLabel: String(heading?.dataset?.monthLabel || ''),
    intrasourcingAverageAllocation: number('intrasourcingAverageAllocation'),
    localAverageAllocation: number('localAverageAllocation'),
    intrasourcingRevenue: number('intrasourcingRevenue'),
    localRevenue: number('localRevenue'),
  };
}

function renderMatrixMonthBreakdownTooltip(data) {
  return `
    <div class="matrix-month-breakdown-tooltip__title">${esc(data.monthLabel)}</div>
    <table class="matrix-month-breakdown-tooltip__table">
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col">Intrasourcing</th>
          <th scope="col">Local</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Allocation</th>
          <td>${esc(`${formatMatrixBreakdownNumber(data.intrasourcingAverageAllocation, 1)}%`)}</td>
          <td>${esc(`${formatMatrixBreakdownNumber(data.localAverageAllocation, 1)}%`)}</td>
        </tr>
        <tr>
          <th scope="row">Revenue</th>
          <td>${esc(formatRevenueViewValue(data.intrasourcingRevenue))}</td>
          <td>${esc(formatRevenueViewValue(data.localRevenue))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function positionMatrixMonthBreakdownTooltip(tooltip, heading) {
  const margin = 12;
  const gap = 8;
  const headingRect = heading.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  let left = headingRect.left + (headingRect.width / 2) - (tooltipRect.width / 2);
  let top = headingRect.bottom + gap;

  left = Math.max(margin, Math.min(left, viewportWidth - tooltipRect.width - margin));
  if (top + tooltipRect.height > viewportHeight - margin) {
    top = Math.max(margin, headingRect.top - tooltipRect.height - gap);
  }

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showMatrixMonthBreakdownTooltip(heading) {
  const tooltip = getMatrixMonthBreakdownTooltip();
  tooltip.innerHTML = renderMatrixMonthBreakdownTooltip(
    getMatrixMonthBreakdownData(heading),
  );
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');
  heading.setAttribute('aria-describedby', MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID);
  positionMatrixMonthBreakdownTooltip(tooltip, heading);
}

function hideMatrixMonthBreakdownTooltip() {
  const tooltip = document.getElementById(MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID);
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
  document.querySelectorAll(`.matrix-month-heading[aria-describedby="${MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID}"]`)
    .forEach(heading => heading.removeAttribute('aria-describedby'));
}

function installMatrixMonthBreakdownTooltip() {
  if (window.__matrixMonthBreakdownTooltipInstalled) return;
  window.__matrixMonthBreakdownTooltipInstalled = true;

  document.addEventListener('pointerover', event => {
    const heading = event.target.closest?.('.matrix-month-heading[data-month-breakdown="true"]');
    if (!heading || heading.contains(event.relatedTarget)) return;
    showMatrixMonthBreakdownTooltip(heading);
  });

  document.addEventListener('pointerout', event => {
    const heading = event.target.closest?.('.matrix-month-heading[data-month-breakdown="true"]');
    if (!heading || heading.contains(event.relatedTarget)) return;
    hideMatrixMonthBreakdownTooltip();
  });

  document.addEventListener('focusin', event => {
    const heading = event.target.closest?.('.matrix-month-heading[data-month-breakdown="true"]');
    if (heading) showMatrixMonthBreakdownTooltip(heading);
  });

  document.addEventListener('focusout', event => {
    const heading = event.target.closest?.('.matrix-month-heading[data-month-breakdown="true"]');
    if (!heading || heading.contains(event.relatedTarget)) return;
    hideMatrixMonthBreakdownTooltip();
  });

  window.addEventListener('resize', hideMatrixMonthBreakdownTooltip);
  window.addEventListener('scroll', hideMatrixMonthBreakdownTooltip, true);
}

installMatrixMonthBreakdownTooltip();

function renderMatrixHeader(months, employees, unavailableSlots) {
  const allocationColumns = getResourceSummaryAllocationColumns();
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
      colspan="${allocationColumns.length}"
    >Allocation (%)</th>
    <th
      class="sticky-revenue-group matrix-summary-group matrix-revenue-group"
      colspan="${RESOURCE_SUMMARY_COLUMNS.revenue.length}"
      style="${getMatrixRevenueStickyStyle(0, allocationColumns.length)}"
    >Revenue ($)</th>
  `;

  months.forEach((month, index) => {
    const revenue = getMatrixMonthPlannedRevenue(employees, month, unavailableSlots);
    const allocation = getMatrixMonthAllocationMetrics(
      employees,
      month,
      unavailableSlots,
    );
    header += `
      <th
        colspan="4"
        class="matrix-month-heading border-b border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700 bg-gray-50 ${index < months.length - 1 ? 'border-r border-gray-200' : ''}"
        data-month-breakdown="true"
        data-month-label="${esc(month.label)}"
        data-intrasourcing-average-allocation="${allocation.categoryAllocation.intrasourcing.averageAllocation}"
        data-local-average-allocation="${allocation.categoryAllocation.local.averageAllocation}"
        data-intrasourcing-revenue="${Number(revenue.byCategory?.intrasourcing) || 0}"
        data-local-revenue="${Number(revenue.byCategory?.local) || 0}"
        tabindex="0"
        aria-label="${esc(`${month.label} Intrasourcing and Local allocation and revenue breakdown. Hover or focus to view the table.`)}"
      >
        <span class="matrix-month-label">
          ${esc(month.label)}
          <span class="matrix-month-allocation">(${formatMatrixMonthHeaderAllocation(allocation.averageAllocation)})</span>
        </span>
        <span class="matrix-month-metrics">
          <span class="matrix-month-revenue">${formatRevenueViewValue(revenue.amount)}</span>
          <span class="matrix-month-separator" aria-hidden="true">·</span>
          <span class="matrix-month-unallocated">${formatMatrixMandays(allocation.unallocatedMandays)} unallocated days</span>
        </span>
      </th>
    `;
  });

  header += '</tr><tr class="weeks">';

  allocationColumns.forEach((column, index) => {
    const projectReference = column.isNotLocalProject && column.projectCode
      ? `${column.projectCode} — ${column.label}`
      : column.label;
    header += `
      <th
        class="sticky-allocation-cell col-allocation matrix-summary-subheading matrix-allocation-subheading ${column.isNotLocalProject ? 'matrix-not-local-subheading' : ''}"
        style="${getMatrixAllocationStickyStyle(index)}"
        title="${esc(projectReference)}"
        data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
      ><span>${esc(column.label)}</span></th>
    `;
  });

  RESOURCE_SUMMARY_COLUMNS.revenue.forEach((column, index) => {
    header += `
      <th
        class="sticky-revenue-cell col-revenue matrix-summary-subheading matrix-revenue-subheading ${index === RESOURCE_SUMMARY_COLUMNS.revenue.length - 1 ? 'matrix-summary-end' : ''}"
        style="${getMatrixRevenueStickyStyle(index, allocationColumns.length)}"
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

function renderResourceSummaryCells(employee, summary = getResourceSummaryViewData(employee)) {
  const allocationColumns = summary.allocationColumns || getResourceSummaryAllocationColumns();
  const allocationCells = allocationColumns.map((column, index) => {
    const description = getAllocationColumnDescription(column);
    const percentageTotal = Number(summary.allocationMeta.percentageTotals[column.key]) || 0;
    const allocationValue = Number(summary.allocation[column.key]) || 0;
    const title = `${description} ${percentageTotal.toFixed(1)} total weekly percentage points ÷ ${summary.allocationMeta.fiscalWeekCount} available FY weeks = ${allocationValue.toFixed(1)}%.`;

    return `
      <td
        class="matrix-fixed-cell sticky-allocation-cell col-allocation matrix-summary-cell matrix-allocation-cell ${column.isNotLocalProject ? 'matrix-not-local-cell' : ''}"
        style="${getMatrixAllocationStickyStyle(index)}"
        data-employee-id="${employee.id}"
        data-summary-group="allocation"
        data-summary-metric="${esc(column.key)}"
        data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
        title="${esc(title)}"
      >${formatMatrixAllocationCellValue(allocationValue)}</td>
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
        class="matrix-fixed-cell sticky-revenue-cell col-revenue matrix-summary-cell matrix-revenue-cell ${index === RESOURCE_SUMMARY_COLUMNS.revenue.length - 1 ? 'matrix-summary-end' : ''}"
        style="${getMatrixRevenueStickyStyle(index, allocationColumns.length)}"
        data-action="open-revenue-breakdown"
        data-employee-id="${employee.id}"
        data-revenue-key="${column.key}"
        data-summary-group="revenue"
        data-summary-metric="${column.key}"
        role="button"
        tabindex="0"
        aria-label="Open ${esc(employee.name)} ${esc(column.label)} revenue breakdown"
        title="${esc(title)}"
      >${formatMatrixRevenueValue(revenue)}</td>
    `;
  }).join('');

  return allocationCells + revenueCells;
}

function renderAssignmentCells(employee, months, unavailableSlots) {
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
        const revenue = getMatrixAssignmentCardRevenue(employee, assignment, unavailableSlots);
        const usesPreSaleProductAmount = revenue.basis === 'preSaleProductAmount';
        const revenueText = revenue.hasRate
          ? formatRevenueViewValue(revenue.amount)
          : usesPreSaleProductAmount
            ? 'No amount'
            : 'Unpriced';
        const revenueDetail = revenue.eligible
          ? usesPreSaleProductAmount
            ? (revenue.hasRate
              ? `Saved Product Amount = ${formatExactRevenueValue(revenue.amount)}`
              : 'Selected product has no matching saved amount')
            : (revenue.hasRate
              ? `${revenue.hours.toFixed(2)}h × ${formatHourlyRateValue(revenue.rate)} = ${formatExactRevenueValue(revenue.amount)}`
              : `${revenue.hours.toFixed(2)}h · hourly rate not configured`)
          : 'Excluded from planned revenue';
        const revenueRule = usesPreSaleProductAmount
          ? 'Pre-Sale cards use the selected Product Amount from the Pre-Sale Product master.'
          : 'Only Intrasourcing and Local are counted in weekly planned-revenue totals.';
        const title = `${assignment.project_code || project.code || ''} — ${assignment.project_name || project.name || ''}\nCustomer Name: ${customer}\nProduct Name: ${product}\nRevenue: ${revenueDetail}\n${revenueRule}`;
        const displayName = shortCustomerName(customer) || assignment.project_code;
        const isSelected = S.matrixSelectedAssignmentIds instanceof Set &&
          S.matrixSelectedAssignmentIds.has(Number(assignment.id));

        cells += `
          <div
            class="chip${isSelected ? ' is-selected' : ''}"
            data-action="edit-assign"
            data-id="${assignment.id}"
            data-year="${month.y}"
            data-month="${month.m}"
            data-week="${week}"
            data-start="${slotRange.start}"
            data-end="${slotRange.end}"
            tabindex="0"
            role="button"
            aria-selected="${isSelected ? 'true' : 'false'}"
            style="background:${assignment.project_color}20;border-left:3px solid ${assignment.project_color};min-width:0;width:100%;box-sizing:border-box;"
            title="${esc(title)}"
          >
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:4px;min-width:0;">
              <span class="chip-code" style="color:${assignment.project_color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:11px;">${esc(displayName)}</span>
              <span class="chip-values">
                <span class="chip-pct">${assignment.percentage}%</span>
                <span class="chip-revenue ${revenue.eligible ? '' : 'is-excluded'}">${esc(revenueText)}</span>
              </span>
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
  const months = fiscalMonths(S.matrixFiscalYear);
  const employees = getFilteredMatrixEmployees();
  const unavailableSlots = getUnavailableAssignmentSlotSet(S.matrixAssignments);

  table.querySelector('thead').innerHTML = renderMatrixHeader(months, employees, unavailableSlots);

  const rows = employees.map((employee, index) => {
    const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';
    const summary = getResourceSummaryViewData(employee);
    const allocationColumns = summary.allocationColumns || getResourceSummaryAllocationColumns();
    const totalAllocationTitle = [
      `${employee.name} total allocation is the sum of the ${allocationColumns.length} visible allocation categories.`,
      `${allocationColumns.map(column => (
        `${column.label} ${(Number(summary.allocation[column.key]) || 0).toFixed(1)}%`
      )).join(' + ')} = ${summary.allocationMeta.total.toFixed(1)}%.`,
    ].join(' ');
    const notLocalProjects = summary.allocationMeta.notLocalProjects || [];
    const notLocalProjectTitle = notLocalProjects
      .map(project => `${project.code ? `${project.code} — ` : ''}${project.name}: ${project.allocation.toFixed(1)}%`)
      .join(' | ');
    const notLocalProjectPreview = notLocalProjects.length
      ? `<span class="matrix-resource-not-local" title="${esc(notLocalProjectTitle)}"><strong>Not Local:</strong> ${notLocalProjects.map(project => esc(project.name)).join(', ')}</span>`
      : '';

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
            <span
              class="matrix-allocation-avatar ${getMatrixAllocationToneClass(summary.allocationMeta.total)}"
              title="${esc(totalAllocationTitle)}"
              aria-label="${esc(employee.name)} total allocation ${formatAllocationViewValue(summary.allocationMeta.total)}"
            >${formatMatrixAllocationValue(summary.allocationMeta.total)}</span>
            <span class="matrix-resource-copy">
              <span class="matrix-resource-name">${esc(employee.name)}</span>
              <span class="matrix-resource-designation">${esc(employee.designation || 'No designation')}</span>
              ${notLocalProjectPreview}
            </span>
          </button>
        </td>
        ${renderResourceSummaryCells(employee, summary)}
        ${renderAssignmentCells(employee, months, unavailableSlots)}
      </tr>
    `;
  });

  const columnCount = 2 +
    getResourceSummaryAllocationColumns().length +
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
