/* Workforce Allocation Dashboard — dashboard/overview.js */

/* ================================================================ STATS */
const ACTIVE_RESOURCE_DESIGNATION_GROUPS = Object.freeze([
  Object.freeze({
    label: 'SM',
    fullLabel: 'Senior Manager',
    tooltipLabel: 'Senior Manager',
    aliases: Object.freeze(['Senior Manager']),
    isManager: true,
  }),
  Object.freeze({
    label: 'TL',
    fullLabel: 'Technical Lead',
    tooltipLabel: 'Technical Lead, Senior Project Manager',
    aliases: Object.freeze(['Team Lead', 'Technical Lead', 'Senior Project Manager']),
  }),
  Object.freeze({
    label: 'SC',
    fullLabel: 'Senior Consultant',
    tooltipLabel: 'Senior Consultant, Senior Software Engineer, Project Manager',
    aliases: Object.freeze(['Senior Consultant', 'Senior Software Engineer', 'Project Manager']),
  }),
  Object.freeze({
    label: 'C',
    fullLabel: 'Consultant',
    tooltipLabel: 'Consultant, Software Engineer, Jr. Project Manager',
    aliases: Object.freeze(['Consultant', 'Software Engineer', 'Jr. Project Manager', 'Junior Project Manager']),
  }),
  Object.freeze({
    label: 'JC',
    fullLabel: 'Jr. Consultant',
    tooltipLabel: 'Jr. Consultant, Software Developer, Project Coordinator',
    aliases: Object.freeze(['Junior Consultant', 'Jr. Consultant', 'Software Developer', 'Project Coordinator']),
  }),
  Object.freeze({
    label: 'A',
    fullLabel: 'Analyst',
    tooltipLabel: 'Analyst',
    aliases: Object.freeze(['Analyst']),
  }),
]);

function resourceMatchesActiveDesignationGroup(employee, group) {
  if (!employee || !group) return false;
  const employeeDesignation = normalizeDesignationAliasKey(
    canonicalResourceDesignationLabel(employee.designation),
  );
  return group.aliases.some(alias => (
    normalizeDesignationAliasKey(canonicalResourceDesignationLabel(alias)) === employeeDesignation
  ));
}

function getActiveResourceDesignationSummary() {
  const employees = S.employees || [];

  return ACTIVE_RESOURCE_DESIGNATION_GROUPS.map(group => {
    const matchingResources = employees.filter(employee => (
      Number(employee?.active ?? 1) !== 0 &&
      resourceMatchesActiveDesignationGroup(employee, group)
    ));

    return {
      label: group.label,
      fullLabel: group.fullLabel,
      tooltipLabel: group.tooltipLabel,
      count: matchingResources.length,
      isManager: Boolean(group.isManager),
    };
  });
}

function renderActiveResourceDesignationList() {
  const rows = getActiveResourceDesignationSummary();

  return `
    <section class="active-resource-composition" aria-label="Active resources by designation">
      <div class="active-resource-composition__heading">
        <span>Team composition</span>
        <span class="active-resource-composition__hint">By designation</span>
      </div>
      <div class="active-resource-composition__grid${rows.length > 6 ? ' active-resource-composition__grid--compact' : ''}">
        ${rows.map(row => `
          <button
            type="button"
            class="active-resource-composition__item${row.isManager ? ' active-resource-composition__item--manager' : ''}"
            data-action="open-designation-resources"
            data-designation="${esc(row.fullLabel)}"
            title="Open ${esc(row.tooltipLabel)} resources"
            aria-label="Open ${esc(row.tooltipLabel)} resources, ${esc(String(row.count))} people"
          >
            <span class="active-resource-composition__label">${esc(row.label)}</span>
            <span class="active-resource-composition__count">${esc(String(row.count))}</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}

function getDesignationModalResources(designation) {
  const normalizedDesignation = normalizeDesignationKey(designation);
  const group = ACTIVE_RESOURCE_DESIGNATION_GROUPS.find(item => (
    normalizeDesignationKey(item.fullLabel) === normalizedDesignation
  ));

  if (group) {
    return (S.employees || []).filter(employee => (
      Number(employee?.active ?? 1) !== 0 &&
      resourceMatchesActiveDesignationGroup(employee, group)
    ));
  }

  return (S.employees || []).filter(employee => (
    Number(employee?.active ?? 1) !== 0 &&
    normalizeDesignationKey(canonicalResourceDesignationLabel(employee.designation)) === normalizedDesignation
  ));
}

function openDesignationResourceModal(designation) {
  const resources = getDesignationModalResources(designation);
  const rows = resources.map((employee, index) => {
    const utilization = Number(S.employeeUtil?.get(Number(employee.id)) || 0);
    const displayedDesignation = canonicalResourceDesignationLabel(
      employee.designation || designation,
    );

    return `
      <button
        type="button"
        class="flex w-full items-center gap-3 border-b border-gray-100 px-5 py-3 text-left transition-colors last:border-0 hover:bg-gray-50"
        data-action="edit-emp-side"
        data-emp="${Number(employee.id)}"
      >
        <span class="w-6 flex-shrink-0 text-xs font-semibold text-gray-400">${index + 1}</span>
        <span class="avatar-grad flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs">${esc(inits(employee.name))}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold text-gray-900">${esc(employee.name)}</span>
          <span class="block truncate text-xs text-gray-500">${esc(displayedDesignation)}</span>
        </span>
        <span class="hidden min-w-0 flex-1 md:block">
          <span class="block truncate text-xs text-gray-600">${esc(employee.dept || '—')}</span>
          <span class="block truncate text-xs text-gray-400">${esc(employee.email || '—')}</span>
        </span>
        <span class="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ub(utilization)}">${utilization.toFixed(1)}%</span>
      </button>`;
  }).join('');

  openModal(`
    ${mHdr(
      designation,
      `${resources.length} active resource${resources.length === 1 ? '' : 's'} · click a resource to edit`,
    )}
    <div class="nice-scroll modal-scroll-body">
      ${rows || '<div class="px-6 py-12 text-center text-sm text-gray-400">No active resources in this designation</div>'}
    </div>
    <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
      <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, 'max-w-3xl');
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
      key: 'running',
      label: 'Running Projects',
      value: (Number(s.running_projects) || 0).toLocaleString(),
      tone: 'on-time',
    },
    {
      key: 'delayed',
      label: 'Delayed Projects',
      value: (Number(s.delayed_running_projects) || 0).toLocaleString(),
      tone: 'delayed',
    },
    {
      key: 'revenue',
      label: 'Revenue Realization',
      value: formatRunningProjectRevenue(s.revenue_realization),
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
          <button
            type="button"
            class="running-project-health__item running-project-health__item--${row.tone}"
            data-action="open-running-project-metric"
            data-running-project-metric="${esc(row.key)}"
            aria-label="Open ${esc(row.label)} project list"
          >
            <span class="running-project-health__label">${esc(row.label)}</span>
            <span class="running-project-health__value">${esc(String(row.value))}</span>
          </button>
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
      key: 'intrasourcing',
      label: 'Intrasourcing Utilization',
      value: formatUtilizationMetric(s.avg_intrasourcing_utilization),
      tone: 'intrasourcing',
    },
    {
      key: 'billable',
      label: 'Billable Utilization',
      value: formatUtilizationMetric(s.billable_utilization),
      tone: 'billable',
    },
    {
      key: 'project',
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
          <button
            type="button"
            class="utilization-breakdown__item utilization-breakdown__item--${row.tone}"
            data-action="open-utilization-details"
            data-utilization-metric="${esc(row.key)}"
            aria-label="Open ${esc(row.label)} calculation details. Exact value ${esc(row.exactValue)}"
            title="${esc(row.label)}: ${esc(row.exactValue)}"
          >
            <span class="utilization-breakdown__label">${esc(row.label)}</span>
            <span class="utilization-breakdown__value">${esc(row.value)}</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}

const UTILIZATION_DETAIL_CONFIG = Object.freeze({
  intrasourcing: Object.freeze({
    title: 'Intrasourcing Utilization',
    formula: 'Average of each eligible resource’s Intrasourcing allocation over that resource’s available fiscal-year weeks.',
    included: 'Intrasourcing',
  }),
  billable: Object.freeze({
    title: 'Billable Utilization',
    formula: 'Average of each eligible resource’s Intrasourcing + Local allocation.',
    included: 'Intrasourcing + Local',
  }),
  project: Object.freeze({
    title: 'Project Utilization',
    formula: 'Average of each eligible resource’s Intrasourcing + Local + Pre-Sale + Training allocation.',
    included: 'Intrasourcing + Local + Pre-Sale + Training',
  }),
});

async function openUtilizationDetailsModal(metric) {
  const config = UTILIZATION_DETAIL_CONFIG[metric];
  if (!config) return;

  openModal(`
    ${mHdr(config.title, 'Loading calculation details…')}
    <div class="p-8 text-center text-sm text-gray-400">Loading…</div>
    <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
      <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, 'max-w-6xl');

  try {
    const result = await api(
      'GET',
      `/api/dashboard/utilization-details?fiscalYear=${encodeURIComponent(S.fiscalYear)}&metric=${encodeURIComponent(metric)}`,
    );
    const resources = Array.isArray(result.resources) ? result.resources : [];
    const rows = resources.map((resource, index) => `
      <tr class="border-b border-gray-100 last:border-0">
        <td class="px-3 py-2 text-xs text-gray-400">${index + 1}</td>
        <td class="px-3 py-2">
          <div class="text-sm font-semibold text-gray-900">${esc(resource.name)}</div>
          <div class="text-xs text-gray-400">${esc(resource.designation || 'No designation')}</div>
        </td>
        <td class="px-3 py-2 text-right text-xs text-gray-600">${Number(resource.available_weeks)} / 48</td>
        <td class="px-3 py-2 text-right text-xs text-gray-600">${formatUtilizationMetric(resource.allocation.intrasourcing)}</td>
        <td class="px-3 py-2 text-right text-xs text-gray-600">${formatUtilizationMetric(resource.allocation.local)}</td>
        <td class="px-3 py-2 text-right text-xs text-gray-600">${formatUtilizationMetric(resource.allocation.preSale)}</td>
        <td class="px-3 py-2 text-right text-xs text-gray-600">${formatUtilizationMetric(resource.allocation.training)}</td>
        <td class="px-3 py-2 text-right text-xs text-gray-600">${formatUtilizationMetric(resource.allocation.skillDevelopment)}</td>
        <td class="px-3 py-2 text-right text-sm font-semibold text-gray-900">${formatUtilizationMetric(resource.metrics[metric])}</td>
      </tr>`).join('');

    openModal(`
      ${mHdr(config.title, `FY${Number(result.fiscal_year) + 1} · ${result.eligible_resources} eligible resources`)}
      <div class="modal-scroll-body nice-scroll">
        <div class="grid gap-3 border-b border-gray-100 bg-gray-50 p-5 md:grid-cols-3">
          <div class="rounded-xl border border-gray-200 bg-white p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Displayed average</div>
            <div class="mt-1 text-2xl font-semibold text-gray-900">${formatUtilizationMetric(result.average)}</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Included allocation</div>
            <div class="mt-1 text-sm font-semibold text-gray-800">${esc(config.included)}</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Availability denominator</div>
            <div class="mt-1 text-sm font-semibold text-gray-800">${Number(result.total_available_weeks).toLocaleString()} resource-weeks</div>
          </div>
          <div class="md:col-span-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            ${esc(config.formula)} N/A weeks are removed only for the affected resource-week; Skill Development and General Admin are excluded from these three metrics.
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[1240px] border-collapse text-left">
            <thead class="sticky top-0 bg-white shadow-sm">
              <tr>
                <th class="px-3 py-2 text-xs font-semibold text-gray-500">#</th>
                <th class="px-3 py-2 text-xs font-semibold text-gray-500">Resource</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Available weeks</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Intrasourcing</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Local</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Pre-Sale</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Training</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Skill Development</th>
                <th class="px-3 py-2 text-right text-xs font-semibold text-gray-700">${esc(config.title)}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
        <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
      </div>
    `, 'max-w-6xl');
  } catch (error) {
    closeModal();
    toast(error.message, 'error');
  }
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

function renderPipelineBreakdown(summary) {
  const rows = [
    {
      key: 'converted',
      label: 'Converted',
      value: (summary.converted?.length || 0).toLocaleString(),
      tone: 'converted',
    },
    {
      key: 'weighted',
      label: 'Weighted',
      value: (summary.weighted?.length || 0).toLocaleString(),
      tone: 'weighted',
    },
    {
      key: 'prospect',
      label: 'Prospect',
      value: (summary.prospect?.length || 0).toLocaleString(),
      tone: 'prospect',
    },
  ];

  return `
    <section class="assigned-project-breakdown" aria-label="Pre-Sale Product pipeline classifications">
      <div class="assigned-project-breakdown__heading">
        <span class="assigned-project-breakdown__hint">Pipeline</span>
      </div>
      <div class="assigned-project-breakdown__list">
        ${rows.map(row => `
          <button
            type="button"
            class="assigned-project-breakdown__item assigned-project-breakdown__item--${row.tone}"
            data-action="open-pipeline-presale-summary"
            aria-label="Open Converted, Weighted, Best Case and Prospect pipeline summary"
          >
            <span class="assigned-project-breakdown__label">${esc(row.label)}</span>
            <span class="assigned-project-breakdown__value">${esc(row.value)}</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}


function renderPipelineCard(c, summary) {
  return `
    <div class="assigned-project-card">
      <div class="assigned-project-card__summary">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
        <div class="text-sm text-gray-500 mb-2">${esc(c.summaryLabel || c.label)}</div>
      </div>
      ${renderPipelineBreakdown(summary)}
    </div>`;
}



function getCalculatedCommittedTargetSummary() {
  const totals = {
    intrasourcing: 0,
    local: 0,
  };
  const activeEmployeeById = new Map(
    getActiveEmployees().map(employee => [Number(employee.id), employee]),
  );

  for (const assignment of getEffectiveFiscalAssignments(
    S.matrixFiscalYear,
    S.matrixAssignments,
  )) {
    const employee = activeEmployeeById.get(Number(assignment.employee_id));
    if (!employee) continue;

    const category = classifyAllocationProject(
      getSummaryAssignmentProjectName(assignment),
    );
    if (category !== 'intrasourcing' && category !== 'local') continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    const rateRecord = getRevenueRateForAssignment(employee.designation, assignment);
    const hourlyRate = getRevenueRateValue(rateRecord, category);
    if (hourlyRate === null) continue;

    const hours = WORK_HOURS_PER_WEEK * (percentage / 100);
    totals[category] += hours * hourlyRate;
  }

  return {
    intrasourcing: +totals.intrasourcing.toFixed(2),
    local: +totals.local.toFixed(2),
    total: +(totals.intrasourcing + totals.local).toFixed(2),
  };
}

function getCommittedTargetRecord(targetKey) {
  return (S.committedTargets || []).find(target => (
    target?.target_key === targetKey
  )) || null;
}

function getCommittedTargetSummary() {
  const calculated = getCalculatedCommittedTargetSummary();
  const savedIntrasourcing = getCommittedTargetRecord('intrasourcing');
  const savedLocal = getCommittedTargetRecord('local');
  const savedLocalPipeline = getCommittedTargetRecord('local_pipeline');
  const intrasourcing = savedIntrasourcing?.updated_at
    ? Number(savedIntrasourcing.amount) || 0
    : calculated.intrasourcing;
  const local = savedLocal?.updated_at
    ? Number(savedLocal.amount) || 0
    : calculated.local;
  const localPipeline = Number(savedLocalPipeline?.amount) || 0;

  return {
    intrasourcing: +intrasourcing.toFixed(2),
    local: +local.toFixed(2),
    localPipeline: +localPipeline.toFixed(2),
    // Local Pipeline Target is a planning-only input and must never be added
    // to the Committed Target KPI total.
    total: +(intrasourcing + local).toFixed(2),
  };
}

function formatCommittedTargetRevenue(value) {
  return typeof formatRevenueViewValue === 'function'
    ? formatRevenueViewValue(value)
    : `$${Number(value || 0).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })}`;
}

function renderCommittedTargetBreakdown(summary) {
  const rows = [
    {
      key: 'intrasourcing',
      label: 'Intrasourcing Revenue Target',
      value: formatCommittedTargetRevenue(summary.intrasourcing),
      tone: 'intrasourcing',
    },
    {
      key: 'local',
      label: 'Local PS Revenue Target',
      value: formatCommittedTargetRevenue(summary.local),
      tone: 'local',
    },
    {
      key: 'local_pipeline',
      label: 'Local Pipeline Target',
      value: formatCommittedTargetRevenue(summary.localPipeline),
      tone: 'pipeline',
    },
  ];

  return `
    <section class="committed-target-breakdown" aria-label="Committed revenue targets">
      <div class="committed-target-breakdown__heading">
        <span class="committed-target-breakdown__hint">Revenue targets</span>
      </div>
      <div class="committed-target-breakdown__list">
        ${rows.map(row => `
          <button
            type="button"
            class="committed-target-breakdown__item committed-target-breakdown__item--${row.tone}"
            data-action="edit-committed-target"
            data-target-key="${esc(row.key)}"
            aria-label="Edit ${esc(row.label)}"
          >
            <span class="committed-target-breakdown__label">${esc(row.label)}</span>
            <span class="committed-target-breakdown__value">${esc(row.value)}</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}

function renderCommittedTargetCard(c, summary) {
  return `
    <div class="committed-target-card">
      <div class="committed-target-card__summary">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div class="committed-target-card__amount">${esc(formatCommittedTargetRevenue(summary.total))}</div>
        <div class="committed-target-card__title">Committed Target</div>
      </div>
      ${renderCommittedTargetBreakdown(summary)}
    </div>`;
}

const CAPACITY_HOURS_PER_WORKDAY = 8;

function getCapacityAllocationDetails() {
  const activeEmployees = getActiveEmployees();
  const employeeById = new Map(
    activeEmployees.map(employee => [Number(employee.id), employee]),
  );
  const resourceRows = activeEmployees.map(employee => {
    const workdayAdjustment = getAdjustedEmployeeWorkdays(
      employee.id,
      employee.workdays,
      S.matrixFiscalYear,
      S.matrixAssignments,
    );
    const capacityHours = workdayAdjustment.adjustedWorkdays * CAPACITY_HOURS_PER_WORKDAY;
    const hourlyRate = getAverageRevenueRateForFiscalYear(
      employee.designation,
      RESOURCE_REVENUE_RATE_FIELDS.local,
      S.matrixFiscalYear,
    );
    const maximumAmount = hourlyRate === null
      ? 0
      : capacityHours * hourlyRate;

    return {
      id: Number(employee.id),
      name: employee.name || '',
      designation: employee.designation || 'No supported designation',
      baseWorkdays: workdayAdjustment.baseWorkdays,
      unavailableMonthCount: workdayAdjustment.unavailableMonthCount,
      workdayDeduction: workdayAdjustment.workdayDeduction,
      workdays: workdayAdjustment.adjustedWorkdays,
      capacityHours,
      hourlyRate,
      maximumAmount,
      note: hourlyRate === null
        ? 'Excluded from monetary capacity: no supported Local rate.'
        : '',
    };
  });

  const allocationByEmployee = new Map(
    activeEmployees.map(employee => [Number(employee.id), {
      id: Number(employee.id),
      name: employee.name || '',
      designation: employee.designation || 'No supported designation',
      intrasourcingHours: 0,
      localHours: 0,
      intrasourcingRate: null,
      localRate: null,
      intrasourcingRevenue: 0,
      localRevenue: 0,
      intrasourcingUnpricedHours: 0,
      localUnpricedHours: 0,
      assignmentCount: 0,
      note: '',
    }]),
  );

  for (const assignment of getEffectiveFiscalAssignments(
    S.matrixFiscalYear,
    S.matrixAssignments,
  )) {
    const employee = employeeById.get(Number(assignment.employee_id));
    if (!employee) continue;

    const category = classifyAllocationProject(
      getSummaryAssignmentProjectName(assignment),
    );
    if (category !== 'intrasourcing' && category !== 'local') continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;

    const row = allocationByEmployee.get(Number(employee.id));
    const hours = WORK_HOURS_PER_WEEK * (percentage / 100);
    row.assignmentCount += 1;

    const rateRecord = getRevenueRateForAssignment(employee.designation, assignment);
    const hourlyRate = getRevenueRateValue(rateRecord, category);

    if (category === 'intrasourcing') {
      row.intrasourcingHours += hours;
      if (hourlyRate === null) row.intrasourcingUnpricedHours += hours;
      else row.intrasourcingRevenue += hours * hourlyRate;
    }
    if (category === 'local') {
      row.localHours += hours;
      if (hourlyRate === null) row.localUnpricedHours += hours;
      else row.localRevenue += hours * hourlyRate;
    }
  }

  for (const employee of activeEmployees) {
    const row = allocationByEmployee.get(Number(employee.id));
    row.intrasourcingRate = row.intrasourcingHours > 0
      ? row.intrasourcingRevenue / row.intrasourcingHours
      : getAverageRevenueRateForFiscalYear(
        employee.designation,
        RESOURCE_REVENUE_RATE_FIELDS.intrasourcing,
        S.matrixFiscalYear,
      );
    row.localRate = row.localHours > 0
      ? row.localRevenue / row.localHours
      : getAverageRevenueRateForFiscalYear(
        employee.designation,
        RESOURCE_REVENUE_RATE_FIELDS.local,
        S.matrixFiscalYear,
      );
    row.totalRevenue = row.intrasourcingRevenue + row.localRevenue;

    const missing = [];
    if (row.intrasourcingUnpricedHours > 0) missing.push('Intrasourcing rate missing for part of the fiscal year');
    if (row.localUnpricedHours > 0) missing.push('Local rate missing for part of the fiscal year');
    row.note = missing.join(' · ');
  }

  const allocatedRows = [...allocationByEmployee.values()]
    .filter(row => row.assignmentCount > 0 || row.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue || a.name.localeCompare(b.name));
  const maximumCapacity = resourceRows.reduce(
    (sum, row) => sum + row.maximumAmount,
    0,
  );
  const availableCapacityDays = resourceRows.reduce(
    (sum, row) => sum + row.workdays,
    0,
  );
  const intrasourcingAllocated = allocatedRows.reduce(
    (sum, row) => sum + row.intrasourcingRevenue,
    0,
  );
  const localAllocated = allocatedRows.reduce(
    (sum, row) => sum + row.localRevenue,
    0,
  );
  const capacityAllocated = intrasourcingAllocated + localAllocated;

  return {
    resourceRows,
    allocatedRows,
    maximumCapacity: +maximumCapacity.toFixed(2),
    availableCapacityDays: +availableCapacityDays.toFixed(2),
    intrasourcingAllocated: +intrasourcingAllocated.toFixed(2),
    localAllocated: +localAllocated.toFixed(2),
    capacityAllocated: +capacityAllocated.toFixed(2),
    remainingCapacity: +(maximumCapacity - capacityAllocated).toFixed(2),
  };
}

function getCapacityAllocationSummary() {
  const details = getCapacityAllocationDetails();
  return {
    maximumCapacity: details.maximumCapacity,
    availableCapacityDays: details.availableCapacityDays,
    capacityAllocated: details.capacityAllocated,
    remainingCapacity: details.remainingCapacity,
  };
}

function formatCapacityDays(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} days`;
}

function renderCapacityAllocationBreakdown(summary) {
  const rows = [
    {
      key: 'maximum',
      label: 'Max Capacity Amount',
      value: formatCommittedTargetRevenue(summary.maximumCapacity),
      exactValue: formatExactRevenueValue(summary.maximumCapacity),
      tone: 'maximum',
    },
    {
      key: 'days',
      label: 'Available Capacity',
      value: formatCapacityDays(summary.availableCapacityDays),
      exactValue: formatCapacityDays(summary.availableCapacityDays),
      tone: 'days',
    },
    {
      key: 'allocated',
      label: 'Capacity Allocated',
      value: formatCommittedTargetRevenue(summary.capacityAllocated),
      exactValue: formatExactRevenueValue(summary.capacityAllocated),
      tone: 'allocated',
    },
  ];

  return `
    <section class="capacity-allocation-breakdown" aria-label="Allocated capacity totals">
      <div class="capacity-allocation-breakdown__heading">
        <span class="capacity-allocation-breakdown__hint">Annual capacity</span>
      </div>
      <div class="capacity-allocation-breakdown__list">
        ${rows.map(row => `
          <button
            type="button"
            class="capacity-allocation-breakdown__item capacity-allocation-breakdown__item--${row.tone}"
            data-action="open-capacity-details"
            data-capacity-metric="${esc(row.key)}"
            aria-label="Open ${esc(row.label)} calculation details. Exact value ${esc(row.exactValue)}"
            title="${esc(row.label)}: ${esc(row.exactValue)}"
          >
            <span class="capacity-allocation-breakdown__label">${esc(row.label)}</span>
            <span class="capacity-allocation-breakdown__value">${esc(row.value)}</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}

function formatCapacityRate(value) {
  return value === null
    ? '—'
    : `$${Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}/h`;
}

function capacityDetailSummaryCards(cards) {
  return `
    <div class="grid gap-3 px-5 pt-5 sm:grid-cols-2" style="grid-template-columns:repeat(${Math.min(cards.length, 4)},minmax(0,1fr));">
      ${cards.map(card => `
        <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">${esc(card.label)}</div>
          <div class="mt-1 text-lg font-semibold text-gray-900">${esc(card.value)}</div>
          ${card.note ? `<div class="mt-1 text-xs text-gray-500">${esc(card.note)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function renderMaximumCapacityDetails(details) {
  const excludedCount = details.resourceRows.filter(row => row.hourlyRate === null).length;
  const rows = details.resourceRows
    .sort((a, b) => b.maximumAmount - a.maximumAmount || a.name.localeCompare(b.name))
    .map((row, index) => `
      <tr class="border-b border-gray-100 last:border-0">
        <td class="px-3 py-3 text-xs text-gray-400">${index + 1}</td>
        <td class="px-3 py-3">
          <div class="text-sm font-semibold text-gray-900">${esc(row.name)}</div>
          <div class="text-xs text-gray-400">${esc(row.designation)}</div>
        </td>
        <td class="px-3 py-3">
          <div class="workdays-inline-editor workdays-inline-editor--capacity">
            <input id="capacityWorkdays-${row.id}" type="number" min="0" step="1" value="${esc(String(row.baseWorkdays))}" aria-label="Base Workdays for ${esc(row.name)}">
            <button type="button" onclick="saveEmployeeWorkdays(${row.id}, 'capacityWorkdays-${row.id}', 'maximum')">Save</button>
          </div>
        </td>
        <td class="px-3 py-3 text-right text-sm text-amber-700">${row.unavailableMonthCount ? `${esc(String(row.unavailableMonthCount))} × ${N_A_MONTHLY_WORKDAYS_DEDUCTION.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}</td>
        <td class="px-3 py-3 text-right"><span class="adjusted-workdays-badge">${esc(formatCapacityDays(row.workdays).replace(' days', ''))}</span></td>
        <td class="px-3 py-3 text-right text-sm text-gray-600">${esc(row.capacityHours.toLocaleString('en-US', { maximumFractionDigits: 2 }))}h</td>
        <td class="px-3 py-3 text-right text-sm text-gray-600">${esc(formatCapacityRate(row.hourlyRate))}</td>
        <td class="px-3 py-3 text-right text-sm font-semibold text-gray-900">${esc(formatExactRevenueValue(row.maximumAmount))}</td>
        <td class="px-3 py-3 text-xs text-amber-700">${esc(row.note || 'Included')}</td>
      </tr>`).join('');

  return `
    ${capacityDetailSummaryCards([
      { label: 'Max Capacity Amount', value: formatExactRevenueValue(details.maximumCapacity) },
      { label: 'Active Resources', value: String(details.resourceRows.length) },
      { label: 'Available Capacity', value: formatCapacityDays(details.availableCapacityDays) },
      { label: 'Resources Without Rate', value: String(excludedCount) },
    ])}
    <div class="mx-5 mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
      Formula per resource: adjusted Workdays × ${CAPACITY_HOURS_PER_WORKDAY} hours/day × saved Local / Pre-Sale / Training hourly rate. Each fiscal month containing one or more N/A assignments deducts ${N_A_MONTHLY_WORKDAYS_DEDUCTION.toLocaleString('en-US', { maximumFractionDigits: 0 })} days once for that resource, with a zero-day floor. Resources without a supported rate contribute $0.
    </div>
    <div class="nice-scroll mt-4 overflow-x-auto">
      <table class="w-full min-w-[900px] border-collapse text-left">
        <thead class="sticky top-0 z-10 bg-white shadow-sm">
          <tr>
            <th class="px-3 py-2 text-xs font-semibold text-gray-500">#</th>
            <th class="px-3 py-2 text-xs font-semibold text-gray-500">Resource</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Base Workdays</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">N/A Deduction</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Adjusted Workdays</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Capacity Hours</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Hourly Rate</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Capacity Amount</th>
            <th class="px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderAvailableCapacityDetails(details) {
  const averageDays = details.resourceRows.length
    ? details.availableCapacityDays / details.resourceRows.length
    : 0;
  const rows = [...details.resourceRows]
    .sort((a, b) => b.workdays - a.workdays || a.name.localeCompare(b.name))
    .map((row, index) => `
      <tr class="border-b border-gray-100 last:border-0">
        <td class="px-4 py-3 text-xs text-gray-400">${index + 1}</td>
        <td class="px-4 py-3">
          <div class="text-sm font-semibold text-gray-900">${esc(row.name)}</div>
          <div class="text-xs text-gray-400">${esc(row.designation)}</div>
        </td>
        <td class="px-4 py-3">
          <div class="workdays-inline-editor workdays-inline-editor--capacity">
            <input id="availableWorkdays-${row.id}" type="number" min="0" step="1" value="${esc(String(row.baseWorkdays))}" aria-label="Base Workdays for ${esc(row.name)}">
            <button type="button" onclick="saveEmployeeWorkdays(${row.id}, 'availableWorkdays-${row.id}', 'days')">Save</button>
          </div>
        </td>
        <td class="px-4 py-3 text-right text-sm text-amber-700">${row.unavailableMonthCount ? `${esc(String(row.unavailableMonthCount))} month${row.unavailableMonthCount === 1 ? '' : 's'} / ${esc(formatCapacityDays(row.workdayDeduction))}` : '—'}</td>
        <td class="px-4 py-3 text-right"><span class="adjusted-workdays-badge">${esc(formatCapacityDays(row.workdays))}</span></td>
        <td class="px-4 py-3 text-right text-sm text-gray-600">${esc(row.capacityHours.toLocaleString('en-US', { maximumFractionDigits: 2 }))}h</td>
      </tr>`).join('');

  return `
    ${capacityDetailSummaryCards([
      { label: 'Available Capacity', value: formatCapacityDays(details.availableCapacityDays) },
      { label: 'Active Resources', value: String(details.resourceRows.length) },
      { label: 'Average Workdays', value: `${averageDays.toLocaleString('en-US', { maximumFractionDigits: 0 })} days` },
      { label: 'Hours Per Workday', value: String(CAPACITY_HOURS_PER_WORKDAY) },
    ])}
    <div class="mx-5 mt-4 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-xs text-teal-800">
      Available Capacity is the sum of adjusted Workdays for active resources. Each affected resource-month with one or more N/A assignments deducts ${N_A_MONTHLY_WORKDAYS_DEDUCTION.toLocaleString('en-US', { maximumFractionDigits: 0 })} days once, never below zero. Capacity hours are adjusted Workdays × ${CAPACITY_HOURS_PER_WORKDAY}.
    </div>
    <div class="nice-scroll mt-4 overflow-x-auto">
      <table class="w-full min-w-[880px] border-collapse text-left">
        <thead class="sticky top-0 z-10 bg-white shadow-sm">
          <tr>
            <th class="px-4 py-2 text-xs font-semibold text-gray-500">#</th>
            <th class="px-4 py-2 text-xs font-semibold text-gray-500">Resource</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Base Workdays</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">N/A Deduction</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Adjusted Workdays</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Capacity Hours</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderAllocatedCapacityDetails(details) {
  const rows = details.allocatedRows.map((row, index) => `
    <tr class="border-b border-gray-100 last:border-0">
      <td class="px-3 py-3 text-xs text-gray-400">${index + 1}</td>
      <td class="px-3 py-3">
        <div class="text-sm font-semibold text-gray-900">${esc(row.name)}</div>
        <div class="text-xs text-gray-400">${esc(row.designation)}</div>
      </td>
      <td class="px-3 py-3 text-right text-sm text-gray-600">${row.intrasourcingHours.toFixed(1)}h</td>
      <td class="px-3 py-3 text-right text-sm text-gray-600">${esc(formatCapacityRate(row.intrasourcingRate))}</td>
      <td class="px-3 py-3 text-right text-sm text-indigo-700">${esc(formatExactRevenueValue(row.intrasourcingRevenue))}</td>
      <td class="px-3 py-3 text-right text-sm text-gray-600">${row.localHours.toFixed(1)}h</td>
      <td class="px-3 py-3 text-right text-sm text-gray-600">${esc(formatCapacityRate(row.localRate))}</td>
      <td class="px-3 py-3 text-right text-sm text-amber-700">${esc(formatExactRevenueValue(row.localRevenue))}</td>
      <td class="px-3 py-3 text-right text-sm font-semibold text-gray-900">${esc(formatExactRevenueValue(row.totalRevenue))}</td>
      <td class="px-3 py-3 text-xs text-amber-700">${esc(row.note || 'Included')}</td>
    </tr>`).join('');

  return `
    ${capacityDetailSummaryCards([
      { label: 'Capacity Allocated', value: formatExactRevenueValue(details.capacityAllocated) },
      { label: 'Intrasourcing Revenue', value: formatExactRevenueValue(details.intrasourcingAllocated) },
      { label: 'Local Revenue', value: formatExactRevenueValue(details.localAllocated) },
      { label: 'Contributing Resources', value: String(details.allocatedRows.length) },
    ])}
    <div class="mx-5 mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      Capacity Allocated = planned Intrasourcing revenue + planned Local revenue for active resources in ${fiscalYearDisplayLabel(S.matrixFiscalYear)}. Hours use 36.66 × allocation percentage ÷ 100. N/A resource-weeks are excluded. Pre-Sale and Training are not included.
    </div>
    <div class="nice-scroll mt-4 overflow-x-auto">
      <table class="w-full min-w-[1180px] border-collapse text-left">
        <thead class="sticky top-0 z-10 bg-white shadow-sm">
          <tr>
            <th class="px-3 py-2 text-xs font-semibold text-gray-500">#</th>
            <th class="px-3 py-2 text-xs font-semibold text-gray-500">Resource</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Intra Hours</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Intra Rate</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Intra Revenue</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Local Hours</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Local Rate</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Local Revenue</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Total</th>
            <th class="px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="10" class="px-6 py-12 text-center text-sm text-gray-400">No Intrasourcing or Local planned revenue is available.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function openCapacityAllocationDetailsModal(metric) {
  const details = getCapacityAllocationDetails();
  const config = {
    maximum: {
      title: 'Maximum Capacity Amount',
      subtitle: 'Adjusted Workdays × 8 hours × designation Local rate',
      body: renderMaximumCapacityDetails(details),
    },
    days: {
      title: 'Available Capacity',
      subtitle: 'Adjusted active-resource Workdays after monthly N/A deductions',
      body: renderAvailableCapacityDetails(details),
    },
    allocated: {
      title: 'Capacity Allocated',
      subtitle: 'Planned Intrasourcing and Local revenue',
      body: renderAllocatedCapacityDetails(details),
    },
  }[metric];

  if (!config) return;

  openModal(`
    ${mHdr(config.title, config.subtitle)}
    <div class="modal-scroll-body nice-scroll">
      ${config.body}
    </div>
    <div class="modal-footer flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-4">
      <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, 'max-w-7xl');
}

function renderCapacityAllocationCard(c, summary) {
  return `
    <div class="capacity-allocation-card">
      <div class="capacity-allocation-card__summary">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div
          class="capacity-allocation-card__amount"
          title="Exact Allocated Capacity: ${esc(formatExactRevenueValue(summary.remainingCapacity))}"
        >${esc(formatCommittedTargetRevenue(summary.remainingCapacity))}</div>
        <div class="capacity-allocation-card__title">Allocated Capacity</div>
      </div>
      ${renderCapacityAllocationBreakdown(summary)}
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
  S.dashboardStats = s;
  const t = s.trends || {};
  const preSalePipelineSummary = getPreSalePipelineKpiSummary();
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
      v: Number(s.total_ps_projects || 0).toLocaleString(),
      label: 'Total Projects',
      tk: 'projects',
      action: 'view-projects',
      bg: 'bg-purple-100',
      fg: 'text-purple-600',
      formula: `Total Projects matches Deal Acquisition Chart → PS Only for ${fiscalYearDisplayLabel(S.matrixFiscalYear)}: Closed Won projects whose Product Name is a PS System Support or PS Project Implementation variation. Progress does not affect this total. Running Projects are the below-100% subset using the existing March 1, 2025 cutoff; Delayed Projects are evaluated across all fiscal years: Closed Won PS projects whose Project Closing Date exists, is earlier than today, and whose Progress is still below 100%. Revenue Realization is Product Amount for PS projects with Project Closing Date inside the selected FY and Progress exactly 100%.`,
      icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
      detailType: 'running-project-breakdown',
    },
    {
      v: `${s.avg_utilization}%`,
      label: 'Avg Utilization',
      tk: 'utilization',
      bg: 'bg-teal-100',
      fg: 'text-teal-600',
      formula: 'Available weekly allocation only; N/A resource-weeks are excluded. Intrasourcing Utilization uses the matrix Intrasourcing average. Billable includes only Intrasourcing and Local. Project Utilization includes Intrasourcing, Local, Pre-Sale and Training.',
      icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
      detailType: 'utilization-breakdown',
    },
    {
      v: formatCommittedTargetRevenue(preSalePipelineSummary.totalAmount),
      label: 'Pipeline',
      summaryLabel: 'Total Pipeline Amount',
      action: 'view-pipeline-presale-summary',
      bg: 'bg-orange-100',
      fg: 'text-orange-600',
      formula: `Total Pipeline Amount includes Active Pre-Sale Products only. Converted = Percent exactly 100%. Weighted = Percent at or above the configured Secured threshold (${preSalePipelineSummary.securedMinPercent}%) but below 100%. Best Case = Percent from the configured Best Case threshold (${preSalePipelineSummary.bestCaseMinPercent}%) up to below Secured. Prospect = Percent below Best Case.`,
      icon: '<path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/>',
      detailType: 'pipeline-breakdown',
    },
    {
      label: 'Committed Target',
      bg: 'bg-amber-100',
      fg: 'text-amber-600',
      formula: 'Committed Target equals only the saved Intrasourcing Revenue Target plus the saved Local PS Revenue Target. Local Pipeline Target is a separate planning input and is not added to the Committed Target total. Click any target row to edit and persist its amount.',
      icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      detailType: 'committed-target-breakdown',
    },
    {
      label: 'Allocated Capacity',
      bg: 'bg-indigo-100',
      fg: 'text-indigo-600',
      formula: 'Remaining Capacity equals Maximum Capacity Amount minus Capacity Allocated. Maximum Capacity uses each active resource’s adjusted Workdays × 8 hours × saved Local / Pre-Sale / Training designation rate. Each affected N/A resource-month deducts 18.33 days once. Capacity Allocated is planned Intrasourcing revenue plus planned Local revenue.',
      icon: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/><path d="M2 19h22"/>',
      detailType: 'capacity-allocation-breakdown',
    },
  ];

  const committedTargetSummary = getCommittedTargetSummary();
  const capacityAllocationSummary = getCapacityAllocationSummary();

  document.getElementById('statsRow').innerHTML = cards.map(c => {
    const td = t[c.tk] || { value: '—', up: true };
    const isActiveResourceCard = c.detailType === 'designation-breakdown';
    const isRunningProjectCard = c.detailType === 'running-project-breakdown';
    const isUtilizationCard = c.detailType === 'utilization-breakdown';
    const isPipelineCard = c.detailType === 'pipeline-breakdown';
    const isCommittedTargetCard = c.detailType === 'committed-target-breakdown';
    const isCapacityAllocationCard = c.detailType === 'capacity-allocation-breakdown';
    const collapsedValue = isCommittedTargetCard
      ? formatCommittedTargetRevenue(committedTargetSummary.total)
      : isCapacityAllocationCard
        ? formatCommittedTargetRevenue(capacityAllocationSummary.remainingCapacity)
        : (c.v ?? '');
    const wrapperClass = [
      'dc',
      'dc-stat',
      isActiveResourceCard ? 'dc-stat--active-resources' : '',
      isRunningProjectCard ? 'dc-stat--running-projects' : '',
      isUtilizationCard ? 'dc-stat--utilization' : '',
      isPipelineCard ? 'dc-stat--pipeline' : '',
      isCommittedTargetCard ? 'dc-stat--committed-target' : '',
      isCapacityAllocationCard ? 'dc-stat--capacity-allocation' : '',
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
          : isPipelineCard
            ? renderPipelineCard(c, preSalePipelineSummary)
            : isCommittedTargetCard
              ? renderCommittedTargetCard(c, committedTargetSummary)
              : isCapacityAllocationCard
                ? renderCapacityAllocationCard(c, capacityAllocationSummary)
                : renderStatSummary(c, td);

    return `
      <div class="${wrapperClass}" data-card-key="${esc(c.detailType || c.label)}" data-card-title="${esc(c.label)}"${c.action ? ` data-stat-action="${c.action}" style="cursor:pointer"` : ''}>
        <div class="dc-handle" title="Drag card left or right" aria-label="Drag ${esc(c.label)} card left or right">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/>
            <circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/>
            <circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/>
          </svg>
        </div>
        <button class="card-collapse-toggle" type="button" aria-expanded="true" title="Minimize ${esc(c.label)}" aria-label="Minimize ${esc(c.label)}">
          <span aria-hidden="true">⌃</span>
        </button>
        <div class="card-collapsed-shell" aria-hidden="true">
          <span class="card-collapsed-shell__title">${esc(c.label)}</span>
          <span class="card-collapsed-shell__value">${esc(collapsedValue)}</span>
        </div>
        <div class="card-expandable-content">
          <div class="stat-card-inner bg-white rounded-xl border border-gray-200 p-5 relative" style="box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div class="stat-tooltip">${esc(c.formula)}</div>
            ${cardContent}
          </div>
        </div>
      </div>`;
  }).join('');

  if (typeof renderCapacityExecutiveCards === 'function') {
    renderCapacityExecutiveCards();
  }
}

/* ================================================================ CHARTS */
function getOverviewChartTooltipElement(chart, kind = 'chart') {
  const id = `overview-${kind}-tooltip-${chart.canvas.id}`;
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('div');
    element.id = id;
    element.className = 'dashboard-chart-table-tooltip';
    element.setAttribute('role', 'tooltip');
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
  }
  return element;
}

function hideOverviewChartTooltip(element) {
  if (!element) return;
  element.classList.remove('is-visible');
  element.setAttribute('aria-hidden', 'true');
}

function positionOverviewChartTooltip(element, chart, tooltip) {
  if (!element || !chart?.canvas || !tooltip) return;

  // Measure from a neutral fixed-position origin, then clamp to the viewport.
  element.style.left = '0px';
  element.style.top = '0px';
  element.classList.add('is-visible');
  element.setAttribute('aria-hidden', 'false');

  const canvasRect = chart.canvas.getBoundingClientRect();
  const tooltipRect = element.getBoundingClientRect();
  const margin = 10;
  const gap = 14;
  let left = canvasRect.left + tooltip.caretX + gap;
  let top = canvasRect.top + tooltip.caretY - (tooltipRect.height / 2);

  if (left + tooltipRect.width > window.innerWidth - margin) {
    left = canvasRect.left + tooltip.caretX - tooltipRect.width - gap;
  }
  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = canvasRect.top + tooltip.caretY - tooltipRect.height - gap;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
}

function renderAssignmentTrendsTooltip(context) {
  const { chart, tooltip } = context;
  const element = getOverviewChartTooltipElement(chart, 'assignment-trends');

  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    hideOverviewChartTooltip(element);
    return;
  }

  const title = String(tooltip.title?.[0] || tooltip.dataPoints[0]?.label || '');
  const rows = tooltip.dataPoints.map(point => {
    const label = String(point.dataset?.label || '');
    const numeric = Number(point.parsed?.y) || 0;
    const value = label.toLowerCase().includes('utilization')
      ? `${numeric.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
      : numeric.toLocaleString('en-US', { maximumFractionDigits: 1 });
    return { label, value };
  });

  element.innerHTML = `
    <div class="dashboard-chart-table-tooltip__title">${esc(title)}</div>
    <table class="dashboard-chart-tooltip-table">
      <tbody>
        ${rows.map(row => `
          <tr>
            <th>${esc(row.label)}</th>
            <td>${esc(row.value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  positionOverviewChartTooltip(element, chart, tooltip);
}

function renderTrends(data) {
  if (S.charts.trends) S.charts.trends.destroy();
  const canvas = document.getElementById('trendsChart');
  if (!canvas) return;

  S.charts.trends = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        {
          label: 'Assignments',
          data: data.map(d => d.assignments),
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37,99,235,0.06)',
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'Utilization %',
          data: data.map(d => d.utilization),
          borderColor: '#059669',
          backgroundColor: 'rgba(5,150,105,0.04)',
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          enabled: false,
          external: renderAssignmentTrendsTooltip,
        },
      },
      scales: {
        x: { ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } },
        y: { position: 'left', ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } },
        y1: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

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


function getBurnTableTooltipElement(chart) {
  const element = getOverviewChartTooltipElement(chart, 'burn');
  element.classList.add('burn-chart-table-tooltip');
  element.setAttribute('role', 'tooltip');
  return element;
}

function signedBurnValue(value, formatter) {
  const numeric = Number(value) || 0;
  return `${numeric > 0 ? '+' : ''}${formatter(numeric)}`;
}

function renderBurnTableTooltip(context, title, rows) {
  const { chart, tooltip } = context;
  const element = getBurnTableTooltipElement(chart);

  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    hideOverviewChartTooltip(element);
    return;
  }

  element.innerHTML = `
    <div class="dashboard-chart-table-tooltip__title">${esc(title)}</div>
    <table class="dashboard-chart-tooltip-table burn-chart-tooltip-table">
      <tbody>
        ${rows.map(row => `
          <tr class="${row.emphasis ? 'is-emphasis' : ''}">
            <th>${esc(row.label)}</th>
            <td>${esc(row.value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  positionOverviewChartTooltip(element, chart, tooltip);
}

function burnTableTooltipOptions(series, mode) {
  return {
    enabled: false,
    external: context => {
      const index = context.tooltip?.dataPoints?.[0]?.dataIndex;
      if (index === undefined) {
        renderBurnTableTooltip(context, '', []);
        return;
      }

      const hasActual = index <= series.lastActualIndex;
      if (mode === 'burndown') {
        const cumulativeVariance = hasActual
          ? (series.cumulativeActual[index] || 0) - (series.cumulativePlanned[index] || 0)
          : null;
        renderBurnTableTooltip(context, series.labels[index], [
          { label: 'Planned this month', value: burnChartTooltipUnit(series.plannedHours[index]) },
          { label: 'Actual this month', value: hasActual ? burnChartTooltipUnit(series.actualHours[index]) : 'Not reported' },
          { label: 'Planned remaining', value: burnChartTooltipUnit(series.plannedRemaining[index]), emphasis: true },
          { label: 'Actual remaining', value: hasActual ? burnChartTooltipUnit(series.actualRemaining[index]) : 'Not reported', emphasis: true },
          { label: 'Actual vs plan to date', value: hasActual ? signedBurnValue(cumulativeVariance, burnChartTooltipUnit) : 'Not reported' },
        ]);
        return;
      }

      const variance = hasActual
        ? (series.cumulativeActual[index] || 0) - (series.cumulativePlanned[index] || 0)
        : null;
      renderBurnTableTooltip(context, series.labels[index], [
        { label: 'Planned this month', value: burnupRevenueTooltipUnit(series.plannedRevenue[index]) },
        { label: 'Actual this month', value: hasActual ? burnupRevenueTooltipUnit(series.actualRevenue[index]) : 'Not reported' },
        { label: 'Cumulative planned', value: burnupRevenueTooltipUnit(series.cumulativePlanned[index]), emphasis: true },
        { label: 'Cumulative actual', value: hasActual ? burnupRevenueTooltipUnit(series.cumulativeActual[index]) : 'Not reported', emphasis: true },
        { label: 'Actual vs plan to date', value: hasActual ? signedBurnValue(variance, burnupRevenueTooltipUnit) : 'Not reported' },
        { label: 'Total planned revenue', value: burnupRevenueTooltipUnit(series.totalPlannedRevenue) },
      ]);
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
        tooltip: burnTableTooltipOptions(series, 'burndown'),
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


function getAssignmentBurnRevenueSeries() {
  const source = typeof getMonthlyPlannedWorkSeries === 'function'
    ? getMonthlyPlannedWorkSeries(S.fiscalYear, S.assignments)
    : { rows: [], totalPlannedRevenue: 0 };
  const rows = source.rows || [];
  const roundAmount = value => +((Number(value) || 0).toFixed(2));
  const plannedRevenue = rows.map(row => roundAmount(row.planned?.totalRevenue));
  const actualRevenue = rows.map(row => roundAmount(row.actual?.totalRevenue));
  const lastActualIndex = rows.reduce(
    (latest, row, index) => row.actual?.hasData ? index : latest,
    -1,
  );

  let cumulativePlannedValue = 0;
  let cumulativeActualValue = 0;
  const cumulativePlanned = plannedRevenue.map(value => {
    cumulativePlannedValue += value;
    return roundAmount(cumulativePlannedValue);
  });
  const cumulativeActual = actualRevenue.map((value, index) => {
    if (lastActualIndex < 0 || index > lastActualIndex) return null;
    cumulativeActualValue += value;
    return roundAmount(cumulativeActualValue);
  });

  return {
    labels: rows.map(row => row.label),
    plannedRevenue,
    actualRevenue,
    cumulativePlanned,
    cumulativeActual,
    totalPlannedRevenue: roundAmount(source.totalPlannedRevenue),
    actualToDate: lastActualIndex >= 0
      ? Number(cumulativeActual[lastActualIndex]) || 0
      : 0,
    lastActualIndex,
    plannedUnpricedHours: rows.map(row => Number(row.planned?.unpricedRevenueHours) || 0),
    actualUnpricedHours: rows.map(row => Number(row.actual?.unpricedRevenueHours) || 0),
  };
}

function burnRevenueTooltipUnit(value) {
  return `$${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function burnRevenueAxisUnit(value) {
  const n = Number(value) || 0;
  const absolute = Math.abs(n);
  if (absolute >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (absolute >= 1000) return `$${(n / 1000).toFixed(absolute >= 10000 ? 0 : 1)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function burnRevenueTooltipOptions(series) {
  return {
    bodyFont: { size: 11 },
    titleFont: { size: 11 },
    footerFont: { size: 10 },
    padding: 9,
    filter: context => context.raw !== null,
    callbacks: {
      label: context => ` ${context.dataset.label}: ${burnRevenueTooltipUnit(context.parsed.y)}`,
      footer: items => {
        if (!items.length) return [];
        const index = items[0].dataIndex;
        const plannedMonth = series.plannedRevenue[index] || 0;
        const actualMonth = series.actualRevenue[index] || 0;
        const lines = [`Planned this month: ${burnRevenueTooltipUnit(plannedMonth)}`];

        if (index <= series.lastActualIndex) {
          lines.push(`Actual this month: ${burnRevenueTooltipUnit(actualMonth)}`);
          const variance = (series.cumulativeActual[index] || 0) -
            (series.cumulativePlanned[index] || 0);
          lines.push(`Actual vs planned to date: ${variance >= 0 ? '+' : '-'}${burnRevenueTooltipUnit(Math.abs(variance))}`);
        } else {
          lines.push('Actual this month: not reported');
        }

        const unpricedHours = (series.plannedUnpricedHours[index] || 0) +
          (series.actualUnpricedHours[index] || 0);
        if (unpricedHours > 0) {
          lines.push(`Unpriced eligible hours: ${unpricedHours.toLocaleString('en-US', { maximumFractionDigits: 1 })}h`);
        }
        return lines;
      },
    },
  };
}

function getAssignmentBurnRevenueSeries() {
  const months = fiscalMonths(S.fiscalYear);
  const labels = months.map(month => month.label);
  const monthIndex = new Map(
    months.map((month, index) => [`${month.y}-${month.m}`, index]),
  );
  const activeEmployees = getActiveEmployees();
  const employeesById = new Map(activeEmployees.map(employee => [Number(employee.id), employee]));
  const employeesByName = new Map();
  for (const employee of activeEmployees) {
    const key = typeof normalizePersonName === 'function'
      ? normalizePersonName(employee.name)
      : String(employee.name || '').trim().toLowerCase();
    if (key && !employeesByName.has(key)) employeesByName.set(key, employee);
  }

  const plannedRevenue = months.map(() => 0);
  const actualRevenue = months.map(() => 0);

  for (const assignment of getEffectiveFiscalAssignments(S.fiscalYear)) {
    const employee = employeesById.get(Number(assignment.employee_id));
    if (!employee) continue;
    const index = monthIndex.get(`${Number(assignment.year)}-${Number(assignment.month)}`);
    if (index === undefined) continue;

    const percentage = Number(assignment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) continue;
    const projectName = typeof getSummaryAssignmentProjectName === 'function'
      ? getSummaryAssignmentProjectName(assignment)
      : String(assignment.project_name || '').trim();
    const categoryKey = typeof classifyMonthlyPlannedWorkType === 'function'
      ? classifyMonthlyPlannedWorkType(projectName)
      : null;
    if (!['serviceDeliveryIntrasourcing', 'serviceDeliveryLocalPs'].includes(categoryKey)) continue;

    const rateInfo = getMonthlyRevenueRate(
      categoryKey,
      employee,
      getRevenueRateDateForAssignment(assignment),
    );
    if (!rateInfo.eligible || !rateInfo.hasRate) continue;
    const hours = WORK_HOURS_PER_WEEK * (percentage / 100);
    plannedRevenue[index] += hours * rateInfo.rate;
  }

  const visibleTimesheetRows = typeof getVisibleTimesheetRows === 'function'
    ? getVisibleTimesheetRows()
    : (S.timesheetRows || []);

  for (const row of visibleTimesheetRows) {
    const parsedMonth = typeof parseMonthlyWorkMonth === 'function'
      ? parseMonthlyWorkMonth(row.month ?? row.Month ?? row.month_label ?? row.monthLabel)
      : null;
    if (!parsedMonth) continue;
    const index = monthIndex.get(`${parsedMonth.year}-${parsedMonth.month}`);
    if (index === undefined) continue;

    const categoryKey = typeof classifyMonthlyActualWorkType === 'function'
      ? classifyMonthlyActualWorkType(row.workType ?? row.work_type ?? row['Work Type'])
      : null;
    if (!['serviceDeliveryIntrasourcing', 'serviceDeliveryLocalPs'].includes(categoryKey)) continue;

    const workerKey = typeof normalizePersonName === 'function'
      ? normalizePersonName(row.worker)
      : String(row.worker || '').trim().toLowerCase();
    const employee = employeesByName.get(workerKey);
    const rateInfo = getMonthlyRevenueRate(
      categoryKey,
      employee,
      getRevenueRateDateForTimesheetRow(row, parsedMonth.year, parsedMonth.month),
    );
    if (!rateInfo.eligible || !rateInfo.hasRate) continue;

    const hours = Number(row.qty ?? row.hours ?? row.quantity);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    actualRevenue[index] += hours * rateInfo.rate;
  }

  const roundMoney = value => +((Number(value) || 0).toFixed(2));
  const roundedPlannedRevenue = plannedRevenue.map(roundMoney);
  const roundedActualRevenue = actualRevenue.map(roundMoney);
  const totalPlannedRevenue = roundMoney(
    roundedPlannedRevenue.reduce((total, value) => total + value, 0),
  );
  const lastActualIndex = roundedActualRevenue.reduce(
    (latest, value, index) => value > 0 ? index : latest,
    -1,
  );

  let cumulativePlannedValue = 0;
  let cumulativeActualValue = 0;
  const cumulativePlanned = roundedPlannedRevenue.map(value => {
    cumulativePlannedValue += value;
    return roundMoney(cumulativePlannedValue);
  });
  const cumulativeActual = roundedActualRevenue.map((value, index) => {
    if (lastActualIndex < 0 || index > lastActualIndex) return null;
    cumulativeActualValue += value;
    return roundMoney(cumulativeActualValue);
  });

  return {
    labels,
    plannedRevenue: roundedPlannedRevenue,
    actualRevenue: roundedActualRevenue,
    cumulativePlanned,
    cumulativeActual,
    totalPlannedRevenue,
    actualToDate: lastActualIndex >= 0 ? Number(cumulativeActual[lastActualIndex]) || 0 : 0,
    lastActualIndex,
  };
}

function burnupRevenueTooltipUnit(value) {
  return `$${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function burnupRevenueAxisUnit(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function burnupRevenueTooltipOptions(series) {
  return {
    bodyFont: { size: 11 },
    titleFont: { size: 11 },
    footerFont: { size: 10 },
    padding: 9,
    filter: context => context.raw !== null,
    callbacks: {
      label: context => ` ${context.dataset.label}: ${burnupRevenueTooltipUnit(context.parsed.y)}`,
      footer: items => {
        if (!items.length) return [];
        const index = items[0].dataIndex;
        const lines = [`Planned this month: ${burnupRevenueTooltipUnit(series.plannedRevenue[index])}`];
        if (index <= series.lastActualIndex) {
          lines.push(`Actual this month: ${burnupRevenueTooltipUnit(series.actualRevenue[index])}`);
          const variance = (series.cumulativeActual[index] || 0) - (series.cumulativePlanned[index] || 0);
          lines.push(`Actual vs planned to date: ${variance >= 0 ? '+' : '-'}${burnupRevenueTooltipUnit(Math.abs(variance))}`);
        } else {
          lines.push('Actual this month: not reported');
        }
        return lines;
      },
    },
  };
}

function renderBurnupChart() {
  if (S.charts.burnup) S.charts.burnup.destroy();
  const element = document.getElementById('burnupChart');
  if (!element) return;

  const series = getAssignmentBurnRevenueSeries();
  const chartMaximum = Math.max(series.totalPlannedRevenue, series.actualToDate, 1);

  S.charts.burnup = new Chart(element.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Cumulative planned revenue',
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
          label: 'Cumulative actual revenue',
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
          label: 'Total planned revenue',
          data: series.labels.map(() => series.totalPlannedRevenue),
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
        tooltip: burnTableTooltipOptions(series, 'burnup'),
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 35, minRotation: 0 },
          grid: { color: '#F3F4F6' },
        },
        y: {
          beginAtZero: true,
          suggestedMax: chartMaximum,
          ticks: { font: { size: 10 }, callback: burnupRevenueAxisUnit },
          grid: { color: '#F3F4F6' },
          title: {
            display: true,
            text: 'Cumulative revenue (USD)',
            font: { size: 10 },
            color: '#9CA3AF',
          },
        },
      },
    },
  });
}
