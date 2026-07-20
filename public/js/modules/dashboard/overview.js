/* Workforce Allocation Dashboard — dashboard/overview.js */

/* ================================================================ STATS */
function getActiveResourceDesignationSummary() {
  const designationCounts = new Map(
    (RESOURCE_DESIGNATIONS || []).map(designation => [designation, 0]),
  );
  const designationInitials = new Map([
    ['Team Lead', 'TL'],
    ['Senior Consultant', 'SC'],
    ['Consultant', 'C'],
    ['Junior Consultant', 'JC'],
    ['Analyst', 'A'],
  ]);

  for (const employee of S.employees || []) {
    if (Number(employee?.active ?? 1) === 0) continue;

    const matchedDesignation = (RESOURCE_DESIGNATIONS || []).find(designation => (
      normalizeDesignationKey(designation) ===
      normalizeDesignationKey(employee.designation)
    ));

    if (!matchedDesignation) continue;
    designationCounts.set(
      matchedDesignation,
      (designationCounts.get(matchedDesignation) || 0) + 1,
    );
  }

  return [
    {
      label: 'SM',
      fullLabel: 'Senior Manager, Delivery',
      count: 1,
      isManager: true,
    },
    ...(RESOURCE_DESIGNATIONS || []).map(designation => ({
      label: designationInitials.get(designation) || designation,
      fullLabel: designation,
      count: designationCounts.get(designation) || 0,
      isManager: false,
    })),
  ];
}

function renderActiveResourceDesignationList() {
  const rows = getActiveResourceDesignationSummary();

  return `
    <section class="active-resource-composition" aria-label="Active resources by designation">
      <div class="active-resource-composition__heading">
        <span>Team composition</span>
        <span class="active-resource-composition__hint">By designation</span>
      </div>
      <div class="active-resource-composition__grid">
        ${rows.map(row => `
          <div class="active-resource-composition__item${row.isManager ? ' active-resource-composition__item--manager' : ''}" title="${esc(row.fullLabel)}">
            <span class="active-resource-composition__label" aria-label="${esc(row.fullLabel)}">${esc(row.label)}</span>
            <span class="active-resource-composition__count" aria-label="${esc(`${row.count} ${row.fullLabel}`)}">${esc(String(row.count))}</span>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function formatRunningProjectRevenue(value) {
  if (typeof formatRevenueViewValue === 'function') {
    return formatRevenueViewValue(value);
  }

  const amount = Number(value) || 0;
  const absoluteAmount = Math.abs(amount);

  if (absoluteAmount >= 1_000_000) {
    return `$${(amount / 1_000_000).toLocaleString('en-US', {
      maximumFractionDigits: 1,
    })}M`;
  }

  if (absoluteAmount >= 1_000) {
    return `$${(amount / 1_000).toLocaleString('en-US', {
      maximumFractionDigits: 1,
    })}K`;
  }

  return `$${amount.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
}

function renderRunningProjectSummary(s) {
  const rows = [
    {
      label: 'Delayed Projects',
      value: (Number(s.delayed_running_projects) || 0).toLocaleString(),
      tone: 'delayed',
    },
    {
      label: 'On-Time Projects',
      value: (Number(s.on_time_running_projects) || 0).toLocaleString(),
      tone: 'on-time',
    },
    {
      label: 'Running Revenue',
      value: formatRunningProjectRevenue(s.running_project_revenue),
      tone: 'revenue',
    },
  ];

  return `
    <section class="running-project-health" aria-label="Running project health">
      <div class="running-project-health__heading">
        <span class="running-project-health__hint">Professional Services</span>
      </div>
      <div class="running-project-health__list">
        ${rows.map(row => `
          <div class="running-project-health__item running-project-health__item--${row.tone}">
            <span class="running-project-health__label">${esc(row.label)}</span>
            <span class="running-project-health__value">${esc(String(row.value))}</span>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function renderRunningProjectCard(c, s) {
  return `
    <div class="running-project-card">
      <div class="running-project-card__summary">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
        <div class="text-sm text-gray-500">${esc(c.label)}</div>
      </div>
      ${renderRunningProjectSummary(s)}
    </div>`;
}

function formatUtilizationMetric(value) {
  return `${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function renderUtilizationBreakdown(s) {
  const rows = [
    {
      label: 'Avg. Intrasourcing Utilization',
      value: formatUtilizationMetric(s.avg_intrasourcing_utilization),
      tone: 'intrasourcing',
    },
    {
      label: 'Billable Utilization',
      value: formatUtilizationMetric(s.billable_utilization),
      tone: 'billable',
    },
    {
      label: 'Project Utilization',
      value: formatUtilizationMetric(s.project_utilization),
      tone: 'project',
    },
  ];

  return `
    <section class="utilization-breakdown" aria-label="Utilization allocation averages">
      <div class="utilization-breakdown__heading">
        <span class="utilization-breakdown__hint">Allocation averages</span>
      </div>
      <div class="utilization-breakdown__list">
        ${rows.map(row => `
          <div class="utilization-breakdown__item utilization-breakdown__item--${row.tone}">
            <span class="utilization-breakdown__label">${esc(row.label)}</span>
            <span class="utilization-breakdown__value">${esc(row.value)}</span>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function renderUtilizationCard(c, td, s) {
  return `
    <div class="utilization-card">
      <div class="utilization-card__summary">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
        <div class="text-sm text-gray-500 mb-2">${esc(c.label)}</div>
        ${renderStatTrend(td)}
      </div>
      ${renderUtilizationBreakdown(s)}
    </div>`;
}

function renderAssignedProjectBreakdown(s) {
  const rows = [
    {
      label: 'Running Project',
      value: (Number(s.running_projects) || 0).toLocaleString(),
      tone: 'running',
    },
    {
      label: 'Weighted Prospect',
      value: (Number(s.weighted_prospect_projects) || 0).toLocaleString(),
      tone: 'weighted',
    },
    {
      label: 'Prospect',
      value: (Number(s.prospect_projects) || 0).toLocaleString(),
      tone: 'prospect',
    },
  ];

  return `
    <section class="assigned-project-breakdown" aria-label="Project portfolio counts">
      <div class="assigned-project-breakdown__heading">
        <span class="assigned-project-breakdown__hint">Project portfolio</span>
      </div>
      <div class="assigned-project-breakdown__list">
        ${rows.map(row => `
          <div class="assigned-project-breakdown__item assigned-project-breakdown__item--${row.tone}">
            <span class="assigned-project-breakdown__label">${esc(row.label)}</span>
            <span class="assigned-project-breakdown__value">${esc(row.value)}</span>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function renderAssignedProjectsCard(c, td, s) {
  return `
    <div class="assigned-project-card">
      <div class="assigned-project-card__summary">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
        <div class="text-sm text-gray-500 mb-2">${esc(c.label)}</div>
        ${renderStatTrend(td)}
      </div>
      ${renderAssignedProjectBreakdown(s)}
    </div>`;
}

function renderStatTrend(td) {
  const up = td.up;

  return `
    <div class="stat-card-trend ${up ? 'text-green-600' : 'text-orange-600'}">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${up
          ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
          : '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'}
      </svg>
      <span>${esc(td.value)}</span>
    </div>`;
}

function renderStatSummary(c, td, { activeResource = false } = {}) {
  return `
    <div class="${activeResource ? 'active-resource-card__summary' : ''}">
      <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
      </div>
      <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
      <div class="text-sm text-gray-500 mb-2">${esc(c.label)}</div>
      ${renderStatTrend(td)}
    </div>`;
}

function renderStats(s) {
  const t = s.trends || {};
  const cards = [
    {
      v: s.active_employees.toLocaleString(),
      label: 'Active Resources',
      tk: 'employees',
      action: 'view-employees',
      bg: 'bg-blue-100',
      fg: 'text-blue-600',
      formula: 'Active team members · click to manage active/inactive status',
      icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      detailType: 'designation-breakdown',
    },
    {
      v: Number(s.running_projects || 0).toLocaleString(),
      label: 'Running Projects',
      tk: 'projects',
      action: 'view-projects',
      bg: 'bg-purple-100',
      fg: 'text-purple-600',
      formula: 'Closed Won Professional Services projects only. Delayed means the Close Won Date passed six months ago and progress remains below 100%. Revenue uses Product Amount, falling back to Opportunity Amount or Budget.',
      icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
      detailType: 'running-project-breakdown',
    },
    {
      v: `${s.avg_utilization}%`,
      label: 'Avg Utilization',
      tk: 'utilization',
      bg: 'bg-teal-100',
      fg: 'text-teal-600',
      formula: 'Available weekly allocation only; N/A resource-weeks are excluded. Avg. Intrasourcing uses the matrix Intrasourcing average. Billable adds Intrasourcing, Local and Pre Sale. Project Utilization also adds Training.',
      icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
      detailType: 'utilization-breakdown',
    },
    {
      v: s.assigned_projects.toLocaleString(),
      label: 'Assigned Projects',
      tk: 'assigned_projects',
      bg: 'bg-orange-100',
      fg: 'text-orange-600',
      formula: `Distinct projects with ≥ 1 weekly assignment in FY${S.fiscalYear}. Running Projects use the existing Closed Won Professional Services definition. Weighted Prospects are non-Closed Won projects with probability ≥ 75%; Prospects are non-Closed Won projects with probability below 75%.`,
      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
      detailType: 'assigned-project-breakdown',
    },
    { v: `${s.productivity}/${s.ps_count}`, label: 'Productivity Score', tk: 'productivity', bg: 'bg-amber-100', fg: 'text-amber-600', formula: `Active PS Resources: ${s.ps_count} · Avg Utilization: ${s.avg_utilization}% · Score = avg util ÷ PS count`, icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
    { v: `${s.on_time_pct}%`, label: 'On-Time Completion', tk: 'on_time', bg: 'bg-emerald-100', fg: 'text-emerald-600', formula: 'On-track projects ÷ Total projects × 100', icon: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
  ];

  document.getElementById('statsRow').innerHTML = cards.map(c => {
    const td = t[c.tk] || { value: '—', up: true };
    const isActiveResourceCard = c.detailType === 'designation-breakdown';
    const isRunningProjectCard = c.detailType === 'running-project-breakdown';
    const isUtilizationCard = c.detailType === 'utilization-breakdown';
    const isAssignedProjectCard = c.detailType === 'assigned-project-breakdown';
    const wrapperClass = [
      'dc',
      'dc-stat',
      isActiveResourceCard ? 'dc-stat--active-resources' : '',
      isRunningProjectCard ? 'dc-stat--running-projects' : '',
      isUtilizationCard ? 'dc-stat--utilization' : '',
      isAssignedProjectCard ? 'dc-stat--assigned-projects' : '',
    ].filter(Boolean).join(' ');
    const cardContent = isActiveResourceCard
      ? `
        <div class="active-resource-card">
          ${renderStatSummary(c, td, { activeResource: true })}
          ${renderActiveResourceDesignationList()}
        </div>`
      : isRunningProjectCard
        ? renderRunningProjectCard(c, s)
        : isUtilizationCard
          ? renderUtilizationCard(c, td, s)
          : isAssignedProjectCard
            ? renderAssignedProjectsCard(c, td, s)
            : renderStatSummary(c, td);

    return `
      <div class="${wrapperClass}"${c.action ? ` data-stat-action="${c.action}" style="cursor:pointer"` : ''}>
        <div class="dc-handle" title="Drag card">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/>
            <circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/>
            <circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/>
          </svg>
        </div>
        <div class="stat-card-inner bg-white rounded-xl border border-gray-200 p-5 relative" style="box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div class="stat-tooltip">${esc(c.formula)}</div>
          ${cardContent}
        </div>
      </div>`;
  }).join('');
}

/* ================================================================ CHARTS */
function renderTrends(data) { if (S.charts.trends) S.charts.trends.destroy(); const ctx = document.getElementById('trendsChart').getContext('2d'); S.charts.trends = new Chart(ctx, { type: 'line', data: { labels: data.map(d => d.label), datasets: [{ label: 'Assignments', data: data.map(d => d.assignments), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.06)', tension: 0.4, borderWidth: 2, pointRadius: 3, fill: true, yAxisID: 'y' }, { label: 'Utilization %', data: data.map(d => d.utilization), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.04)', tension: 0.4, borderWidth: 2, pointRadius: 3, yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, padding: 8 } }, scales: { x: { ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y: { position: 'left', ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y1: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } } } } }); }

function getAssignmentBurnSeries() {
  const months = fiscalMonths(S.fiscalYear);
  const labels = months.map(month => month.label);
  const monthIndex = new Map(
    months.map((month, index) => [`${month.y}-${month.m}`, index]),
  );
  const activeEmployeeIds = new Set(
    getActiveEmployees().map(employee => Number(employee.id)),
  );
  const plannedHours = months.map(() => 0);
  const actualHours = months.map(() => 0);

  // Planned effort comes from the effective Resource Assignment rows. The
  // effective-assignment helper already removes N/A resource-weeks and any
  // other assignments that must not participate in analytics for those slots.
  for (const assignment of getEffectiveFiscalAssignments(S.fiscalYear)) {
    const employeeId = Number(assignment.employee_id);
    if (!activeEmployeeIds.has(employeeId)) continue;

    const index = monthIndex.get(
      `${Number(assignment.year)}-${Number(assignment.month)}`,
    );
    if (index === undefined) continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    plannedHours[index] += WORK_HOURS_PER_WEEK * (percentage / 100);
  }

  // Actual effort is recorded Time Sheet delivery. It is intentionally not
  // extrapolated into future months: months after the latest reported month
  // remain null in the cumulative/remaining actual series.
  const visibleTimesheetRows = typeof getVisibleTimesheetRows === 'function'
    ? getVisibleTimesheetRows()
    : (S.timesheetRows || []);

  for (const row of visibleTimesheetRows) {
    const parsedMonth = typeof parseMonthlyWorkMonth === 'function'
      ? parseMonthlyWorkMonth(
        row.month ?? row.Month ?? row.month_label ?? row.monthLabel,
      )
      : null;
    if (!parsedMonth) continue;

    const index = monthIndex.get(`${parsedMonth.year}-${parsedMonth.month}`);
    if (index === undefined) continue;

    if (
      typeof classifyMonthlyActualWorkType === 'function' &&
      !classifyMonthlyActualWorkType(
        row.workType ?? row.work_type ?? row['Work Type'],
      )
    ) {
      continue;
    }

    const hours = Number(row.qty ?? row.hours ?? row.quantity);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    actualHours[index] += hours;
  }

  const roundHours = value => +((Number(value) || 0).toFixed(2));
  const roundedPlannedHours = plannedHours.map(roundHours);
  const roundedActualHours = actualHours.map(roundHours);
  const totalPlannedHours = roundHours(
    roundedPlannedHours.reduce((total, value) => total + value, 0),
  );
  const lastActualIndex = roundedActualHours.reduce(
    (latest, value, index) => value > 0 ? index : latest,
    -1,
  );

  let cumulativePlannedValue = 0;
  let cumulativeActualValue = 0;

  const cumulativePlanned = roundedPlannedHours.map(value => {
    cumulativePlannedValue += value;
    return roundHours(cumulativePlannedValue);
  });

  const cumulativeActual = roundedActualHours.map((value, index) => {
    if (lastActualIndex < 0 || index > lastActualIndex) return null;
    cumulativeActualValue += value;
    return roundHours(cumulativeActualValue);
  });

  const plannedRemaining = cumulativePlanned.map(value => (
    roundHours(Math.max(totalPlannedHours - value, 0))
  ));
  const actualRemaining = cumulativeActual.map(value => (
    value === null
      ? null
      : roundHours(Math.max(totalPlannedHours - value, 0))
  ));

  return {
    labels,
    plannedHours: roundedPlannedHours,
    actualHours: roundedActualHours,
    cumulativePlanned,
    cumulativeActual,
    plannedRemaining,
    actualRemaining,
    totalPlannedHours,
    actualToDate: lastActualIndex >= 0
      ? Number(cumulativeActual[lastActualIndex]) || 0
      : 0,
    lastActualIndex,
  };
}

function burnChartTooltipUnit(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}h`;
}

function burnChartAxisUnit(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function burnTooltipFooter(series, index) {
  const plannedMonth = series.plannedHours[index] || 0;
  const actualMonth = series.actualHours[index] || 0;
  const lines = [`Planned this month: ${burnChartTooltipUnit(plannedMonth)}`];

  if (index <= series.lastActualIndex) {
    lines.push(`Actual this month: ${burnChartTooltipUnit(actualMonth)}`);
    const cumulativeVariance = (series.cumulativeActual[index] || 0) -
      (series.cumulativePlanned[index] || 0);
    lines.push(
      `Actual vs planned to date: ${cumulativeVariance >= 0 ? '+' : ''}${burnChartTooltipUnit(cumulativeVariance)}`,
    );
  } else {
    lines.push('Actual this month: not reported');
  }

  return lines;
}

function burnChartLegendOptions() {
  return {
    display: true,
    position: 'bottom',
    labels: {
      boxWidth: 10,
      boxHeight: 10,
      font: { size: 10 },
      padding: 12,
      usePointStyle: true,
    },
  };
}

function burnChartTooltipOptions(series) {
  return {
    bodyFont: { size: 11 },
    titleFont: { size: 11 },
    footerFont: { size: 10 },
    padding: 9,
    filter: context => context.raw !== null,
    callbacks: {
      label: context => ` ${context.dataset.label}: ${burnChartTooltipUnit(context.parsed.y)}`,
      footer: items => items.length
        ? burnTooltipFooter(series, items[0].dataIndex)
        : [],
    },
  };
}

function renderBurndownChart() {
  if (S.charts.burndown) S.charts.burndown.destroy();
  const element = document.getElementById('burndownChart');
  if (!element) return;

  const series = getAssignmentBurnSeries();

  S.charts.burndown = new Chart(element.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Planned remaining',
          data: series.plannedRemaining,
          borderColor: '#2563EB',
          borderDash: [5, 4],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 4,
        },
        {
          label: 'Actual remaining',
          data: series.actualRemaining,
          borderColor: '#DC2626',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.2,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: burnChartLegendOptions(),
        tooltip: burnChartTooltipOptions(series),
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 35, minRotation: 0 },
          grid: { color: '#F3F4F6' },
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(series.totalPlannedHours, 1),
          ticks: { font: { size: 10 }, callback: burnChartAxisUnit },
          grid: { color: '#F3F4F6' },
          title: {
            display: true,
            text: 'Remaining effort (hours)',
            font: { size: 10 },
            color: '#9CA3AF',
          },
        },
      },
    },
  });
}

function renderBurnupChart() {
  if (S.charts.burnup) S.charts.burnup.destroy();
  const element = document.getElementById('burnupChart');
  if (!element) return;

  const series = getAssignmentBurnSeries();
  const chartMaximum = Math.max(
    series.totalPlannedHours,
    series.actualToDate,
    1,
  );

  S.charts.burnup = new Chart(element.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Cumulative planned',
          data: series.cumulativePlanned,
          borderColor: '#2563EB',
          borderDash: [5, 4],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 4,
        },
        {
          label: 'Cumulative actual',
          data: series.cumulativeActual,
          borderColor: '#059669',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.2,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
          spanGaps: false,
        },
        {
          label: 'Total planned scope',
          data: series.labels.map(() => series.totalPlannedHours),
          borderColor: '#64748B',
          borderDash: [3, 4],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          borderWidth: 1.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: burnChartLegendOptions(),
        tooltip: burnChartTooltipOptions(series),
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 35, minRotation: 0 },
          grid: { color: '#F3F4F6' },
        },
        y: {
          beginAtZero: true,
          suggestedMax: chartMaximum,
          ticks: { font: { size: 10 }, callback: burnChartAxisUnit },
          grid: { color: '#F3F4F6' },
          title: {
            display: true,
            text: 'Cumulative effort (hours)',
            font: { size: 10 },
            color: '#9CA3AF',
          },
        },
      },
    },
  });
}
