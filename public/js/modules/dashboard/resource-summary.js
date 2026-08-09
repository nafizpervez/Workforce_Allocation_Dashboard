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

function getMatrixPeriodBreakdownData(trigger) {
  const encodedPayload = String(trigger?.dataset?.periodBreakdown || '');
  if (!encodedPayload) return { periodLabel: '', columns: [] };

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedPayload));
    return {
      periodLabel: String(parsed?.periodLabel || ''),
      columns: Array.isArray(parsed?.columns) ? parsed.columns : [],
    };
  } catch (error) {
    console.warn('Unable to read matrix allocation/revenue breakdown.', error);
    return { periodLabel: '', columns: [] };
  }
}

function renderMatrixMonthBreakdownTooltip(data) {
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  const rows = columns.map(column => `
    <tr>
      <th scope="row" title="${esc(column.label)}">${esc(column.label)}</th>
      <td>${esc(`${formatMatrixBreakdownNumber(column.allocation, 1)}%`)}</td>
      <td>${column.hasRevenueColumn ? esc(formatRevenueViewValue(column.revenue)) : '—'}</td>
    </tr>
  `).join('');

  return `
    <div class="matrix-month-breakdown-tooltip__title">${esc(data.periodLabel)}</div>
    <table class="matrix-month-breakdown-tooltip__table">
      <thead>
        <tr>
          <th scope="col">Classification</th>
          <th scope="col">Allocation</th>
          <th scope="col">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `
          <tr>
            <th scope="row">No classifications</th>
            <td>0%</td>
            <td>$0</td>
          </tr>
        `}
      </tbody>
    </table>
  `;
}

function positionMatrixMonthBreakdownTooltip(tooltip, trigger) {
  const margin = 12;
  const gap = 8;
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
  let top = triggerRect.bottom + gap;

  left = Math.max(margin, Math.min(left, viewportWidth - tooltipRect.width - margin));
  if (top + tooltipRect.height > viewportHeight - margin) {
    top = Math.max(margin, triggerRect.top - tooltipRect.height - gap);
  }

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showMatrixMonthBreakdownTooltip(trigger) {
  const tooltip = getMatrixMonthBreakdownTooltip();
  const data = getMatrixPeriodBreakdownData(trigger);
  tooltip.innerHTML = renderMatrixMonthBreakdownTooltip(data);
  tooltip.style.width = 'min(430px, calc(100vw - 20px))';
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');
  trigger.setAttribute('aria-describedby', MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID);
  positionMatrixMonthBreakdownTooltip(tooltip, trigger);
}

function hideMatrixMonthBreakdownTooltip() {
  const tooltip = document.getElementById(MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID);
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
  document.querySelectorAll(`.matrix-period-breakdown-trigger[aria-describedby="${MATRIX_MONTH_BREAKDOWN_TOOLTIP_ID}"]`)
    .forEach(trigger => trigger.removeAttribute('aria-describedby'));
}

function installMatrixMonthBreakdownTooltip() {
  if (window.__matrixMonthBreakdownTooltipInstalled) return;
  window.__matrixMonthBreakdownTooltipInstalled = true;

  const selector = '.matrix-period-breakdown-trigger[data-period-breakdown]';

  document.addEventListener('pointerover', event => {
    const trigger = event.target.closest?.(selector);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    showMatrixMonthBreakdownTooltip(trigger);
  });

  document.addEventListener('pointerout', event => {
    const trigger = event.target.closest?.(selector);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    hideMatrixMonthBreakdownTooltip();
  });

  document.addEventListener('focusin', event => {
    const trigger = event.target.closest?.(selector);
    if (trigger) showMatrixMonthBreakdownTooltip(trigger);
  });

  document.addEventListener('focusout', event => {
    const trigger = event.target.closest?.(selector);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    hideMatrixMonthBreakdownTooltip();
  });

  window.addEventListener('resize', hideMatrixMonthBreakdownTooltip);
  window.addEventListener('scroll', hideMatrixMonthBreakdownTooltip, true);
}

installMatrixMonthBreakdownTooltip();

const MATRIX_ASSIGNMENT_DETAIL_TOOLTIP_ID = 'matrixAssignmentDetailTooltip';

function getMatrixAssignmentDetailTooltip() {
  let tooltip = document.getElementById(MATRIX_ASSIGNMENT_DETAIL_TOOLTIP_ID);
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.id = MATRIX_ASSIGNMENT_DETAIL_TOOLTIP_ID;
  tooltip.className = 'matrix-assignment-detail-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);
  return tooltip;
}

function getMatrixAssignmentDetailData(trigger) {
  const encodedPayload = String(trigger?.dataset?.assignmentDetail || '');
  if (!encodedPayload) return { title: '', rows: [] };

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedPayload));
    return {
      title: String(parsed?.title || ''),
      rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
    };
  } catch (error) {
    console.warn('Unable to read matrix assignment detail.', error);
    return { title: '', rows: [] };
  }
}

function renderMatrixAssignmentDetailTooltip(data) {
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map(row => `
    <tr>
      <th scope="row">${esc(row?.label || '')}</th>
      <td>${esc(row?.value || '—')}</td>
    </tr>
  `).join('');

  return `
    <div class="matrix-assignment-detail-tooltip__title">${esc(data?.title || 'Assignment')}</div>
    <table class="matrix-assignment-detail-tooltip__table">
      <tbody>${rows}</tbody>
    </table>
  `;
}

function positionMatrixAssignmentDetailTooltip(tooltip, trigger) {
  const margin = 12;
  const gap = 8;
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
  let top = triggerRect.bottom + gap;

  left = Math.max(margin, Math.min(left, viewportWidth - tooltipRect.width - margin));
  if (top + tooltipRect.height > viewportHeight - margin) {
    top = Math.max(margin, triggerRect.top - tooltipRect.height - gap);
  }

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showMatrixAssignmentDetailTooltip(trigger) {
  const tooltip = getMatrixAssignmentDetailTooltip();
  const data = getMatrixAssignmentDetailData(trigger);
  tooltip.innerHTML = renderMatrixAssignmentDetailTooltip(data);
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');
  trigger.setAttribute('aria-describedby', MATRIX_ASSIGNMENT_DETAIL_TOOLTIP_ID);
  positionMatrixAssignmentDetailTooltip(tooltip, trigger);
}

function hideMatrixAssignmentDetailTooltip() {
  const tooltip = document.getElementById(MATRIX_ASSIGNMENT_DETAIL_TOOLTIP_ID);
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
  document.querySelectorAll(`.matrix-assignment-detail-trigger[aria-describedby="${MATRIX_ASSIGNMENT_DETAIL_TOOLTIP_ID}"]`)
    .forEach(trigger => trigger.removeAttribute('aria-describedby'));
}

function installMatrixAssignmentDetailTooltip() {
  if (window.__matrixAssignmentDetailTooltipInstalled) return;
  window.__matrixAssignmentDetailTooltipInstalled = true;
  const selector = '.matrix-assignment-detail-trigger[data-assignment-detail]';

  document.addEventListener('pointerover', event => {
    const trigger = event.target.closest?.(selector);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    showMatrixAssignmentDetailTooltip(trigger);
  });

  document.addEventListener('pointerout', event => {
    const trigger = event.target.closest?.(selector);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    hideMatrixAssignmentDetailTooltip();
  });

  document.addEventListener('focusin', event => {
    const trigger = event.target.closest?.(selector);
    if (trigger) showMatrixAssignmentDetailTooltip(trigger);
  });

  document.addEventListener('focusout', event => {
    const trigger = event.target.closest?.(selector);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    hideMatrixAssignmentDetailTooltip();
  });

  window.addEventListener('resize', hideMatrixAssignmentDetailTooltip);
  window.addEventListener('scroll', hideMatrixAssignmentDetailTooltip, true);
}

installMatrixAssignmentDetailTooltip();

function renderMatrixHeader(months, employees, unavailableSlots) {
  const allocationColumns = getResourceSummaryAllocationColumns();
  const revenueColumns = getResourceSummaryRevenueColumns();
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
      colspan="${revenueColumns.length}"
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
    const breakdown = buildMatrixPeriodBreakdownData(month.label, allocation, revenue);
    header += `
      <th
        colspan="4"
        class="matrix-month-heading matrix-period-breakdown-trigger border-b border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700 bg-gray-50 ${index < months.length - 1 ? 'border-r border-gray-200' : ''}"
        data-period-breakdown="${esc(encodeMatrixPeriodBreakdownData(breakdown))}"
        tabindex="0"
        aria-label="${esc(`${month.label} allocation and revenue breakdown. Hover or focus to view the table.`)}"
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
        class="sticky-allocation-cell col-allocation matrix-summary-subheading matrix-allocation-subheading"
        style="${getMatrixAllocationStickyStyle(index)}"
        title="${esc(projectReference)}"
        data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
      ><span>${esc(column.label)}</span></th>
    `;
  });

  revenueColumns.forEach((column, index) => {
    const projectReference = column.isNotLocalProject && column.projectCode
      ? `${column.projectCode} — ${column.label}`
      : column.label;
    header += `
      <th
        class="sticky-revenue-cell col-revenue matrix-summary-subheading matrix-revenue-subheading ${index === revenueColumns.length - 1 ? 'matrix-summary-end' : ''}"
        style="${getMatrixRevenueStickyStyle(index, allocationColumns.length)}"
        title="${esc(projectReference)}"
        data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
      ><span>${esc(column.label)}</span></th>
    `;
  });

  months.forEach(month => {
    for (let week = 1; week <= RESOURCE_SUMMARY_WEEKS_PER_MONTH; week += 1) {
      const allocation = getMatrixWeekAllocationMetrics(
        employees,
        month,
        week,
        unavailableSlots,
      );
      const revenue = getMatrixWeekPlannedRevenue(
        employees,
        month,
        week,
        unavailableSlots,
      );
      const breakdown = buildMatrixPeriodBreakdownData(
        `${month.label} · W${week}`,
        allocation,
        revenue,
      );

      header += `
        <th
          class="matrix-period-breakdown-trigger border-b border-gray-200 px-2 py-2 text-center text-xs text-gray-500 font-medium bg-gray-50 col-week ${week === RESOURCE_SUMMARY_WEEKS_PER_MONTH ? 'border-r border-gray-200' : 'border-r border-dotted border-gray-200'}"
          data-period-breakdown="${esc(encodeMatrixPeriodBreakdownData(breakdown))}"
          tabindex="0"
          aria-label="${esc(`${month.label} week ${week} allocation and revenue breakdown. Hover or focus to view the table.`)}"
        >W${week}</th>
      `;
    }
  });

  header += '</tr>';
  return header;
}

function renderResourceSummaryCells(employee, summary = getResourceSummaryViewData(employee)) {
  const allocationColumns = summary.allocationColumns || getResourceSummaryAllocationColumns();
  const revenueColumns = summary.revenueColumns || getResourceSummaryRevenueColumns();
  const allocationCells = allocationColumns.map((column, index) => {
    const description = getAllocationColumnDescription(column);
    const percentageTotal = Number(summary.allocationMeta.percentageTotals[column.key]) || 0;
    const allocationValue = Number(summary.allocation[column.key]) || 0;
    const title = `${description} ${percentageTotal.toFixed(1)} total weekly percentage points ÷ ${summary.allocationMeta.fiscalWeekCount} available FY weeks = ${allocationValue.toFixed(1)}%.`;

    return `
      <td
        class="matrix-fixed-cell sticky-allocation-cell col-allocation matrix-summary-cell matrix-allocation-cell"
        style="${getMatrixAllocationStickyStyle(index)}"
        data-employee-id="${employee.id}"
        data-summary-group="allocation"
        data-summary-metric="${esc(column.key)}"
        data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
        title="${esc(title)}"
      >${formatMatrixAllocationCellValue(allocationValue)}</td>
    `;
  }).join('');

  const revenueCells = revenueColumns.map((column, index) => {
    const meta = summary.revenueMeta[column.key];
    const revenue = summary.revenue[column.key];
    const title = meta.hasRevenueRate
      ? `${employee.name} · ${column.label}: ${meta.hours.toFixed(1)}h × ${formatHourlyRateValue(meta.rate)} = ${formatExactRevenueValue(revenue)}. Click for the project-level breakdown.`
      : `${employee.name} · ${column.label}: assign a supported designation and save the required hourly rate in Resource Revenue. Click for the assignment breakdown.`;

    return `
      <td
        class="matrix-fixed-cell sticky-revenue-cell col-revenue matrix-summary-cell matrix-revenue-cell ${index === revenueColumns.length - 1 ? 'matrix-summary-end' : ''}"
        style="${getMatrixRevenueStickyStyle(index, allocationColumns.length)}"
        data-action="open-revenue-breakdown"
        data-employee-id="${employee.id}"
        data-revenue-key="${esc(column.key)}"
        data-summary-group="revenue"
        data-summary-metric="${esc(column.key)}"
        data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
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
        const assignmentTitle = `${assignment.project_code || project.code || ''} — ${assignment.project_name || project.name || ''}`.trim();
        const assignmentDetail = {
          title: assignmentTitle || 'Assignment',
          rows: [
            { label: 'Customer Name', value: customer },
            { label: 'Product Name', value: product },
            { label: 'Allocation', value: `${Number(assignment.percentage) || 0}%` },
            { label: 'Revenue', value: revenueDetail },
            { label: 'Counting Rule', value: revenueRule },
          ],
        };
        const displayName = shortCustomerName(customer) || assignment.project_code;
        const isSelected = S.matrixSelectedAssignmentIds instanceof Set &&
          S.matrixSelectedAssignmentIds.has(Number(assignment.id));

        cells += `
          <div
            class="chip matrix-assignment-detail-trigger${isSelected ? ' is-selected' : ''}"
            data-action="edit-assign"
            data-assignment-detail="${esc(encodeURIComponent(JSON.stringify(assignmentDetail)))}"
            data-id="${assignment.id}"
            data-year="${month.y}"
            data-month="${month.m}"
            data-week="${week}"
            data-start="${slotRange.start}"
            data-end="${slotRange.end}"
            tabindex="0"
            role="button"
            aria-selected="${isSelected ? 'true' : 'false'}"
            aria-label="${esc(`${assignmentTitle || 'Assignment'}. Hover or focus to view assignment details.`)}"
            style="background:${assignment.project_color}20;border-left:3px solid ${assignment.project_color};min-width:0;width:100%;box-sizing:border-box;"
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
    getResourceSummaryRevenueColumns().length +
    (months.length * 4);

  const totalsRow = renderMatrixTotalsRow(employees, months);

  table.querySelector('tbody').innerHTML = employees.length
    ? totalsRow + rows.join('')
    : `
      <tr>
        <td colspan="${columnCount}" class="matrix-empty-state">No resources found.</td>
      </tr>
    `;

  if (typeof renderCapacityExecutiveCards === 'function') {
    renderCapacityExecutiveCards();
  }
}
