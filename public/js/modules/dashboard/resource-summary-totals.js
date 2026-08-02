/* Workforce Allocation Dashboard — dashboard/resource-summary-totals.js */

/* Fixed matrix summary row: allocation averages, revenue totals and weekly averages. */

function averageMatrixValues(values) {
  const numericValues = (values || [])
    .filter(value => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);

  if (!numericValues.length) return 0;

  return numericValues.reduce((total, value) => total + value, 0) /
    numericValues.length;
}

function getEmployeeWeekAllocationBreakdown(employeeId, month, week, unavailableSlots) {
  if (isEmployeeUnavailableForSlot(employeeId, month.y, month.m, week, unavailableSlots)) {
    return null;
  }

  const key = `${month.y}-${month.m}-${week}`;
  const assignments = S.matrix[employeeId]?.[key] || [];
  const allocation = {
    total: 0,
    intrasourcing: 0,
    local: 0,
  };

  assignments
    .filter(assignment => !isUnavailableAssignment(assignment))
    .forEach(assignment => {
      const percentage = Number(assignment.percentage) || 0;
      const categoryKey = classifyResourceSummaryAssignment(assignment);

      allocation.total += percentage;
      if (categoryKey === 'intrasourcing' || categoryKey === 'local') {
        allocation[categoryKey] += percentage;
      }
    });

  return allocation;
}

function getEmployeeWeekAllocation(employeeId, month, week, unavailableSlots) {
  return getEmployeeWeekAllocationBreakdown(
    employeeId,
    month,
    week,
    unavailableSlots,
  )?.total ?? null;
}

function getMatrixMonthAllocationMetrics(employeeRows, month, unavailableSlots = null) {
  const slots = unavailableSlots || getUnavailableAssignmentSlotSet(S.matrixAssignments);
  const visibleResourceCount = (employeeRows || []).length;
  const totalResourceWeeks = visibleResourceCount * RESOURCE_SUMMARY_WEEKS_PER_MONTH;
  let allocationPercentageTotal = 0;
  let availableResourceWeeks = 0;
  let allocatedResourceWeeks = 0;
  let unassignedResourceWeeks = 0;
  let overallocatedResourceWeeks = 0;
  let overallocatedPercentageTotal = 0;
  let availableMandays = 0;
  let allocatedMandays = 0;
  let unallocatedMandays = 0;
  const categoryAllocationPercentageTotals = {
    intrasourcing: 0,
    local: 0,
  };

  for (let week = 1; week <= RESOURCE_SUMMARY_WEEKS_PER_MONTH; week += 1) {
    for (const employee of employeeRows || []) {
      if (isEmployeeUnavailableForSlot(
        employee.id,
        month.y,
        month.m,
        week,
        slots,
      )) {
        continue;
      }

      const allocationBreakdown = getEmployeeWeekAllocationBreakdown(
        employee.id,
        month,
        week,
        slots,
      ) || { total: 0, intrasourcing: 0, local: 0 };
      const allocation = Number(allocationBreakdown.total);
      const normalizedAllocation = Number.isFinite(allocation)
        ? Math.max(0, allocation)
        : 0;
      categoryAllocationPercentageTotals.intrasourcing += Math.max(
        0,
        Number(allocationBreakdown.intrasourcing) || 0,
      );
      categoryAllocationPercentageTotals.local += Math.max(
        0,
        Number(allocationBreakdown.local) || 0,
      );
      const capacityUsed = Math.min(100, normalizedAllocation);
      const configuredAnnualWorkdays = Number(employee?.workdays);
      const annualWorkdays = Number.isFinite(configuredAnnualWorkdays) &&
        configuredAnnualWorkdays >= 0
        ? configuredAnnualWorkdays
        : 220;
      const workdaysPerWeek = annualWorkdays / 12 /
        RESOURCE_SUMMARY_WEEKS_PER_MONTH;

      allocationPercentageTotal += normalizedAllocation;
      availableResourceWeeks += 1;
      if (normalizedAllocation > 0) allocatedResourceWeeks += 1;
      else unassignedResourceWeeks += 1;
      if (normalizedAllocation > 100) {
        overallocatedResourceWeeks += 1;
        overallocatedPercentageTotal += normalizedAllocation - 100;
      }
      availableMandays += workdaysPerWeek;
      allocatedMandays += workdaysPerWeek * (capacityUsed / 100);
      unallocatedMandays += workdaysPerWeek * ((100 - capacityUsed) / 100);
    }
  }

  return {
    averageAllocation: availableResourceWeeks
      ? allocationPercentageTotal / availableResourceWeeks
      : 0,
    allocationPercentageTotal: +allocationPercentageTotal.toFixed(2),
    visibleResourceCount,
    weeksPerMonth: RESOURCE_SUMMARY_WEEKS_PER_MONTH,
    totalResourceWeeks,
    unavailableResourceWeeks: Math.max(0, totalResourceWeeks - availableResourceWeeks),
    availableResourceWeeks,
    allocatedResourceWeeks,
    unassignedResourceWeeks,
    overallocatedResourceWeeks,
    overallocatedPercentageTotal: +overallocatedPercentageTotal.toFixed(2),
    availableMandays: +availableMandays.toFixed(2),
    allocatedMandays: +allocatedMandays.toFixed(2),
    unallocatedMandays: +unallocatedMandays.toFixed(2),
    categoryAllocation: {
      intrasourcing: {
        percentageTotal: +categoryAllocationPercentageTotals.intrasourcing.toFixed(2),
        averageAllocation: availableResourceWeeks
          ? categoryAllocationPercentageTotals.intrasourcing / availableResourceWeeks
          : 0,
      },
      local: {
        percentageTotal: +categoryAllocationPercentageTotals.local.toFixed(2),
        averageAllocation: availableResourceWeeks
          ? categoryAllocationPercentageTotals.local / availableResourceWeeks
          : 0,
      },
    },
  };
}

function sumCalculatedRevenue(summaries, revenueKey) {
  const calculatedValues = summaries
    .filter(summary => summary.allocationMeta.fiscalWeekCount > 0)
    .map(summary => summary.revenue[revenueKey])
    .filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);

  return {
    value: calculatedValues.length
      ? calculatedValues.reduce((total, value) => total + value, 0)
      : null,
    calculatedResourceCount: calculatedValues.length,
  };
}

function getMatrixTotalsViewData(employees, months) {
  const allocationColumns = getResourceSummaryAllocationColumns();
  const unavailableSlots = getUnavailableAssignmentSlotSet(S.matrixAssignments);
  const summaries = employees.map(employee => getResourceSummaryViewData(employee));
  const availableSummaries = summaries.filter(
    summary => summary.allocationMeta.fiscalWeekCount > 0,
  );

  const allocation = Object.fromEntries(
    allocationColumns.map(column => [
      column.key,
      averageMatrixValues(
        availableSummaries.map(summary => summary.allocation[column.key]),
      ),
    ]),
  );
  const totalAllocation = averageMatrixValues(
    availableSummaries.map(summary => summary.allocationMeta.total),
  );

  const revenue = Object.fromEntries(
    RESOURCE_SUMMARY_COLUMNS.revenue.map(column => [
      column.key,
      sumCalculatedRevenue(availableSummaries, column.key),
    ]),
  );

  const weeklyAllocation = months.flatMap(month =>
    Array.from({ length: RESOURCE_SUMMARY_WEEKS_PER_MONTH }, (_, index) => {
      const week = index + 1;
      const availableEmployees = getAvailableEmployeesForSlot(
        employees,
        month.y,
        month.m,
        week,
        S.matrixAssignments,
      );
      const employeeAllocations = availableEmployees.map(employee =>
        getEmployeeWeekAllocation(employee.id, month, week, unavailableSlots),
      );

      const plannedRevenue = getMatrixWeekPlannedRevenue(
        employees,
        month,
        week,
        unavailableSlots,
      );

      return {
        month,
        week,
        value: averageMatrixValues(employeeAllocations),
        availableResourceCount: availableEmployees.length,
        plannedRevenue,
      };
    }),
  );

  return {
    allocationColumns,
    employeeCount: employees.length,
    availableFiscalResourceCount: availableSummaries.length,
    allocation,
    totalAllocation,
    revenue,
    weeklyAllocation,
  };
}

function renderMatrixTotalsRow(employees, months) {
  if (!employees.length) return '';

  const totals = getMatrixTotalsViewData(employees, months);
  const resourceLabel = `${totals.employeeCount} visible resource${totals.employeeCount === 1 ? '' : 's'}`;
  const fiscalResourceLabel = `${totals.availableFiscalResourceCount} available resource${totals.availableFiscalResourceCount === 1 ? '' : 's'}`;

  const allocationColumns = totals.allocationColumns || getResourceSummaryAllocationColumns();
  const allocationCells = allocationColumns
    .map((column, index) => {
      const value = totals.allocation[column.key];
      const title = `Average ${column.label} allocation across ${fiscalResourceLabel}. N/A availability weeks are removed from each employee’s fiscal-year denominator: ${value.toFixed(1)}%.`;

      return `
        <td
          class="matrix-fixed-cell sticky-allocation-cell col-allocation matrix-total-cell matrix-total-allocation-cell ${column.isNotLocalProject ? 'matrix-not-local-total-cell' : ''}"
          style="${getMatrixAllocationStickyStyle(index)}"
          data-total-group="allocation"
          data-total-metric="${esc(column.key)}"
          data-not-local-project-id="${column.isNotLocalProject ? column.projectId : ''}"
          title="${esc(title)}"
        >${formatMatrixAllocationCellValue(value)}</td>
      `;
    })
    .join('');

  const revenueCells = RESOURCE_SUMMARY_COLUMNS.revenue
    .map((column, index) => {
      const total = totals.revenue[column.key];
      const title = total.value === null
        ? `No ${column.label} revenue can be calculated for the available visible resources until supported designations and hourly rates are assigned.`
        : `Total ${column.label} revenue for ${total.calculatedResourceCount} available resource${total.calculatedResourceCount === 1 ? '' : 's'}: ${formatExactRevenueValue(total.value)}. N/A weeks are excluded.`;

      return `
        <td
          class="matrix-fixed-cell sticky-revenue-cell col-revenue matrix-total-cell matrix-total-revenue-cell ${index === RESOURCE_SUMMARY_COLUMNS.revenue.length - 1 ? 'matrix-summary-end' : ''}"
          style="${getMatrixRevenueStickyStyle(index, allocationColumns.length)}"
          data-action="open-revenue-breakdown"
          data-total-group="revenue"
          data-total-metric="${column.key}"
          data-revenue-key="${column.key}"
          role="button"
          tabindex="0"
          aria-label="Open ${esc(column.label)} revenue breakdown"
          title="${esc(title)} Click to view the detailed breakdown."
        >${formatMatrixRevenueValue(total.value)}</td>
      `;
    })
    .join('');

  const weeklyCells = totals.weeklyAllocation
    .map(item => {
      const availableLabel = `${item.availableResourceCount} available resource${item.availableResourceCount === 1 ? '' : 's'}`;
      const unpricedNote = item.plannedRevenue.unpricedHours > 0
        ? ` ${item.plannedRevenue.unpricedHours.toFixed(1)} eligible hours are unpriced because an hourly rate is not configured.`
        : '';
      const title = `Average total allocation for ${item.month.label} W${item.week} across ${availableLabel}: ${item.value.toFixed(1)}%. Planned revenue: ${formatExactRevenueValue(item.plannedRevenue.amount)}. Includes Intrasourcing and Local only.${unpricedNote} Resources assigned to N/A in this week are excluded from both the numerator and denominator.`;

      return `
        <td
          class="col-week matrix-total-cell matrix-total-week-cell ${item.week === RESOURCE_SUMMARY_WEEKS_PER_MONTH ? 'month-end' : ''}"
          data-total-year="${item.month.y}"
          data-total-month="${item.month.m}"
          data-total-week="${item.week}"
          title="${esc(title)}"
        >
          <span class="matrix-total-week-allocation">${formatAllocationViewValue(item.value)}</span>
          <span class="matrix-total-week-revenue">${formatRevenueViewValue(item.plannedRevenue.amount)}</span>
        </td>
      `;
    })
    .join('');

  return `
    <tr class="matrix-total-row" aria-label="Visible-resource totals and averages">
      <td
        class="matrix-fixed-cell sticky-sn col-sn matrix-total-cell matrix-total-symbol-cell"
        title="Totals and averages for ${esc(resourceLabel)}"
      >Σ</td>
      <td
        class="matrix-fixed-cell sticky-name col-name matrix-total-cell matrix-total-label-cell"
        title="Average total allocation across ${esc(fiscalResourceLabel)}: ${totals.totalAllocation.toFixed(1)}%."
      >
        <span class="matrix-total-label">Total / Average</span>
        <span class="matrix-total-note">${esc(resourceLabel)} · Avg total ${formatMatrixAllocationValue(totals.totalAllocation)}</span>
      </td>
      ${allocationCells}
      ${revenueCells}
      ${weeklyCells}
    </tr>
  `;
}
