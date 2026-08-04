/* Workforce Allocation Dashboard — dashboard/capacity-executive.js */

const CAPACITY_EXECUTIVE_HOURS_PER_DAY = 8;
const CAPACITY_EXECUTIVE_STANDARD_ORDER = Object.freeze([
  'intrasourcing',
  'local',
  'training',
  'preSale',
  'skillDevelopment',
  'generalAdmin',
]);
const CAPACITY_EXECUTIVE_LABELS = Object.freeze({
  intrasourcing: 'Intra-Sourcing',
  local: 'Local PS',
  training: 'Training Delivery',
  preSale: 'Presales',
  skillDevelopment: 'Skill Development',
  generalAdmin: 'General Admin',
});
const CAPACITY_EXECUTIVE_COLORS = Object.freeze([
  '#377CB7',
  '#2A9D8F',
  '#F2B51D',
  '#8061A6',
  '#6EAF45',
  '#5A9BD5',
  '#EF8354',
  '#8B5CF6',
  '#0EA5E9',
  '#14B8A6',
  '#EC4899',
  '#F97316',
]);

function formatExecutiveCurrency(value) {
  const amount = Number(value) || 0;
  return `USD ${Math.round(amount).toLocaleString('en-US')}`;
}

function formatExecutiveDays(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} days`;
}

function formatExecutivePercentage(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatExecutiveFte(value) {
  return `${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} FTE`;
}

function getCapacityExecutiveActiveTeam() {
  const allActive = (S.employees || []).filter(employee => Number(employee?.active ?? 1) !== 0);
  const assignable = typeof getActiveEmployees === 'function'
    ? getActiveEmployees()
    : allActive;

  return { allActive, assignable };
}

function getCapacityExecutiveWorkdaySummary(fiscalYear, assignments, employees) {
  const rows = (employees || []).map(employee => {
    const adjustment = getAdjustedEmployeeWorkdays(
      employee.id,
      employee.workdays,
      fiscalYear,
      assignments,
    );
    const rateRecord = getRevenueRateForDesignation(employee.designation);
    const localRate = getRevenueRateValue(rateRecord, 'local');
    const intrasourcingRate = getRevenueRateValue(rateRecord, 'intrasourcing');
    const hours = adjustment.adjustedWorkdays * CAPACITY_EXECUTIVE_HOURS_PER_DAY;

    return {
      employee,
      adjustedWorkdays: adjustment.adjustedWorkdays,
      hours,
      localCapacity: localRate === null ? 0 : hours * localRate,
      intrasourcingCapacity: intrasourcingRate === null ? 0 : hours * intrasourcingRate,
    };
  });

  return {
    rows,
    availableCapacityDays: rows.reduce((total, row) => total + row.adjustedWorkdays, 0),
    localRevenueCapacity: rows.reduce((total, row) => total + row.localCapacity, 0),
    intrasourcingRevenueCapacity: rows.reduce((total, row) => total + row.intrasourcingCapacity, 0),
  };
}

function getCapacityExecutiveAllocationMix(fiscalYear, assignments, employees) {
  const activeEmployeeIds = new Set((employees || []).map(employee => Number(employee.id)));
  const allocationColumns = getResourceSummaryAllocationColumns();
  const totalsByKey = Object.fromEntries(allocationColumns.map(column => [column.key, 0]));

  for (const assignment of getEffectiveFiscalAssignments(fiscalYear, assignments)) {
    if (!activeEmployeeIds.has(Number(assignment.employee_id))) continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    const categoryKey = classifyResourceSummaryAssignment(assignment);
    if (!Object.prototype.hasOwnProperty.call(totalsByKey, categoryKey)) continue;
    totalsByKey[categoryKey] += percentage;
  }

  const totalAllocationPoints = Object.values(totalsByKey).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  );
  const columnByKey = new Map(allocationColumns.map(column => [column.key, column]));
  const orderedKeys = [
    ...CAPACITY_EXECUTIVE_STANDARD_ORDER.filter(key => columnByKey.has(key)),
    ...allocationColumns
      .filter(column => !CAPACITY_EXECUTIVE_STANDARD_ORDER.includes(column.key))
      .map(column => column.key),
  ];

  const rows = orderedKeys.map((key, index) => {
    const column = columnByKey.get(key);
    const points = Number(totalsByKey[key]) || 0;
    const share = totalAllocationPoints > 0
      ? (points / totalAllocationPoints) * 100
      : 0;

    return {
      key,
      label: CAPACITY_EXECUTIVE_LABELS[key] || column?.label || key,
      points,
      share,
      isNotLocalProject: Boolean(column?.isNotLocalProject),
      color: CAPACITY_EXECUTIVE_COLORS[index % CAPACITY_EXECUTIVE_COLORS.length],
    };
  });

  return {
    rows,
    totalAllocationPoints,
  };
}

function sumCapacityExecutiveShare(rows, predicate) {
  return (rows || []).reduce(
    (total, row) => predicate(row) ? total + (Number(row.share) || 0) : total,
    0,
  );
}

function getCapacityExecutiveSummary() {
  const fiscalYear = Number(S.matrixFiscalYear);
  const assignments = Array.isArray(S.matrixAssignments) ? S.matrixAssignments : [];
  const { allActive, assignable } = getCapacityExecutiveActiveTeam();
  const workdays = getCapacityExecutiveWorkdaySummary(
    fiscalYear,
    assignments,
    assignable,
  );
  const allocationMix = getCapacityExecutiveAllocationMix(
    fiscalYear,
    assignments,
    assignable,
  );
  const committedTargets = typeof getCommittedTargetSummary === 'function'
    ? getCommittedTargetSummary()
    : { total: 0 };
  const defaultAnnualWorkdays = Number(getDefaultAnnualWorkdays()) || 0;
  const equivalentCapacity = defaultAnnualWorkdays > 0
    ? workdays.availableCapacityDays / defaultAnnualWorkdays
    : 0;

  const revenueGeneratingShare = sumCapacityExecutiveShare(
    allocationMix.rows,
    row => ['intrasourcing', 'local', 'training'].includes(row.key),
  );
  const revenueEnablingShare = sumCapacityExecutiveShare(
    allocationMix.rows,
    row => row.key === 'preSale',
  );
  const investmentOverheadShare = sumCapacityExecutiveShare(
    allocationMix.rows,
    row => ['skillDevelopment', 'generalAdmin'].includes(row.key),
  );

  return {
    fiscalYear,
    fiscalYearLabel: fiscalYearDisplayLabel(fiscalYear),
    fiscalYearRange: fiscalYearRangeLabel(fiscalYear),
    allActiveCount: allActive.length,
    assignableCount: assignable.length,
    excludedActiveCount: Math.max(0, allActive.length - assignable.length),
    defaultAnnualWorkdays,
    equivalentCapacity,
    committedTarget: Number(committedTargets.total) || 0,
    ...workdays,
    allocationMix,
    executiveMetrics: {
      revenueGeneratingShare,
      revenueEnablingShare,
      investmentOverheadShare,
      revenueGeneratingFte: equivalentCapacity * (revenueGeneratingShare / 100),
      revenueEnablingFte: equivalentCapacity * (revenueEnablingShare / 100),
      investmentOverheadFte: equivalentCapacity * (investmentOverheadShare / 100),
    },
  };
}

function renderCapacityExecutiveFinancialStrip(summary) {
  const items = [
    {
      value: formatExecutiveCurrency(summary.localRevenueCapacity),
      label: 'Maximum Revenue Capacity (Based on Local rates)',
      title: `Exact Local-rate capacity: ${formatExactRevenueValue(summary.localRevenueCapacity)}`,
    },
    {
      value: formatExecutiveCurrency(summary.intrasourcingRevenueCapacity),
      label: 'Maximum Revenue Capacity (Based on Intra rates)',
      title: `Exact Intrasourcing-rate capacity: ${formatExactRevenueValue(summary.intrasourcingRevenueCapacity)}`,
    },
    {
      value: formatExecutiveDays(summary.availableCapacityDays),
      label: 'Available capacity',
      title: `Adjusted annual capacity for ${summary.assignableCount} assignable active resources`,
    },
    {
      value: formatExecutiveCurrency(summary.committedTarget),
      label: 'Committed target',
      title: 'Saved Intrasourcing and Local PS committed revenue targets',
    },
  ];

  return `
    <div class="capacity-financial-strip">
      ${items.map(item => `
        <div class="capacity-financial-metric" title="${esc(item.title)}">
          <div class="capacity-financial-metric__value">${esc(item.value)}</div>
          <div class="capacity-financial-metric__label">${esc(item.label)}</div>
        </div>
      `).join('')}
    </div>`;
}

function renderCapacityExecutiveLegend(summary) {
  return summary.allocationMix.rows.map(row => `
    <div class="capacity-allocation-legend__item" title="${esc(`${row.label}: ${row.points.toFixed(1)} allocation points`)}">
      <span class="capacity-allocation-legend__swatch" style="background:${esc(row.color)}"></span>
      <span class="capacity-allocation-legend__label">${esc(row.label)}</span>
      <span class="capacity-allocation-legend__value">${esc(formatExecutivePercentage(row.share))}</span>
    </div>
  `).join('');
}

function renderCapacityAllocationExecutiveCard(summary) {
  return `
    <section class="capacity-executive-card dc dc-capacity-executive" data-card-key="capacity-allocation" data-card-title="Capacity Allocation" aria-labelledby="capacityAllocationExecutiveTitle">
      <div class="dc-handle" title="Drag card left or right" aria-label="Drag Capacity Allocation card left or right">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/>
          <circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/>
          <circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/>
        </svg>
      </div>
      <button class="card-collapse-toggle" type="button" aria-expanded="true" title="Minimize Capacity Allocation" aria-label="Minimize Capacity Allocation">
        <span aria-hidden="true">⌃</span>
      </button>
      <div class="card-collapsed-shell" aria-hidden="true">
        <span class="card-collapsed-shell__title">Capacity Allocation</span>
        <span class="card-collapsed-shell__value">${esc(summary.fiscalYearLabel)}</span>
      </div>
      <div class="card-expandable-content">
        <header class="capacity-executive-card__header">
          <div>
            <p class="capacity-executive-card__eyebrow">Annual capacity</p>
            <h2 id="capacityAllocationExecutiveTitle" class="capacity-executive-card__title">Capacity Allocation</h2>
            <p class="capacity-executive-card__subtitle">Revenue capacity and normalized allocation mix from the Resource Assignment Matrix.</p>
          </div>
          <span class="capacity-executive-card__fy">${esc(summary.fiscalYearLabel)}</span>
        </header>
        ${renderCapacityExecutiveFinancialStrip(summary)}
        <div class="capacity-allocation-visual">
          <div class="capacity-allocation-chart-column">
            <div class="capacity-allocation-chart-wrap">
              <canvas id="capacityAllocationExecutiveChart" aria-label="${esc(`${summary.fiscalYearLabel} capacity allocation by work type`)}"></canvas>
            </div>
            <div class="capacity-allocation-chart-caption">Capacity allocation ${esc(summary.fiscalYearLabel)}</div>
          </div>
          <div class="capacity-allocation-legend nice-scroll" aria-label="Capacity allocation legend">
            ${renderCapacityExecutiveLegend(summary)}
          </div>
        </div>
      </div>
    </section>`;
}

function renderExecutiveMetricsTableCard(summary) {
  const metrics = summary.executiveMetrics;
  const teamValue = summary.excludedActiveCount > 0
    ? `${summary.allActiveCount.toLocaleString()} resources (${summary.excludedActiveCount} non-assignable)`
    : `${summary.allActiveCount.toLocaleString()} resources`;
  const rows = [
    {
      metric: 'Revenue Generating Capacity',
      value: formatExecutivePercentage(metrics.revenueGeneratingShare),
      fte: formatExecutiveFte(metrics.revenueGeneratingFte),
      headline: true,
    },
    {
      metric: 'Revenue Enabling Capacity',
      value: formatExecutivePercentage(metrics.revenueEnablingShare),
      fte: formatExecutiveFte(metrics.revenueEnablingFte),
      headline: true,
    },
    {
      metric: 'Investment & Overhead',
      value: formatExecutivePercentage(metrics.investmentOverheadShare),
      fte: formatExecutiveFte(metrics.investmentOverheadFte),
      headline: true,
    },
    {
      metric: 'Total Team Size',
      value: teamValue,
      fte: '—',
    },
    {
      metric: 'Available Capacity',
      value: '—',
      fte: formatExecutiveFte(summary.equivalentCapacity),
    },
    {
      metric: 'Annual Capacity',
      value: `${formatExecutiveDays(summary.availableCapacityDays).replace(' days', '')} person-days`,
      fte: '—',
    },
    {
      metric: 'Equivalent Capacity',
      value: `${summary.equivalentCapacity.toFixed(1)} man-years`,
      fte: '—',
      assumption: summary.defaultAnnualWorkdays > 0
        ? `assuming ${summary.defaultAnnualWorkdays.toLocaleString()} working days/year`
        : 'annual Workdays configuration is zero',
    },
  ];

  return `
    <section class="capacity-executive-card dc dc-capacity-executive" data-card-key="executive-metrics" data-card-title="Executive Metrics" aria-labelledby="executiveMetricsTitle">
      <div class="dc-handle" title="Drag card left or right" aria-label="Drag Executive Metrics card left or right">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/>
          <circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/>
          <circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/>
        </svg>
      </div>
      <button class="card-collapse-toggle" type="button" aria-expanded="true" title="Minimize Executive Metrics" aria-label="Minimize Executive Metrics">
        <span aria-hidden="true">⌃</span>
      </button>
      <div class="card-collapsed-shell" aria-hidden="true">
        <span class="card-collapsed-shell__title">Executive Metrics</span>
        <span class="card-collapsed-shell__value">${esc(summary.fiscalYearLabel)}</span>
      </div>
      <div class="card-expandable-content">
        <header class="capacity-executive-card__header">
          <div>
            <p class="capacity-executive-card__eyebrow">Leadership view</p>
            <h2 id="executiveMetricsTitle" class="capacity-executive-card__title">Executive Metrics</h2>
            <p class="capacity-executive-card__subtitle">Capacity categories are derived from the selected matrix fiscal year and active resource availability.</p>
          </div>
          <span class="capacity-executive-card__fy">${esc(summary.fiscalYearLabel)}</span>
        </header>
        <div class="capacity-executive-table-wrap">
          <table class="capacity-executive-table">
            <colgroup><col style="width:50%"><col style="width:27%"><col style="width:23%"></colgroup>
            <thead>
              <tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">FTE</th></tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr class="${row.headline ? 'capacity-executive-table__row--headline' : ''}">
                  <td class="capacity-executive-table__metric">${esc(row.metric)}</td>
                  <td class="capacity-executive-table__value">
                    ${esc(row.value)}
                    ${row.assumption ? `<span class="capacity-executive-table__assumption">${esc(row.assumption)}</span>` : ''}
                  </td>
                  <td class="capacity-executive-table__fte">${esc(row.fte)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="capacity-executive-note">
            <div class="capacity-executive-note__item">
              <div class="capacity-executive-note__label">Revenue generating</div>
              <div class="capacity-executive-note__value">Intrasourcing, Local PS and Training Delivery</div>
            </div>
            <div class="capacity-executive-note__item">
              <div class="capacity-executive-note__label">Revenue enabling</div>
              <div class="capacity-executive-note__value">Pre-Sales allocation</div>
            </div>
            <div class="capacity-executive-note__item">
              <div class="capacity-executive-note__label">Investment & overhead</div>
              <div class="capacity-executive-note__value">Skill Development and General Admin</div>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function getCapacityExecutiveChartRows(summary) {
  const positiveRows = summary.allocationMix.rows.filter(row => row.share > 0);
  if (positiveRows.length) return positiveRows;

  return [{
    key: 'empty',
    label: 'No planned allocation',
    share: 1,
    displayShare: 0,
    color: '#E2E8F0',
  }];
}

function renderCapacityExecutiveChart(summary) {
  const canvas = document.getElementById('capacityAllocationExecutiveChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (S.charts?.capacityAllocationExecutive) {
    S.charts.capacityAllocationExecutive.destroy();
  }

  const rows = getCapacityExecutiveChartRows(summary);
  const hasAllocation = summary.allocationMix.totalAllocationPoints > 0;
  const centerLabel = hasAllocation ? '100%' : '0%';
  const centerTextPlugin = {
    id: 'capacityExecutiveCenterText',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const point = meta?.data?.[0];
      if (!point) return;

      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#173A67';
      ctx.font = '700 30px Inter, sans-serif';
      ctx.fillText(centerLabel, point.x, point.y - 7);
      ctx.fillStyle = '#64748B';
      ctx.font = '500 12px Inter, sans-serif';
      ctx.fillText('Team capacity', point.x, point.y + 21);

      if (hasAllocation) {
        meta.data.forEach((arc, index) => {
          const share = Number(rows[index]?.share) || 0;
          if (share < 3) return;

          const angle = (arc.startAngle + arc.endAngle) / 2;
          const radius = arc.innerRadius + ((arc.outerRadius - arc.innerRadius) * 0.58);
          const x = arc.x + (Math.cos(angle) * radius);
          const y = arc.y + (Math.sin(angle) * radius);
          const background = String(rows[index]?.color || '#000000').replace('#', '');
          const red = parseInt(background.slice(0, 2), 16) || 0;
          const green = parseInt(background.slice(2, 4), 16) || 0;
          const blue = parseInt(background.slice(4, 6), 16) || 0;
          const luminance = ((0.299 * red) + (0.587 * green) + (0.114 * blue));

          ctx.fillStyle = luminance > 165 ? '#17324D' : '#FFFFFF';
          ctx.font = '700 11px Inter, sans-serif';
          ctx.fillText(formatExecutivePercentage(share), x, y);
        });
      }
      ctx.restore();
    },
  };

  S.charts ||= {};
  S.charts.capacityAllocationExecutive = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map(row => row.label),
      datasets: [{
        data: rows.map(row => row.share),
        backgroundColor: rows.map(row => row.color),
        borderColor: '#FFFFFF',
        borderWidth: 2,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '56%',
      layout: { padding: 8 },
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              if (!hasAllocation) return 'No planned allocation';
              return `${context.label}: ${formatExecutivePercentage(context.raw)}`;
            },
          },
        },
      },
    },
    plugins: [centerTextPlugin],
  });
}

function renderCapacityExecutiveCards() {
  const root = document.getElementById('capacityExecutiveCards');
  if (!root) return;

  const summary = getCapacityExecutiveSummary();
  root.innerHTML = [
    renderCapacityAllocationExecutiveCard(summary),
    renderExecutiveMetricsTableCard(summary),
  ].join('');
  renderCapacityExecutiveChart(summary);
  if (typeof initCardDrag === 'function') initCardDrag();
}
