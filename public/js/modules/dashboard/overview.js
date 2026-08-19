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
      formula: 'Active resources only. Click to manage status.',
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
      formula: `PS Total = Closed Won PS in ${fiscalYearDisplayLabel(S.matrixFiscalYear)}. Running = Progress < 100%. Delayed = past Close Date + Progress < 100%. Realization = Close Date in FY + Progress = 100%.`,
      icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
      detailType: 'running-project-breakdown',
    },
    {
      v: `${s.avg_utilization}%`,
      label: 'Avg Utilization',
      tk: 'utilization',
      bg: 'bg-teal-100',
      fg: 'text-teal-600',
      formula: 'Billable = Intrasourcing + Local. Project = Intrasourcing + Local + Pre-Sale + Training. N/A weeks excluded.',
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
      formula: `Weighted Value = Value × Probability. Converted = 100%. Weighted = P ≥ ${preSalePipelineSummary.securedMinPercent}% and < 100%. Best Case = P ≥ ${preSalePipelineSummary.bestCaseMinPercent}% and < ${preSalePipelineSummary.securedMinPercent}%. Prospect = P < ${preSalePipelineSummary.bestCaseMinPercent}%.`,
      icon: '<path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/>',
      detailType: 'pipeline-breakdown',
    },
    {
      label: 'Committed Target',
      bg: 'bg-amber-100',
      fg: 'text-amber-600',
      formula: 'Committed Target = Intrasourcing Target + Local PS Target. Local Pipeline Target is excluded.',
      icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      detailType: 'committed-target-breakdown',
    },
    {
      label: 'Allocated Capacity',
      bg: 'bg-indigo-100',
      fg: 'text-indigo-600',
      formula: 'Remaining = Maximum − Allocated. Maximum = adjusted Workdays × 8 × Local rate. Allocated = planned Intrasourcing + Local revenue.',
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
  if (typeof renderBudgetActualRiskChart === 'function') {
    renderBudgetActualRiskChart();
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


function setPerformanceChartText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}


const PERFORMANCE_SUMMARY_TOOLTIP_DATA = new Map();

function performanceSummaryTooltipRows(rows) {
  return `<table class="performance-summary-tooltip__table"><tbody>${rows.map(row => `
    <tr><th>${esc(row.label)}</th><td>${esc(row.value)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</td></tr>
  `).join('')}</tbody></table>`;
}

function setPerformanceSummaryTooltip(key, { title, note = '', rows = [], formula = '', footer = '' } = {}) {
  PERFORMANCE_SUMMARY_TOOLTIP_DATA.set(key, `
    <div class="performance-summary-tooltip__title">${esc(title || '')}</div>
    ${note ? `<div class="performance-summary-tooltip__note">${esc(note)}</div>` : ''}
    ${rows.length ? performanceSummaryTooltipRows(rows) : ''}
    ${formula ? `<div class="performance-summary-tooltip__formula">${esc(formula)}</div>` : ''}
    ${footer ? `<div class="performance-summary-tooltip__footer">${esc(footer)}</div>` : ''}
  `);
}

function getPerformanceSummaryTooltipElement() {
  let tooltip = document.getElementById('performanceSummaryTooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'performanceSummaryTooltip';
  tooltip.className = 'performance-summary-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionPerformanceSummaryTooltip(tooltip, trigger) {
  if (!tooltip || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const margin = 10;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const width = Math.max(280, Math.min(410, viewportWidth - (margin * 2)));
  tooltip.style.width = `${width}px`;
  tooltip.style.left = `${Math.max(margin, Math.min(rect.left, viewportWidth - width - margin))}px`;
  tooltip.style.top = '0px';
  tooltip.classList.add('is-visible');
  const height = tooltip.offsetHeight;
  const below = rect.bottom + 8;
  const top = below + height <= viewportHeight - margin
    ? below
    : Math.max(margin, rect.top - height - 8);
  tooltip.style.top = `${top}px`;
}

function showPerformanceSummaryTooltip(trigger) {
  const key = trigger?.dataset?.performanceSummaryTooltip;
  const html = key ? PERFORMANCE_SUMMARY_TOOLTIP_DATA.get(key) : '';
  if (!html) return;
  const tooltip = getPerformanceSummaryTooltipElement();
  tooltip.innerHTML = html;
  positionPerformanceSummaryTooltip(tooltip, trigger);
}

function hidePerformanceSummaryTooltip() {
  document.getElementById('performanceSummaryTooltip')?.classList.remove('is-visible');
}

function bindPerformanceSummaryTooltips() {
  document.querySelectorAll('[data-performance-summary-tooltip]').forEach(trigger => {
    if (trigger.dataset.performanceSummaryTooltipBound === '1') return;
    trigger.dataset.performanceSummaryTooltipBound = '1';
    trigger.addEventListener('mouseenter', () => showPerformanceSummaryTooltip(trigger));
    trigger.addEventListener('mouseleave', hidePerformanceSummaryTooltip);
    trigger.addEventListener('focus', () => showPerformanceSummaryTooltip(trigger));
    trigger.addEventListener('blur', hidePerformanceSummaryTooltip);
  });
}

function performanceSummaryMonthLabel(row) {
  const year = Number(row?.year);
  const month = Number(row?.month);
  if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
    return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
  }
  return String(row?.label || '').trim();
}

function formatPerformanceChartMoney(value) {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);
  const sign = numeric < 0 ? '-' : '';
  if (absolute >= 1000000) {
    return `${sign}$${(absolute / 1000000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  }
  if (absolute >= 1000) {
    return `${sign}$${(absolute / 1000).toLocaleString('en-US', { maximumFractionDigits: absolute >= 100000 ? 0 : 1 })}K`;
  }
  return `${sign}$${absolute.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatPerformanceChartHours(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const absolute = Math.abs(numeric);
  const sign = numeric < 0 ? '-' : numeric > 0 ? '+' : '';
  if (absolute >= 1000000) {
    return `${sign}${(absolute / 1000000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M h`;
  }
  if (absolute >= 1000) {
    return `${sign}${(absolute / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K h`;
  }
  return `${sign}${absolute.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
}

function performanceChartLegendOptions() {
  return {
    display: true,
    position: 'bottom',
    labels: {
      boxWidth: 9,
      boxHeight: 9,
      usePointStyle: true,
      pointStyle: 'circle',
      color: '#475569',
      font: { size: 10, weight: '600' },
      padding: 18,
    },
  };
}


let assignmentTrendSourceRows = [];

function getAssignmentTrendProjectTypes() {
  if (typeof TEAM_UTILIZATION_PROJECT_TYPES !== 'undefined') {
    return TEAM_UTILIZATION_PROJECT_TYPES;
  }
  return new Set([
    'Training Delivery',
    'Service Delivery - Local PS',
    'Service Delivery - Intrasourcing',
    'Pre - Sales',
  ]);
}

function getAssignmentTrendActualUtilization(rows) {
  const trendRows = Array.isArray(rows) ? rows : [];
  const monthIndex = new Map(
    trendRows.map((row, index) => [`${Number(row.year)}-${Number(row.month)}`, index]),
  );
  const reported = trendRows.map(() => false);
  const projectHours = trendRows.map(() => 0);
  const utilization = trendRows.map(() => null);
  const details = trendRows.map(() => null);
  const projectTypes = getAssignmentTrendProjectTypes();
  const timesheetRows = typeof getVisibleTimesheetRows === 'function'
    ? getVisibleTimesheetRows()
    : (S.timesheetRows || []);

  for (const row of timesheetRows) {
    const parsedMonth = typeof parseMonthlyWorkMonth === 'function'
      ? parseMonthlyWorkMonth(
        row.month ?? row.Month ?? row.month_label ?? row.monthLabel,
      )
      : null;
    if (!parsedMonth) continue;

    const index = monthIndex.get(`${Number(parsedMonth.year)}-${Number(parsedMonth.month)}`);
    if (index === undefined) continue;

    const hours = Number(row.qty ?? row.hours ?? row.quantity);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    // Any valid Time Sheet effort means the month has actually been reported.
    // A reported month can legitimately have 0% project utilization if all
    // recorded effort is non-project work (for example General Admin).
    reported[index] = true;

    const workType = typeof normalizeTimesheetWorkType === 'function'
      ? normalizeTimesheetWorkType(row.workType ?? row.work_type ?? row['Work Type'])
      : String((row.workType ?? row.work_type ?? row['Work Type']) || '').trim();
    if (projectTypes.has(workType)) projectHours[index] += hours;
  }

  const activeEmployees = typeof getActiveEmployees === 'function'
    ? getActiveEmployees()
    : (S.employees || []).filter(employee => employee.active !== 0);
  const annualWorkdays = typeof getDefaultAnnualWorkdays === 'function'
    ? Number(getDefaultAnnualWorkdays()) || 0
    : 0;
  const capacityPerStaff = annualWorkdays / 12;
  const hoursPerDay = typeof TEAM_UTILIZATION_HOURS_PER_DAY !== 'undefined'
    ? Number(TEAM_UTILIZATION_HOURS_PER_DAY) || 8
    : 8;

  trendRows.forEach((row, index) => {
    if (!reported[index]) return;

    const staffCount = activeEmployees.filter(employee => {
      if (typeof isEmployeeUnavailableForEntireMonth !== 'function') return true;
      return !isEmployeeUnavailableForEntireMonth(
        employee.id,
        Number(row.year),
        Number(row.month),
        S.assignments,
      );
    }).length;
    const capacityDays = capacityPerStaff * staffCount;
    const projectDays = projectHours[index] / hoursPerDay;

    utilization[index] = capacityDays > 0
      ? +((projectDays / capacityDays) * 100).toFixed(1)
      : 0;
    details[index] = {
      staffCount,
      capacityDays: +capacityDays.toFixed(2),
      projectHours: +(Number(projectHours[index]) || 0).toFixed(2),
      projectDays: +projectDays.toFixed(2),
      annualWorkdays,
      capacityPerStaff: +capacityPerStaff.toFixed(2),
      hoursPerDay,
    };
  });

  return { utilization, reported, projectHours, details };
}

function refreshAssignmentTrendsFromTimesheet() {
  if (!assignmentTrendSourceRows.length) return;
  renderTrends(assignmentTrendSourceRows);
}

function renderTrends(data) {
  if (S.charts.trends) S.charts.trends.destroy();
  const canvas = document.getElementById('trendsChart');
  if (!canvas) return;

  const sourceRows = Array.isArray(data) ? data : [];
  assignmentTrendSourceRows = sourceRows.map(row => ({ ...row }));
  const actualUtilization = getAssignmentTrendActualUtilization(sourceRows);
  const rows = sourceRows.map((row, index) => ({
    ...row,
    actualUtilization: actualUtilization.utilization[index],
    actualReported: actualUtilization.reported[index],
  }));

  const latestPlan = rows.length ? rows[rows.length - 1] : null;
  const latestPlanLabel = String(latestPlan?.label || '').trim();
  const latestActual = [...rows].reverse().find(row => row.actualReported) || null;
  const latestActualLabel = String(latestActual?.label || '').trim();

  setPerformanceChartText(
    'trendsLatestAssignmentLabel',
    latestPlanLabel ? `Assignments (${latestPlanLabel})` : 'Assignments',
  );
  setPerformanceChartText(
    'trendsLatestAssignments',
    latestPlan ? (Number(latestPlan.assignments) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—',
  );
  setPerformanceChartText(
    'trendsLatestUtilLabel',
    latestActualLabel ? `Actual Utilization % (${latestActualLabel})` : 'Actual Utilization %',
  );
  setPerformanceChartText(
    'trendsLatestUtil',
    latestActual && Number.isFinite(Number(latestActual.actualUtilization))
      ? `${Number(latestActual.actualUtilization).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
      : '—',
  );


  const latestActualIndex = latestActual ? rows.indexOf(latestActual) : -1;
  const latestActualDetail = latestActualIndex >= 0
    ? actualUtilization.details?.[latestActualIndex] || null
    : null;
  setPerformanceChartText(
    'trendsLatestProjectDaysLabel',
    latestActualLabel ? `Project Days (${latestActualLabel})` : 'Project Days',
  );
  setPerformanceChartText(
    'trendsLatestProjectDays',
    latestActualDetail
      ? `${latestActualDetail.projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days`
      : '—',
  );

  if (latestPlan) {
    const monthLabel = performanceSummaryMonthLabel(latestPlan);
    const assignmentCount = Number(latestPlan.assignments) || 0;
    setPerformanceSummaryTooltip('trends-assignments', {
      title: `Assignments · ${monthLabel}`,
      note: 'Planned assignment activity from Resource Assignment.',
      rows: [
        { label: 'Effective assignment rows', value: assignmentCount.toLocaleString('en-US') },
        { label: 'Source', value: 'Resource Assignment' },
      ],
      formula: `Assignments = count of effective Resource Assignment rows in ${monthLabel} after the app's existing assignment/N/A filtering.`,
      footer: 'This is assignment activity, not unique resources or unique projects.',
    });
  } else {
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('trends-assignments');
  }

  if (latestActual) {
    const actualIndex = rows.indexOf(latestActual);
    const detail = actualUtilization.details?.[actualIndex] || null;
    const monthLabel = performanceSummaryMonthLabel(latestActual);
    if (detail) {
      const utilizationValue = Number(latestActual.actualUtilization) || 0;
      setPerformanceSummaryTooltip('trends-utilization', {
        title: `Actual Project Utilization · ${monthLabel}`,
        note: 'Actual delivery comes only from uploaded Time Sheet data. Future months remain blank until a Time Sheet is reported.',
        rows: [
          { label: 'Project Time Sheet hours', value: `${detail.projectHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h`, note: 'Local PS + Intra-Sourcing + Training Delivery + Pre-Sales' },
          { label: 'Project days', value: `${detail.projectDays.toLocaleString('en-US', { maximumFractionDigits: 2 })} days`, note: `${detail.projectHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h ÷ ${detail.hoursPerDay} h/day` },
          { label: 'Available active staff', value: detail.staffCount.toLocaleString('en-US') },
          { label: 'Monthly capacity', value: `${detail.capacityDays.toLocaleString('en-US', { maximumFractionDigits: 2 })} days`, note: `(${detail.annualWorkdays} ÷ 12) × ${detail.staffCount} staff` },
          { label: 'Actual utilization', value: `${utilizationValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%` },
        ],
        formula: `Actual Utilization = ${detail.projectDays.toLocaleString('en-US', { maximumFractionDigits: 2 })} project days ÷ ${detail.capacityDays.toLocaleString('en-US', { maximumFractionDigits: 2 })} capacity days × 100 = ${utilizationValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%.`,
        footer: 'Staff unavailable for the entire month are excluded from monthly capacity using the app’s existing availability rules.',
      });

      setPerformanceSummaryTooltip('trends-project-days', {
        title: `Actual Project Days · ${monthLabel}`,
        note: 'Project Days show the actual project-delivery effort recorded in the uploaded Time Sheet for the latest reported month.',
        rows: [
          { label: 'Project Time Sheet hours', value: `${detail.projectHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h`, note: 'Local PS + Intra-Sourcing + Training Delivery + Pre-Sales' },
          { label: 'Hours per workday', value: `${detail.hoursPerDay} h/day` },
          { label: 'Actual Project Days', value: `${detail.projectDays.toLocaleString('en-US', { maximumFractionDigits: 2 })} days` },
        ],
        formula: `Project Days = ${detail.projectHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} Time Sheet hours ÷ ${detail.hoursPerDay} hours/day = ${detail.projectDays.toLocaleString('en-US', { maximumFractionDigits: 2 })} days.`,
        footer: 'This is the numerator used in the Actual Utilization calculation for the same month.',
      });
    }
  } else {
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('trends-utilization');
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('trends-project-days');
  }
  bindPerformanceSummaryTooltips();

  S.charts.trends = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: rows.map(d => d.label),
      datasets: [
        {
          label: 'Assignments',
          data: rows.map(d => d.assignments),
          borderColor: '#0B63F6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          pointBackgroundColor: '#0B63F6',
          pointBorderColor: '#0B63F6',
          pointHoverBackgroundColor: '#FFFFFF',
          pointHoverBorderColor: '#0B63F6',
          pointBorderWidth: 1.5,
          tension: 0.38,
          borderWidth: 2.25,
          pointRadius: 3.2,
          pointHoverRadius: 5,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'Actual Utilization %',
          data: rows.map(d => d.actualUtilization),
          borderColor: '#0E9F6E',
          backgroundColor: 'transparent',
          pointBackgroundColor: '#0E9F6E',
          pointBorderColor: '#0E9F6E',
          pointHoverBackgroundColor: '#FFFFFF',
          pointHoverBorderColor: '#0E9F6E',
          pointBorderWidth: 1.5,
          tension: 0.38,
          borderWidth: 2.15,
          pointRadius: 3.2,
          pointHoverRadius: 5,
          fill: false,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 520, easing: 'easeOutQuart' },
      layout: { padding: { top: 3, right: 3, bottom: 0, left: 0 } },
      plugins: {
        legend: performanceChartLegendOptions(),
        tooltip: {
          enabled: false,
          external: renderAssignmentTrendsTooltip,
        },
      },
      scales: {
        x: {
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#334155',
            font: { size: 10, weight: '600' },
            maxRotation: 0,
            minRotation: 0,
            padding: 7,
          },
          grid: { color: 'rgba(226, 232, 240, 0.62)', borderDash: [3, 4], drawTicks: false },
        },
        y: {
          position: 'left',
          border: { color: '#E2E8F0' },
          ticks: { color: '#334155', font: { size: 10, weight: '600' }, padding: 7 },
          grid: { color: 'rgba(226, 232, 240, 0.62)', borderDash: [3, 4], drawTicks: false },
        },
        y1: {
          position: 'right',
          border: { color: '#E2E8F0' },
          ticks: { color: '#334155', font: { size: 10, weight: '600' }, padding: 7 },
          grid: { drawOnChartArea: false, drawTicks: false },
        },
      },
    },
  });
}

function getAssignmentBurnSeries() {
  const analysisFiscalYear = getRevenueAnalysisFiscalYear();
  const months = fiscalMonths(analysisFiscalYear);
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
  for (const assignment of getEffectiveFiscalAssignments(analysisFiscalYear, S.matrixAssignments)) {
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
  return performanceChartLegendOptions();
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
  const index = series.lastActualIndex;
  if (index >= 0) {
    const plannedRemaining = Number(series.plannedRemaining[index]) || 0;
    const actualRemaining = Number(series.actualRemaining[index]) || 0;
    const variance = +(actualRemaining - plannedRemaining).toFixed(2);
    const label = series.labels[index] || '';

    setPerformanceChartText('burndownPlannedLabel', label ? `Planned Remaining (${label})` : 'Planned Remaining');
    setPerformanceChartText('burndownPlannedValue', formatPerformanceChartHours(plannedRemaining));
    setPerformanceChartText('burndownActualLabel', label ? `Actual Remaining (${label})` : 'Actual Remaining');
    setPerformanceChartText('burndownActualValue', formatPerformanceChartHours(actualRemaining));
    setPerformanceChartText('burndownVarianceLabel', label ? `Variance (${label})` : 'Variance');
    setPerformanceChartText('burndownVarianceValue', formatPerformanceChartHours(variance));
    setPerformanceChartText(
      'burndownVarianceStatus',
      variance < 0 ? 'Ahead of plan' : variance > 0 ? 'Behind plan' : 'On plan',
    );
  } else {
    setPerformanceChartText('burndownPlannedLabel', 'Planned Remaining');
    setPerformanceChartText('burndownPlannedValue', '—');
    setPerformanceChartText('burndownActualLabel', 'Actual Remaining');
    setPerformanceChartText('burndownActualValue', '—');
    setPerformanceChartText('burndownVarianceLabel', 'Variance');
    setPerformanceChartText('burndownVarianceValue', '—');
    setPerformanceChartText('burndownVarianceStatus', 'No actual month reported');
  }


  if (index >= 0) {
    const label = series.labels[index] || '';
    const plannedRemaining = Number(series.plannedRemaining[index]) || 0;
    const actualRemaining = Number(series.actualRemaining[index]) || 0;
    const cumulativePlanned = Number(series.cumulativePlanned[index]) || 0;
    const cumulativeActual = Number(series.cumulativeActual[index]) || 0;
    const variance = +(actualRemaining - plannedRemaining).toFixed(2);
    const interpretation = variance < 0 ? 'Ahead of plan' : variance > 0 ? 'Behind plan' : 'On plan';

    setPerformanceSummaryTooltip('burndown-planned', {
      title: `Planned Remaining Effort · ${label}`,
      note: 'Planned effort is derived from effective Resource Assignment rows for the selected fiscal year.',
      rows: [
        { label: 'Total FY planned effort', value: burnChartTooltipUnit(series.totalPlannedHours) },
        { label: 'Cumulative planned delivered', value: burnChartTooltipUnit(cumulativePlanned) },
        { label: 'Planned remaining', value: burnChartTooltipUnit(plannedRemaining) },
      ],
      formula: `Planned Remaining = Total FY Planned − Cumulative Planned = ${burnChartTooltipUnit(series.totalPlannedHours)} − ${burnChartTooltipUnit(cumulativePlanned)} = ${burnChartTooltipUnit(plannedRemaining)}.`,
    });

    setPerformanceSummaryTooltip('burndown-actual', {
      title: `Actual Remaining Effort · ${label}`,
      note: 'Actual delivered effort comes from reported Time Sheet hours. Future months are not projected.',
      rows: [
        { label: 'Total FY planned effort', value: burnChartTooltipUnit(series.totalPlannedHours) },
        { label: 'Cumulative actual delivered', value: burnChartTooltipUnit(cumulativeActual) },
        { label: 'Actual remaining', value: burnChartTooltipUnit(actualRemaining) },
      ],
      formula: `Actual Remaining = Total FY Planned − Cumulative Actual = ${burnChartTooltipUnit(series.totalPlannedHours)} − ${burnChartTooltipUnit(cumulativeActual)} = ${burnChartTooltipUnit(actualRemaining)}.`,
      footer: 'This value is shown only through the latest month with actual Time Sheet delivery.',
    });

    setPerformanceSummaryTooltip('burndown-variance', {
      title: `Burndown Variance · ${label}`,
      note: 'Planned effort comes from Resource Assignment. Actual delivered effort comes from Time Sheet hours.',
      rows: [
        { label: 'Total FY planned effort', value: burnChartTooltipUnit(series.totalPlannedHours) },
        { label: 'Cumulative planned effort', value: burnChartTooltipUnit(cumulativePlanned) },
        { label: 'Cumulative actual effort', value: burnChartTooltipUnit(cumulativeActual) },
        { label: 'Planned remaining', value: burnChartTooltipUnit(plannedRemaining), note: 'Total planned − cumulative planned' },
        { label: 'Actual remaining', value: burnChartTooltipUnit(actualRemaining), note: 'Total planned − cumulative actual' },
        { label: 'Variance', value: `${variance > 0 ? '+' : ''}${burnChartTooltipUnit(variance)}`, note: interpretation },
      ],
      formula: `Variance = Actual remaining − Planned remaining = ${burnChartTooltipUnit(actualRemaining)} − ${burnChartTooltipUnit(plannedRemaining)} = ${variance > 0 ? '+' : ''}${burnChartTooltipUnit(variance)}.`,
      footer: variance < 0
        ? 'Negative variance means less work remains than planned at this point, so delivery is ahead of plan.'
        : variance > 0
          ? 'Positive variance means more work remains than planned at this point, so delivery is behind plan.'
          : 'Actual remaining effort matches the planned remaining effort.',
    });
  } else {
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('burndown-planned');
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('burndown-actual');
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('burndown-variance');
  }
  bindPerformanceSummaryTooltips();

  S.charts.burndown = new Chart(element.getContext('2d'), {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Planned remaining',
          data: series.plannedRemaining,
          borderColor: '#0B63F6',
          borderDash: [6, 5],
          backgroundColor: 'transparent',
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#0B63F6',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.18,
          borderWidth: 2,
          pointRadius: 3.4,
          pointHoverRadius: 5,
        },
        {
          label: 'Actual remaining',
          data: series.actualRemaining,
          borderColor: '#F04438',
          backgroundColor: 'transparent',
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#F04438',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.18,
          borderWidth: 2.25,
          pointRadius: 3.8,
          pointHoverRadius: 5.5,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 520, easing: 'easeOutQuart' },
      layout: { padding: { top: 3, right: 2, bottom: 0, left: 0 } },
      plugins: {
        legend: burnChartLegendOptions(),
        tooltip: burnTableTooltipOptions(series, 'burndown'),
      },
      scales: {
        x: {
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#475569',
            font: { size: 9.5, weight: '600' },
            maxRotation: 38,
            minRotation: 32,
            padding: 7,
          },
          grid: { color: 'rgba(226, 232, 240, 0.72)', borderDash: [3, 4], drawTicks: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(series.totalPlannedHours, 1),
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#475569',
            font: { size: 10, weight: '600' },
            padding: 7,
            callback: burnChartAxisUnit,
          },
          grid: { color: 'rgba(226, 232, 240, 0.72)', borderDash: [3, 4], drawTicks: false },
          title: { display: false },
        },
      },
    },
  });
}


function getAssignmentBurnRevenueSeries() {
  const source = typeof getMonthlyPlannedWorkSeries === 'function'
    ? getMonthlyPlannedWorkSeries(getRevenueAnalysisFiscalYear(), S.matrixAssignments)
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
  const analysisFiscalYear = getRevenueAnalysisFiscalYear();
  const months = fiscalMonths(analysisFiscalYear);
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
  const plannedLocal = months.map(() => 0);
  const plannedIntra = months.map(() => 0);
  const actualLocal = months.map(() => 0);
  const actualIntra = months.map(() => 0);
  const plannedUnpricedHours = months.map(() => 0);
  const actualUnpricedHours = months.map(() => 0);
  const actualReported = months.map(() => false);

  for (const assignment of getEffectiveFiscalAssignments(analysisFiscalYear, S.matrixAssignments)) {
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

    const hours = WORK_HOURS_PER_WEEK * (percentage / 100);
    const rateInfo = getMonthlyRevenueRate(
      categoryKey,
      employee,
      getRevenueRateDateForAssignment(assignment),
    );
    if (!rateInfo.eligible) continue;
    if (!rateInfo.hasRate) {
      plannedUnpricedHours[index] += hours;
      continue;
    }

    const revenue = hours * rateInfo.rate;
    plannedRevenue[index] += revenue;
    if (categoryKey === 'serviceDeliveryIntrasourcing') plannedIntra[index] += revenue;
    else plannedLocal[index] += revenue;
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

    const hours = Number(row.qty ?? row.hours ?? row.quantity);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    // A month is considered reported as soon as any valid Time Sheet effort exists
    // for that fiscal month. PS revenue can legitimately be zero when that month has
    // no Local PS / Intra-Sourcing delivery.
    actualReported[index] = true;

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
    if (!rateInfo.eligible) continue;
    if (!rateInfo.hasRate) {
      actualUnpricedHours[index] += hours;
      continue;
    }

    const revenue = hours * rateInfo.rate;
    actualRevenue[index] += revenue;
    if (categoryKey === 'serviceDeliveryIntrasourcing') actualIntra[index] += revenue;
    else actualLocal[index] += revenue;
  }

  const roundMoney = value => +((Number(value) || 0).toFixed(2));
  const roundHours = value => +((Number(value) || 0).toFixed(2));
  const roundedPlannedRevenue = plannedRevenue.map(roundMoney);
  const roundedActualRevenue = actualRevenue.map(roundMoney);
  const roundedPlannedLocal = plannedLocal.map(roundMoney);
  const roundedPlannedIntra = plannedIntra.map(roundMoney);
  const roundedActualLocal = actualLocal.map(roundMoney);
  const roundedActualIntra = actualIntra.map(roundMoney);
  const totalPlannedRevenue = roundMoney(
    roundedPlannedRevenue.reduce((total, value) => total + value, 0),
  );
  const lastActualIndex = actualReported.reduce(
    (latest, reported, index) => reported ? index : latest,
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
    months,
    labels,
    plannedRevenue: roundedPlannedRevenue,
    actualRevenue: roundedActualRevenue,
    plannedLocal: roundedPlannedLocal,
    plannedIntra: roundedPlannedIntra,
    actualLocal: roundedActualLocal,
    actualIntra: roundedActualIntra,
    actualReported,
    plannedUnpricedHours: plannedUnpricedHours.map(roundHours),
    actualUnpricedHours: actualUnpricedHours.map(roundHours),
    cumulativePlanned,
    cumulativeActual,
    totalPlannedRevenue,
    actualToDate: lastActualIndex >= 0 ? Number(cumulativeActual[lastActualIndex]) || 0 : 0,
    lastActualIndex,
  };
}


let revenueAnalyticsActiveTab = 'budget-risk';

function getRevenueAnalyticsActiveTab() {
  return revenueAnalyticsActiveTab === 'contribution-margin'
    ? 'contribution-margin'
    : 'budget-risk';
}

function updateRevenueAnalyticsHeader(tab, fyLabel, latestLabel = '') {
  const title = document.getElementById('budgetActualRiskTitle');
  const subtitle = document.getElementById('budgetActualRiskSubtitle');
  const badge = document.getElementById('budgetActualRiskFyBadge');
  const icon = document.getElementById('revenueAnalyticsIcon');

  if (title) title.textContent = `PS Revenue · ${fyLabel} YTD`;
  if (badge) badge.textContent = fyLabel;

  if (tab === 'contribution-margin') {
    if (subtitle) {
      subtitle.textContent = latestLabel
        ? `Contribution performance through ${latestLabel}: revenue, resource cost basis, profit and margin.`
        : 'Contribution performance across Pre-Sales, Local PS and Intra-Sourcing.';
    }
    if (icon) icon.classList.add('is-contribution-margin');
  } else {
    if (subtitle) {
      subtitle.textContent = `Monthly Local PS + Intra-Sourcing revenue plan, Time Sheet actual${latestLabel ? ` through ${latestLabel}` : ''}, and outstanding revenue exposure.`;
    }
    if (icon) icon.classList.remove('is-contribution-margin');
  }
}

function setRevenueAnalyticsTab(tab) {
  const nextTab = tab === 'contribution-margin' ? 'contribution-margin' : 'budget-risk';
  revenueAnalyticsActiveTab = nextTab;

  const tabConfig = [
    ['budget-risk', 'revenueAnalyticsBudgetTab', 'revenueAnalyticsBudgetPane'],
    ['contribution-margin', 'revenueAnalyticsMarginTab', 'revenueAnalyticsMarginPane'],
  ];

  tabConfig.forEach(([key, tabId, paneId]) => {
    const button = document.getElementById(tabId);
    const pane = document.getElementById(paneId);
    const isActive = key === nextTab;
    if (button) {
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    }
    if (pane) {
      pane.hidden = !isActive;
      pane.classList.toggle('is-active', isActive);
      if (isActive) {
        pane.classList.remove('is-entering');
        // Re-trigger the entrance animation on every tab activation.
        void pane.offsetWidth;
        pane.classList.add('is-entering');
      }
    }
  });

  requestAnimationFrame(() => {
    if (nextTab === 'contribution-margin') {
      if (typeof renderContributionMarginChart === 'function') renderContributionMarginChart();
    } else if (typeof renderBudgetActualRiskChart === 'function') {
      renderBudgetActualRiskChart();
    }
  });
}

function getRevenueAnalysisFiscalYear() {
  return normalizeFiscalYearStart(S.matrixFiscalYear, S.fiscalYear);
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
  const index = series.lastActualIndex;

  if (index >= 0) {
    const label = series.labels[index] || '';
    const actual = Number(series.cumulativeActual[index]) || 0;
    const planned = Number(series.cumulativePlanned[index]) || 0;
    const variance = +(actual - planned).toFixed(2);
    const variancePct = planned > 0 ? (variance / planned) * 100 : null;

    setPerformanceChartText('burnupActualLabel', label ? `Actual (${label})` : 'Actual');
    setPerformanceChartText('burnupActualValue', formatPerformanceChartMoney(actual));
    setPerformanceChartText('burnupPlannedLabel', label ? `Planned (${label})` : 'Planned');
    setPerformanceChartText('burnupPlannedValue', formatPerformanceChartMoney(planned));
    setPerformanceChartText('burnupVarianceValue', formatPerformanceChartMoney(variance));
    setPerformanceChartText(
      'burnupVariancePct',
      variancePct === null ? '—' : `(${variancePct > 0 ? '+' : ''}${variancePct.toLocaleString('en-US', { maximumFractionDigits: 0 })}%)`,
    );
  } else {
    setPerformanceChartText('burnupActualLabel', 'Actual');
    setPerformanceChartText('burnupActualValue', '—');
    setPerformanceChartText('burnupPlannedLabel', 'Planned');
    setPerformanceChartText('burnupPlannedValue', '—');
    setPerformanceChartText('burnupVarianceValue', '—');
    setPerformanceChartText('burnupVariancePct', '—');
  }


  if (index >= 0) {
    const label = series.labels[index] || '';
    const actual = Number(series.cumulativeActual[index]) || 0;
    const planned = Number(series.cumulativePlanned[index]) || 0;
    const variance = +(actual - planned).toFixed(2);
    const variancePct = planned > 0 ? (variance / planned) * 100 : null;
    const sumThrough = values => +(values || []).slice(0, index + 1).reduce(
      (total, value) => total + (Number(value) || 0),
      0,
    ).toFixed(2);
    const actualLocal = sumThrough(series.actualLocal);
    const actualIntra = sumThrough(series.actualIntra);
    const plannedLocal = sumThrough(series.plannedLocal);
    const plannedIntra = sumThrough(series.plannedIntra);
    const actualUnpricedHours = sumThrough(series.actualUnpricedHours);
    const plannedUnpricedHours = sumThrough(series.plannedUnpricedHours);

    setPerformanceSummaryTooltip('burnup-actual', {
      title: `Cumulative Actual Revenue · ${label}`,
      note: 'Actual revenue comes from uploaded Time Sheet delivery for Local PS and Intra-Sourcing, priced with the applicable effective-dated Resource Revenue rate for each matched resource.',
      rows: [
        { label: 'Local PS actual', value: burnupRevenueTooltipUnit(actualLocal) },
        { label: 'Intra-Sourcing actual', value: burnupRevenueTooltipUnit(actualIntra) },
        { label: 'Cumulative actual', value: burnupRevenueTooltipUnit(actual) },
        ...(actualUnpricedHours > 0 ? [{ label: 'Unpriced eligible hours', value: `${actualUnpricedHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`, note: 'Excluded because no matching rate was available' }] : []),
      ],
      formula: 'For each eligible Time Sheet row: Actual revenue = Time Sheet hours × applicable Resource Revenue hourly rate. The displayed value is the cumulative Local PS + Intra-Sourcing revenue through the reported month.',
    });

    setPerformanceSummaryTooltip('burnup-planned', {
      title: `Cumulative Planned Revenue · ${label}`,
      note: 'Planned revenue comes from Resource Assignment for Local PS and Intra-Sourcing.',
      rows: [
        { label: 'Local PS planned', value: burnupRevenueTooltipUnit(plannedLocal) },
        { label: 'Intra-Sourcing planned', value: burnupRevenueTooltipUnit(plannedIntra) },
        { label: 'Cumulative planned', value: burnupRevenueTooltipUnit(planned) },
        ...(plannedUnpricedHours > 0 ? [{ label: 'Unpriced planned hours', value: `${plannedUnpricedHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`, note: 'Excluded because no matching rate was available' }] : []),
      ],
      formula: `For each eligible assignment: Planned revenue = ${Number(WORK_HOURS_PER_WEEK).toLocaleString('en-US', { maximumFractionDigits: 2 })} h/week × allocation % × applicable Resource Revenue hourly rate. The displayed value is cumulative Local PS + Intra-Sourcing planned revenue through ${label}.`,
    });

    setPerformanceSummaryTooltip('burnup-variance', {
      title: `Revenue Variance · ${label}`,
      note: 'Compares cumulative Time Sheet revenue with cumulative Resource Assignment planned revenue at the same reporting point.',
      rows: [
        { label: 'Cumulative actual', value: burnupRevenueTooltipUnit(actual) },
        { label: 'Cumulative planned', value: burnupRevenueTooltipUnit(planned) },
        { label: 'Variance', value: burnupRevenueTooltipUnit(variance) },
        { label: 'Variance %', value: variancePct === null ? '—' : `${variancePct > 0 ? '+' : ''}${variancePct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%` },
      ],
      formula: `Variance = Actual − Planned = ${burnupRevenueTooltipUnit(actual)} − ${burnupRevenueTooltipUnit(planned)} = ${burnupRevenueTooltipUnit(variance)}. Variance % = Variance ÷ Planned × 100${variancePct === null ? '' : ` = ${variancePct > 0 ? '+' : ''}${variancePct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`}.`,
      footer: variance < 0 ? 'Negative variance means actual cumulative revenue is below the plan.' : variance > 0 ? 'Positive variance means actual cumulative revenue is ahead of the plan.' : 'Actual cumulative revenue matches the plan.',
    });
  } else {
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('burnup-actual');
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('burnup-planned');
    PERFORMANCE_SUMMARY_TOOLTIP_DATA.delete('burnup-variance');
  }
  bindPerformanceSummaryTooltips();

  const targetLabelPlugin = {
    id: 'burnupTargetLabel',
    afterDatasetsDraw(chart) {
      const yScale = chart.scales.y;
      const area = chart.chartArea;
      if (!yScale || !area || !Number.isFinite(series.totalPlannedRevenue)) return;
      const y = yScale.getPixelForValue(series.totalPlannedRevenue);
      if (y < area.top - 4 || y > area.bottom + 4) return;
      const label = formatPerformanceChartMoney(series.totalPlannedRevenue);
      const { ctx } = chart;
      ctx.save();
      ctx.font = '700 10px sans-serif';
      const textWidth = ctx.measureText(label).width;
      const width = textWidth + 14;
      const height = 22;
      const x = area.right - width;
      const top = Math.max(area.top + 2, y - height - 5);
      ctx.fillStyle = '#0F2A56';
      const radius = 5;
      ctx.beginPath();
      ctx.roundRect(x, top, width, height, radius);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + width / 2, top + height / 2);
      ctx.restore();
    },
  };

  S.charts.burnup = new Chart(element.getContext('2d'), {
    type: 'line',
    plugins: [targetLabelPlugin],
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Cumulative planned revenue',
          data: series.cumulativePlanned,
          borderColor: '#0B63F6',
          borderDash: [6, 5],
          backgroundColor: 'transparent',
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#0B63F6',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.18,
          borderWidth: 2,
          pointRadius: 3.3,
          pointHoverRadius: 5,
        },
        {
          label: 'Cumulative actual revenue',
          data: series.cumulativeActual,
          borderColor: '#0E9F6E',
          backgroundColor: 'transparent',
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#0E9F6E',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.18,
          borderWidth: 2.35,
          pointRadius: 3.7,
          pointHoverRadius: 5.5,
          spanGaps: false,
        },
        {
          label: 'Total planned revenue',
          data: series.labels.map(() => series.totalPlannedRevenue),
          borderColor: '#2563EB',
          borderDash: [4, 5],
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
      animation: { duration: 520, easing: 'easeOutQuart' },
      layout: { padding: { top: 3, right: 3, bottom: 0, left: 0 } },
      plugins: {
        legend: burnChartLegendOptions(),
        tooltip: burnTableTooltipOptions(series, 'burnup'),
      },
      scales: {
        x: {
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#475569',
            font: { size: 9.5, weight: '600' },
            maxRotation: 38,
            minRotation: 32,
            padding: 7,
          },
          grid: { color: 'rgba(226, 232, 240, 0.68)', borderDash: [3, 4], drawTicks: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: chartMaximum * 1.08,
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#475569',
            font: { size: 10, weight: '600' },
            padding: 7,
            callback: burnupRevenueAxisUnit,
          },
          grid: { color: 'rgba(226, 232, 240, 0.68)', borderDash: [3, 4], drawTicks: false },
          title: { display: false },
        },
      },
    },
  });

  if (typeof renderBudgetActualRiskChart === 'function') {
    renderBudgetActualRiskChart();
  }
}


function formatContributionMarginPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toLocaleString('en-US', {
    minimumFractionDigits: numeric >= 10 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function getContributionMarginSeries() {
  const analysisFiscalYear = getRevenueAnalysisFiscalYear();
  const source = typeof getMonthlyPlannedWorkSeries === 'function'
    ? getMonthlyPlannedWorkSeries(analysisFiscalYear, S.matrixAssignments)
    : { rows: [] };
  const rows = source.rows || [];
  const categories = ['preSales', 'serviceDeliveryLocalPs', 'serviceDeliveryIntrasourcing'];
  const categoryLabels = {
    preSales: 'Pre-Sales',
    serviceDeliveryLocalPs: 'Local PS',
    serviceDeliveryIntrasourcing: 'Intra-Sourcing',
  };
  const roundMoney = value => +((Number(value) || 0).toFixed(2));
  const sumCategoryRevenue = (monthlySource, key) => categories.reduce(
    (total, category) => total + (Number(monthlySource?.revenue?.[category]) || 0),
    0,
  );

  const labels = rows.map(row => row.label);
  const resourceCost = [];
  const revenue = [];
  const profit = [];
  const marginPercent = [];
  const reported = [];
  const breakdown = categories.reduce((acc, key) => {
    acc[key] = { cost: [], revenue: [] };
    return acc;
  }, {});

  let lastReportedIndex = -1;
  rows.forEach((row, index) => {
    const monthCost = roundMoney(sumCategoryRevenue(row.planned));
    const monthRevenue = roundMoney(sumCategoryRevenue(row.actual));
    const isReported = Boolean(row.actual?.hasData);

    categories.forEach(key => {
      breakdown[key].cost.push(roundMoney(Number(row.planned?.revenue?.[key]) || 0));
      breakdown[key].revenue.push(roundMoney(Number(row.actual?.revenue?.[key]) || 0));
    });

    resourceCost.push(monthCost);
    revenue.push(isReported ? monthRevenue : null);
    profit.push(isReported ? roundMoney(monthRevenue - monthCost) : null);
    marginPercent.push(isReported && monthCost > 0 ? +(((monthRevenue / monthCost) * 100).toFixed(1)) : null);
    reported.push(isReported);
    if (isReported) lastReportedIndex = index;
  });

  const ytdSliceEnd = lastReportedIndex >= 0 ? lastReportedIndex + 1 : 0;
  const sumMoney = values => roundMoney((values || []).slice(0, ytdSliceEnd).reduce((t, v) => t + (Number(v) || 0), 0));
  const ytdRevenue = sumMoney(revenue.map(value => value == null ? 0 : value));
  const ytdResourceCost = sumMoney(resourceCost);
  const ytdProfit = roundMoney(ytdRevenue - ytdResourceCost);
  const ytdContributionMargin = ytdResourceCost > 0 ? +(((ytdRevenue / ytdResourceCost) * 100).toFixed(1)) : null;

  return {
    fiscalYear: analysisFiscalYear,
    labels,
    revenue,
    resourceCost,
    profit,
    marginPercent,
    reported,
    lastReportedIndex,
    ytdRevenue,
    ytdResourceCost,
    ytdProfit,
    ytdContributionMargin,
    reportedMonths: reported.filter(Boolean).length,
    latestLabel: lastReportedIndex >= 0 ? labels[lastReportedIndex] : 'No reported month',
    breakdown,
    categoryLabels,
  };
}

const CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA = new Map();

function contributionMarginTooltipRows(rows) {
  return `<table class="revenue-budget-risk-kpi-tooltip__table"><tbody>${rows.map(row => `
    <tr><th>${esc(row.label)}</th><td>${esc(row.value)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</td></tr>
  `).join('')}</tbody></table>`;
}

function buildContributionMarginKpiTooltipData(series) {
  CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.clear();
  const fyLabel = fiscalYearDisplayLabel(series.fiscalYear);
  const basisNote = 'Revenue uses actual Time Sheet revenue for Pre-Sales, Local PS, and Intra-Sourcing. Resource Cost Basis uses the assigned resource value for the same categories from Resource Assignment and the applicable effective-dated Resource Revenue rate.';

  CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.set('revenue-ytd', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Revenue YTD · ${esc(fyLabel)}</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">${esc(basisNote)}</div>
    ${contributionMarginTooltipRows([
      { label: 'Revenue YTD', value: formatBudgetRiskMoney(series.ytdRevenue, { exact: true }) },
      { label: 'Latest reported month', value: series.latestLabel },
      { label: 'Reported months', value: `${series.reportedMonths} of ${series.labels.length}` },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Revenue YTD = sum of actual Time Sheet revenue for reported fiscal months (Pre-Sales + Local PS + Intra-Sourcing).</div>
  `);

  CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.set('resource-cost-ytd', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Resource Cost Basis YTD · ${esc(fyLabel)}</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">${esc(basisNote)}</div>
    ${contributionMarginTooltipRows([
      { label: 'Resource Cost Basis YTD', value: formatBudgetRiskMoney(series.ytdResourceCost, { exact: true }) },
      { label: 'Latest reported month', value: series.latestLabel },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Resource Cost Basis YTD = sum of assigned resource value through the latest reported month for Pre-Sales + Local PS + Intra-Sourcing.</div>
  `);

  CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.set('profit-ytd', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Profit YTD · ${esc(fyLabel)}</div>
    ${contributionMarginTooltipRows([
      { label: 'Revenue YTD', value: formatBudgetRiskMoney(series.ytdRevenue, { exact: true }) },
      { label: 'Resource Cost Basis YTD', value: formatBudgetRiskMoney(series.ytdResourceCost, { exact: true }) },
      { label: 'Profit YTD', value: formatBudgetRiskMoney(series.ytdProfit, { exact: true }) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Profit = Revenue − Resource Cost Basis.</div>
  `);

  CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.set('margin-ytd', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Contribution Margin · ${esc(fyLabel)}</div>
    ${contributionMarginTooltipRows([
      { label: 'Revenue YTD', value: formatBudgetRiskMoney(series.ytdRevenue, { exact: true }) },
      { label: 'Resource Cost Basis YTD', value: formatBudgetRiskMoney(series.ytdResourceCost, { exact: true }) },
      { label: 'Contribution Margin', value: formatContributionMarginPercent(series.ytdContributionMargin) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Per your requested formula: Contribution Margin = Revenue ÷ Resource Cost Basis × 100.</div>
  `);

  CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.set('reported-scope', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Reported Scope · ${esc(fyLabel)}</div>
    ${contributionMarginTooltipRows([
      { label: 'Categories included', value: 'Pre-Sales · Local PS · Intra-Sourcing' },
      { label: 'Latest reported month', value: series.latestLabel },
      { label: 'Reported months', value: `${series.reportedMonths} of ${series.labels.length}` },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">The section follows the global Matrix FY selector. Reported months are determined from Time Sheet data within the selected fiscal year.</div>
  `);
}

function getContributionMarginKpiTooltipElement() {
  let tooltip = document.getElementById('contributionMarginKpiTooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'contributionMarginKpiTooltip';
  tooltip.className = 'revenue-budget-risk-kpi-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltip);
  return tooltip;
}

function showContributionMarginKpiTooltip(trigger) {
  const key = trigger?.dataset?.contributionMarginKpiTooltip;
  const html = key ? CONTRIBUTION_MARGIN_KPI_TOOLTIP_DATA.get(key) : '';
  if (!html) return;
  const tooltip = getContributionMarginKpiTooltipElement();
  tooltip.innerHTML = html;
  positionBudgetRiskKpiTooltip(tooltip, trigger);
}

function hideContributionMarginKpiTooltip() {
  document.getElementById('contributionMarginKpiTooltip')?.classList.remove('is-visible');
}

function bindContributionMarginKpiTooltips(container) {
  container?.querySelectorAll('[data-contribution-margin-kpi-tooltip]').forEach(trigger => {
    trigger.addEventListener('mouseenter', () => showContributionMarginKpiTooltip(trigger));
    trigger.addEventListener('mouseleave', hideContributionMarginKpiTooltip);
    trigger.addEventListener('focus', () => showContributionMarginKpiTooltip(trigger));
    trigger.addEventListener('blur', hideContributionMarginKpiTooltip);
  });
}

function renderContributionMarginSummary(series) {
  const container = document.getElementById('contributionMarginSummary');
  if (!container) return;
  const profitClass = series.ytdProfit >= 0 ? 'is-favorable' : 'is-positive';
  container.innerHTML = `
    <div class="revenue-budget-risk-kpi contribution-margin-kpi contribution-margin-kpi--revenue" data-contribution-margin-kpi-tooltip="revenue-ytd" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Revenue YTD <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.ytdRevenue))}</div>
      <div class="revenue-budget-risk-kpi__meta">Actual revenue through ${esc(series.latestLabel)}</div>
    </div>
    <div class="revenue-budget-risk-kpi contribution-margin-kpi contribution-margin-kpi--cost" data-contribution-margin-kpi-tooltip="resource-cost-ytd" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Resource Cost Basis YTD <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.ytdResourceCost))}</div>
      <div class="revenue-budget-risk-kpi__meta">Assigned resource value through ${esc(series.latestLabel)}</div>
    </div>
    <div class="revenue-budget-risk-kpi contribution-margin-kpi contribution-margin-kpi--profit revenue-budget-risk-kpi--risk ${profitClass}" data-contribution-margin-kpi-tooltip="profit-ytd" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Profit YTD <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.ytdProfit))}</div>
      <div class="revenue-budget-risk-kpi__meta">Revenue − Resource Cost Basis</div>
    </div>
    <div class="revenue-budget-risk-kpi contribution-margin-kpi contribution-margin-kpi--margin revenue-budget-risk-kpi--attainment" data-contribution-margin-kpi-tooltip="margin-ytd" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Contribution Margin <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatContributionMarginPercent(series.ytdContributionMargin))}</div>
      <div class="revenue-budget-risk-kpi__meta">Revenue ÷ Resource Cost Basis × 100</div>
    </div>
    <div class="revenue-budget-risk-kpi contribution-margin-kpi contribution-margin-kpi--scope" data-contribution-margin-kpi-tooltip="reported-scope" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Reported Scope <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(series.latestLabel)}</div>
      <div class="revenue-budget-risk-kpi__meta">${series.reportedMonths} of ${series.labels.length} months reported</div>
    </div>
  `;

  buildContributionMarginKpiTooltipData(series);
  bindContributionMarginKpiTooltips(container);
}

function renderContributionMarginStatus(series) {
  const element = document.getElementById('contributionMarginStatus');
  if (!element) return;
  if (series.lastReportedIndex < 0) {
    element.innerHTML = '<span class="revenue-budget-risk-status__period"><strong>No Time Sheet revenue reported for the selected fiscal year yet</strong></span>';
    return;
  }
  const profitClass = series.ytdProfit >= 0 ? 'is-favorable' : 'is-at-risk';
  const profitLabel = series.ytdProfit >= 0 ? 'YTD profit' : 'YTD loss';
  element.innerHTML = `
    <span class="revenue-budget-risk-status__period">Revenue through <strong>${esc(series.latestLabel)}</strong></span>
    <span class="revenue-budget-risk-status__divider" aria-hidden="true"></span>
    <span class="revenue-budget-risk-status__variance ${profitClass}"><strong>${esc(formatBudgetRiskMoney(Math.abs(series.ytdProfit)))}</strong> ${esc(profitLabel)}</span>
    <span class="revenue-budget-risk-status__divider" aria-hidden="true"></span>
    <span><strong>${esc(formatContributionMarginPercent(series.ytdContributionMargin))}</strong> contribution margin</span>
  `;
}

function toggleContributionMarginTable(forceExpanded) {
  const panel = document.getElementById('contributionMarginTablePanel');
  const button = document.getElementById('contributionMarginTableToggle');
  if (!panel || !button) return;
  const currentlyExpanded = button.getAttribute('aria-expanded') === 'true';
  const expanded = typeof forceExpanded === 'boolean' ? forceExpanded : !currentlyExpanded;
  panel.hidden = !expanded;
  button.setAttribute('aria-expanded', String(expanded));
  const meta = button.querySelector('.revenue-budget-risk-table-toggle__meta');
  if (meta) meta.textContent = expanded ? 'Collapse' : 'Expand';
}

function renderContributionMarginTable(series) {
  const body = document.getElementById('contributionMarginTableBody');
  if (!body) return;
  body.innerHTML = series.labels.map((label, index) => `
    <tr class="${index === series.lastReportedIndex ? 'is-latest-reported' : ''}">
      <td>${esc(label)}</td>
      <td>${esc(formatBudgetRiskMoney(series.resourceCost[index]))}</td>
      <td class="${series.reported[index] ? '' : 'is-not-reported'}">${series.reported[index] ? esc(formatBudgetRiskMoney(series.revenue[index])) : '—'}</td>
      <td class="${series.reported[index] ? (Number(series.profit[index]) >= 0 ? 'risk-favorable' : 'risk-positive') : 'is-not-reported'}">${series.reported[index] ? esc(formatBudgetRiskMoney(series.profit[index])) : '—'}</td>
      <td class="${series.reported[index] ? '' : 'is-not-reported'}">${series.reported[index] ? esc(formatContributionMarginPercent(series.marginPercent[index])) : '—'}</td>
    </tr>
  `).join('');
}

function renderContributionMarginBasis(series) {
  const element = document.getElementById('contributionMarginBasis');
  if (!element) return;
  element.innerHTML = `
    <strong>Calculation basis:</strong>
    Revenue = actual Time Sheet revenue for <strong>Pre-Sales + Local PS + Intra-Sourcing</strong>.
    Resource Cost Basis = assigned resource value for the same categories from Resource Assignment
    (${Number(WORK_HOURS_PER_WEEK).toLocaleString('en-US', { maximumFractionDigits: 2 })} hours/week × allocation % × applicable hourly rate).
    Profit = Revenue − Resource Cost Basis.
    Contribution Margin = Revenue ÷ Resource Cost Basis × 100 (per your requested formula).
    The section follows the global Matrix FY selector.
  `;
}

function getContributionMarginTooltipElement(chart) {
  const element = getOverviewChartTooltipElement(chart, 'contribution-margin');
  element.classList.add('revenue-budget-risk-tooltip');
  return element;
}

function renderContributionMarginTooltip(context, series) {
  const { chart, tooltip } = context;
  const element = getContributionMarginTooltipElement(chart);
  const index = tooltip?.dataPoints?.[0]?.dataIndex;

  if (!tooltip || tooltip.opacity === 0 || index === undefined) {
    hideOverviewChartTooltip(element);
    return;
  }

  const rows = [
    { label: 'Resource Cost Basis', value: formatBudgetRiskMoney(series.resourceCost[index], { exact: true }), emphasis: true },
    { label: '↳ Pre-Sales cost basis', value: formatBudgetRiskMoney(series.breakdown.preSales.cost[index], { exact: true }) },
    { label: '↳ Local PS cost basis', value: formatBudgetRiskMoney(series.breakdown.serviceDeliveryLocalPs.cost[index], { exact: true }) },
    { label: '↳ Intra-Sourcing cost basis', value: formatBudgetRiskMoney(series.breakdown.serviceDeliveryIntrasourcing.cost[index], { exact: true }) },
    { label: 'Revenue', value: series.reported[index] ? formatBudgetRiskMoney(series.revenue[index], { exact: true }) : 'Not reported', emphasis: true },
    { label: '↳ Pre-Sales revenue', value: series.reported[index] ? formatBudgetRiskMoney(series.breakdown.preSales.revenue[index], { exact: true }) : '—' },
    { label: '↳ Local PS revenue', value: series.reported[index] ? formatBudgetRiskMoney(series.breakdown.serviceDeliveryLocalPs.revenue[index], { exact: true }) : '—' },
    { label: '↳ Intra-Sourcing revenue', value: series.reported[index] ? formatBudgetRiskMoney(series.breakdown.serviceDeliveryIntrasourcing.revenue[index], { exact: true }) : '—' },
    { label: 'Profit', value: series.reported[index] ? formatBudgetRiskMoney(series.profit[index], { exact: true }) : 'Not reported', risk: true },
    { label: 'Contribution Margin', value: series.reported[index] ? formatContributionMarginPercent(series.marginPercent[index]) : 'Not reported', emphasis: true },
  ];

  element.innerHTML = `
    <div class="dashboard-chart-table-tooltip__title">${esc(series.labels[index])}</div>
    <table class="dashboard-chart-tooltip-table"><tbody>
      ${rows.map(row => `
        <tr class="${row.emphasis ? 'is-emphasis' : ''} ${row.risk ? (series.reported[index] && Number(series.profit[index]) >= 0 ? 'is-risk-favorable' : 'is-risk-positive') : ''}">
          <th>${esc(row.label)}</th>
          <td>${esc(row.value)}</td>
        </tr>
      `).join('')}
    </tbody></table>
  `;

  positionOverviewChartTooltip(element, chart, tooltip);
}

function renderContributionMarginChart() {
  if (getRevenueAnalyticsActiveTab() !== 'contribution-margin') return;
  const element = document.getElementById('contributionMarginChart');
  if (!element || typeof Chart === 'undefined') return;

  if (S.charts.contributionMargin) {
    S.charts.contributionMargin.destroy();
    S.charts.contributionMargin = null;
  }

  const series = getContributionMarginSeries();
  const fyLabel = fiscalYearDisplayLabel(series.fiscalYear);
  updateRevenueAnalyticsHeader('contribution-margin', fyLabel, series.latestLabel);

  renderContributionMarginSummary(series);
  renderContributionMarginStatus(series);
  renderContributionMarginTable(series);
  renderContributionMarginBasis(series);

  const monetaryMax = Math.max(1,
    ...series.resourceCost,
    ...series.revenue.map(value => Number(value) || 0),
    ...series.profit.map(value => Math.abs(Number(value) || 0)),
  );
  const monetaryMin = Math.min(0, ...series.profit.map(value => Number(value) || 0));
  const percentMax = Math.max(125, ...series.marginPercent.map(value => Number(value) || 0));

  const futurePeriodPlugin = {
    id: 'contributionMarginFuturePeriod',
    beforeDatasetsDraw(chart) {
      if (series.lastReportedIndex < 0 || series.lastReportedIndex >= series.labels.length - 1) return;
      const xScale = chart.scales.x;
      const chartArea = chart.chartArea;
      if (!xScale || !chartArea) return;
      const currentX = xScale.getPixelForTick(series.lastReportedIndex);
      const nextX = xScale.getPixelForTick(series.lastReportedIndex + 1);
      const startX = (currentX + nextX) / 2;
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
      ctx.fillRect(startX, chartArea.top, chartArea.right - startX, chartArea.bottom - chartArea.top);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, chartArea.top);
      ctx.lineTo(startX, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Future / not reported', Math.min(startX + 8, chartArea.right - 92), chartArea.top + 13);
      ctx.restore();
    },
  };

  S.charts.contributionMargin = new Chart(element.getContext('2d'), {
    type: 'bar',
    plugins: [futurePeriodPlugin],
    data: {
      labels: series.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Resource cost basis',
          data: series.resourceCost,
          yAxisID: 'yMoney',
          backgroundColor: 'rgba(37, 99, 235, 0.72)',
          borderColor: '#1D4ED8',
          borderWidth: 0,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 18,
          categoryPercentage: 0.74,
          barPercentage: 0.88,
          order: 4,
        },
        {
          type: 'bar',
          label: 'Revenue',
          data: series.revenue,
          yAxisID: 'yMoney',
          backgroundColor: 'rgba(16, 185, 129, 0.78)',
          borderColor: '#059669',
          borderWidth: 0,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 18,
          categoryPercentage: 0.74,
          barPercentage: 0.88,
          order: 4,
        },
        {
          type: 'line',
          label: 'Profit',
          data: series.profit,
          yAxisID: 'yMoney',
          borderColor: '#6EE7B7',
          backgroundColor: 'transparent',
          borderWidth: 2.4,
          tension: 0.24,
          pointRadius: 2.7,
          pointHoverRadius: 4.7,
          pointBackgroundColor: '#ECFDF5',
          pointBorderColor: '#10B981',
          pointBorderWidth: 1.7,
          spanGaps: false,
          order: 2,
        },
        {
          type: 'line',
          label: 'Contribution margin',
          data: series.marginPercent,
          yAxisID: 'yPercent',
          borderColor: '#7C3AED',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          borderWidth: 2,
          tension: 0.24,
          pointRadius: 2.4,
          pointHoverRadius: 4.4,
          pointBackgroundColor: '#FFFFFF',
          pointBorderWidth: 1.5,
          spanGaps: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 10, right: 8, bottom: 0, left: 4 } },
      animation: { duration: 720, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 9,
            boxHeight: 9,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 18,
            color: '#475569',
            font: { size: 10, weight: '600' },
          },
        },
        tooltip: {
          enabled: false,
          external: context => renderContributionMarginTooltip(context, series),
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#475569',
            font: { size: 10, weight: '600' },
            maxRotation: 0,
            minRotation: 0,
            padding: 8,
          },
        },
        yMoney: {
          position: 'left',
          beginAtZero: true,
          suggestedMin: monetaryMin < 0 ? monetaryMin * 1.18 : 0,
          suggestedMax: monetaryMax * 1.16,
          border: { display: false },
          grid: {
            color: context => Number(context.tick.value) === 0 ? '#CBD5E1' : '#EEF2F7',
            lineWidth: context => Number(context.tick.value) === 0 ? 1.2 : 1,
          },
          ticks: {
            color: '#64748B',
            font: { size: 9 },
            padding: 6,
            callback: burnupRevenueAxisUnit,
          },
          title: {
            display: true,
            text: 'Revenue / cost / profit (USD)',
            color: '#94A3B8',
            font: { size: 10, weight: '600' },
          },
        },
        yPercent: {
          position: 'right',
          beginAtZero: true,
          suggestedMax: percentMax,
          border: { display: false },
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#64748B',
            font: { size: 9 },
            padding: 6,
            callback: value => `${Number(value) || 0}%`,
          },
          title: {
            display: true,
            text: 'Contribution margin (%)',
            color: '#94A3B8',
            font: { size: 10, weight: '600' },
          },
        },
      },
    },
  });
}


function formatBudgetRiskMoney(value, { exact = false } = {}) {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);
  const formatted = absolute.toLocaleString('en-US', {
    minimumFractionDigits: exact ? 2 : 0,
    maximumFractionDigits: exact ? 2 : 0,
  });
  return `${numeric < 0 ? '-' : ''}$${formatted}`;
}

function formatBudgetRiskPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toLocaleString('en-US', {
    minimumFractionDigits: numeric >= 10 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function getBudgetActualRiskSeries() {
  const source = getAssignmentBurnRevenueSeries();
  const roundMoney = value => +((Number(value) || 0).toFixed(2));
  const sumMoney = values => roundMoney((values || []).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  ));
  const budget = source.plannedRevenue.map(roundMoney);
  const actual = source.actualRevenue.map(roundMoney);
  const reported = Array.isArray(source.actualReported)
    ? source.actualReported.map(Boolean)
    : source.labels.map((_label, index) => index <= source.lastActualIndex);

  const risk = budget.map((value, index) => (
    roundMoney(value - (reported[index] ? actual[index] : 0))
  ));

  let cumulativeBudgetValue = 0;
  let cumulativeActualValue = 0;
  const cumulativeBudget = [];
  const cumulativeActual = [];
  const cumulativeRisk = [];

  budget.forEach((value, index) => {
    cumulativeBudgetValue += value;
    if (reported[index]) cumulativeActualValue += actual[index];
    cumulativeBudget.push(roundMoney(cumulativeBudgetValue));
    cumulativeActual.push(roundMoney(cumulativeActualValue));
    cumulativeRisk.push(roundMoney(cumulativeBudgetValue - cumulativeActualValue));
  });

  const lastReportedIndex = reported.reduce(
    (latest, isReported, index) => isReported ? index : latest,
    -1,
  );
  const ytdBudget = lastReportedIndex >= 0 ? cumulativeBudget[lastReportedIndex] : 0;
  const ytdActual = lastReportedIndex >= 0 ? cumulativeActual[lastReportedIndex] : 0;
  const ytdRisk = roundMoney(ytdBudget - ytdActual);
  const ytdVariance = roundMoney(ytdActual - ytdBudget);

  const committedSummary = typeof getCommittedTargetSummary === 'function'
    ? getCommittedTargetSummary()
    : { intrasourcing: 0, local: 0, total: 0 };
  const committedTarget = roundMoney(committedSummary.total);
  const targetAttainment = committedTarget > 0
    ? (ytdActual / committedTarget) * 100
    : null;
  const budgetCoverage = committedTarget > 0
    ? (source.totalPlannedRevenue / committedTarget) * 100
    : null;

  const savedIntra = typeof getCommittedTargetRecord === 'function'
    ? getCommittedTargetRecord('intrasourcing')
    : null;
  const savedLocal = typeof getCommittedTargetRecord === 'function'
    ? getCommittedTargetRecord('local')
    : null;

  const ytdSliceEnd = lastReportedIndex >= 0 ? lastReportedIndex + 1 : 0;
  const ytdActualLocal = sumMoney((source.actualLocal || []).slice(0, ytdSliceEnd));
  const ytdActualIntra = sumMoney((source.actualIntra || []).slice(0, ytdSliceEnd));
  const fyPlannedLocal = sumMoney(source.plannedLocal || []);
  const fyPlannedIntra = sumMoney(source.plannedIntra || []);

  return {
    ...source,
    budget,
    actual,
    reported,
    risk,
    cumulativeBudget,
    cumulativeActual,
    cumulativeRisk,
    lastReportedIndex,
    reportedMonths: reported.filter(Boolean).length,
    ytdBudget: roundMoney(ytdBudget),
    ytdActual: roundMoney(ytdActual),
    ytdRisk,
    ytdVariance,
    ytdActualLocal,
    ytdActualIntra,
    fyPlannedLocal,
    fyPlannedIntra,
    committedTarget,
    committedBreakdown: {
      intrasourcing: roundMoney(committedSummary.intrasourcing),
      local: roundMoney(committedSummary.local),
      intrasourcingSource: savedIntra?.updated_at ? 'Saved committed target' : 'Calculated from current assignment/rate data',
      localSource: savedLocal?.updated_at ? 'Saved committed target' : 'Calculated from current assignment/rate data',
    },
    targetAttainment,
    budgetCoverage,
    fyBudget: roundMoney(source.totalPlannedRevenue),
  };
}

const BUDGET_RISK_KPI_TOOLTIP_DATA = new Map();

function budgetRiskKpiTooltipRows(rows) {
  return `<table class="revenue-budget-risk-kpi-tooltip__table"><tbody>${rows.map(row => `
    <tr><th>${esc(row.label)}</th><td>${esc(row.value)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</td></tr>
  `).join('')}</tbody></table>`;
}

function buildBudgetRiskKpiTooltipData(series) {
  BUDGET_RISK_KPI_TOOLTIP_DATA.clear();
  const fyLabel = fiscalYearDisplayLabel(getRevenueAnalysisFiscalYear());
  const latestLabel = series.lastReportedIndex >= 0
    ? series.labels[series.lastReportedIndex]
    : 'No reported month';
  const plannedUnpriced = (series.plannedUnpricedHours || []).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  );
  const actualUnpriced = series.lastReportedIndex >= 0
    ? (series.actualUnpricedHours || []).slice(0, series.lastReportedIndex + 1).reduce(
      (total, value) => total + (Number(value) || 0),
      0,
    )
    : 0;
  const budgetRateNote = plannedUnpriced > 0
    ? `${plannedUnpriced.toLocaleString('en-US', { maximumFractionDigits: 1 })} eligible planned hours currently have no matching rate and are excluded.`
    : 'All eligible planned hours with available rates are included.';
  const actualRateNote = actualUnpriced > 0
    ? `${actualUnpriced.toLocaleString('en-US', { maximumFractionDigits: 1 })} eligible YTD Time Sheet hours currently have no matching rate and are excluded.`
    : 'All eligible YTD Time Sheet hours with available rates are included.';

  BUDGET_RISK_KPI_TOOLTIP_DATA.set('fy-budget', `
    <div class="revenue-budget-risk-kpi-tooltip__title">FY Budget Plan · ${esc(fyLabel)}</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">Derived from the current Local PS and Intra-Sourcing Resource Assignment plan and the applicable effective-dated Resource Revenue rates.</div>
    ${budgetRiskKpiTooltipRows([
      { label: 'Local PS plan', value: formatBudgetRiskMoney(series.fyPlannedLocal, { exact: true }) },
      { label: 'Intra-Sourcing plan', value: formatBudgetRiskMoney(series.fyPlannedIntra, { exact: true }) },
      { label: 'FY Budget Plan', value: formatBudgetRiskMoney(series.fyBudget, { exact: true }) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Monthly revenue = ${Number(WORK_HOURS_PER_WEEK).toLocaleString('en-US', { maximumFractionDigits: 2 })} hours/week × allocation % × applicable hourly rate. FY Budget Plan = sum of all fiscal-month Local PS + Intra-Sourcing planned revenue.</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">${esc(budgetRateNote)}</div>
  `);

  BUDGET_RISK_KPI_TOOLTIP_DATA.set('committed-target', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Committed Target · ${esc(fyLabel)}</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">Uses the same values as the dashboard Committed Target KPI. Local Pipeline Target is not included in this total.</div>
    ${budgetRiskKpiTooltipRows([
      {
        label: 'Intra-Sourcing target',
        value: formatBudgetRiskMoney(series.committedBreakdown.intrasourcing, { exact: true }),
        note: series.committedBreakdown.intrasourcingSource,
      },
      {
        label: 'Local PS target',
        value: formatBudgetRiskMoney(series.committedBreakdown.local, { exact: true }),
        note: series.committedBreakdown.localSource,
      },
      { label: 'Committed Target', value: formatBudgetRiskMoney(series.committedTarget, { exact: true }) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Committed Target = Intra-Sourcing Target + Local PS Target.</div>
  `);

  BUDGET_RISK_KPI_TOOLTIP_DATA.set('actual-ytd', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Actual YTD · through ${esc(latestLabel)}</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">Derived from uploaded Time Sheet rows classified as Local PS or Intra-Sourcing, priced with the applicable effective-dated Resource Revenue rate for the matched resource.</div>
    ${budgetRiskKpiTooltipRows([
      { label: 'Local PS actual', value: formatBudgetRiskMoney(series.ytdActualLocal, { exact: true }) },
      { label: 'Intra-Sourcing actual', value: formatBudgetRiskMoney(series.ytdActualIntra, { exact: true }) },
      { label: 'Actual YTD', value: formatBudgetRiskMoney(series.ytdActual, { exact: true }) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">Actual revenue = Time Sheet hours × applicable hourly rate. Actual YTD = sum of reported fiscal months through ${esc(latestLabel)}.</div>
    <div class="revenue-budget-risk-kpi-tooltip__note">${esc(actualRateNote)}</div>
  `);

  BUDGET_RISK_KPI_TOOLTIP_DATA.set('ytd-risk', `
    <div class="revenue-budget-risk-kpi-tooltip__title">YTD Risk · through ${esc(latestLabel)}</div>
    ${budgetRiskKpiTooltipRows([
      { label: 'YTD Budget', value: formatBudgetRiskMoney(series.ytdBudget, { exact: true }) },
      { label: 'Actual YTD', value: formatBudgetRiskMoney(series.ytdActual, { exact: true }) },
      { label: 'YTD Risk', value: formatBudgetRiskMoney(series.ytdRisk, { exact: true }) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">YTD Risk = cumulative Budget through the latest reported Time Sheet month − Actual YTD. A negative value means Actual is ahead of Budget.</div>
  `);

  const attainmentFormula = series.committedTarget > 0
    ? `${formatBudgetRiskMoney(series.ytdActual, { exact: true })} ÷ ${formatBudgetRiskMoney(series.committedTarget, { exact: true })} × 100 = ${formatBudgetRiskPercent(series.targetAttainment)}`
    : 'Target Attainment is unavailable because the Committed Target is zero.';
  BUDGET_RISK_KPI_TOOLTIP_DATA.set('target-attainment', `
    <div class="revenue-budget-risk-kpi-tooltip__title">Target Attainment · ${esc(fyLabel)}</div>
    ${budgetRiskKpiTooltipRows([
      { label: 'Actual YTD', value: formatBudgetRiskMoney(series.ytdActual, { exact: true }) },
      { label: 'Committed Target', value: formatBudgetRiskMoney(series.committedTarget, { exact: true }) },
      { label: 'Target Attainment', value: formatBudgetRiskPercent(series.targetAttainment) },
    ])}
    <div class="revenue-budget-risk-kpi-tooltip__formula">${esc(attainmentFormula)}</div>
  `);
}

function getBudgetRiskKpiTooltipElement() {
  let tooltip = document.getElementById('budgetRiskKpiTooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'budgetRiskKpiTooltip';
  tooltip.className = 'revenue-budget-risk-kpi-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionBudgetRiskKpiTooltip(tooltip, trigger) {
  if (!tooltip || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const margin = 10;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const width = Math.max(240, Math.min(390, viewportWidth - (margin * 2)));
  tooltip.style.width = `${width}px`;
  tooltip.style.left = `${Math.max(margin, Math.min(rect.left, viewportWidth - width - margin))}px`;
  tooltip.style.top = '0px';
  tooltip.classList.add('is-visible');
  const tooltipHeight = tooltip.offsetHeight;
  const preferredTop = rect.bottom + 8;
  const top = preferredTop + tooltipHeight <= viewportHeight - margin
    ? preferredTop
    : Math.max(margin, rect.top - tooltipHeight - 8);
  tooltip.style.top = `${top}px`;
}

function showBudgetRiskKpiTooltip(trigger) {
  const key = trigger?.dataset?.budgetRiskKpiTooltip;
  const html = key ? BUDGET_RISK_KPI_TOOLTIP_DATA.get(key) : '';
  if (!html) return;
  const tooltip = getBudgetRiskKpiTooltipElement();
  tooltip.innerHTML = html;
  positionBudgetRiskKpiTooltip(tooltip, trigger);
}

function hideBudgetRiskKpiTooltip() {
  document.getElementById('budgetRiskKpiTooltip')?.classList.remove('is-visible');
}

function bindBudgetRiskKpiTooltips(container) {
  container?.querySelectorAll('[data-budget-risk-kpi-tooltip]').forEach(trigger => {
    trigger.addEventListener('mouseenter', () => showBudgetRiskKpiTooltip(trigger));
    trigger.addEventListener('mouseleave', hideBudgetRiskKpiTooltip);
    trigger.addEventListener('focus', () => showBudgetRiskKpiTooltip(trigger));
    trigger.addEventListener('blur', hideBudgetRiskKpiTooltip);
  });
}

function renderBudgetRiskSummary(series) {
  const container = document.getElementById('budgetActualRiskSummary');
  if (!container) return;

  const latestLabel = series.lastReportedIndex >= 0
    ? series.labels[series.lastReportedIndex]
    : 'No Time Sheet month reported';
  const riskClass = series.ytdRisk <= 0 ? 'is-favorable' : 'is-positive';
  const riskMeta = series.lastReportedIndex >= 0
    ? `Through ${latestLabel} · Budget − Actual`
    : 'No reported actual revenue yet';
  const targetMeta = series.committedTarget > 0
    ? 'Intra-Sourcing + Local PS target'
    : 'No committed revenue target available';
  const budgetCoverageMeta = series.committedTarget > 0
    ? `${formatBudgetRiskPercent(series.budgetCoverage)} of committed target covered by the current assignment plan`
    : 'Local PS + Intra-Sourcing assignment plan';

  container.innerHTML = `
    <div class="revenue-budget-risk-kpi" data-budget-risk-kpi-tooltip="fy-budget" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">FY Budget Plan <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.fyBudget))}</div>
      <div class="revenue-budget-risk-kpi__meta">${esc(budgetCoverageMeta)}</div>
    </div>
    <div class="revenue-budget-risk-kpi" data-budget-risk-kpi-tooltip="committed-target" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Committed Target <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.committedTarget))}</div>
      <div class="revenue-budget-risk-kpi__meta">${esc(targetMeta)}</div>
    </div>
    <div class="revenue-budget-risk-kpi revenue-budget-risk-kpi--actual" data-budget-risk-kpi-tooltip="actual-ytd" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Actual YTD <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.ytdActual))}</div>
      <div class="revenue-budget-risk-kpi__meta">${esc(series.lastReportedIndex >= 0 ? `Time Sheet revenue through ${latestLabel}` : latestLabel)}</div>
    </div>
    <div class="revenue-budget-risk-kpi revenue-budget-risk-kpi--risk ${riskClass}" data-budget-risk-kpi-tooltip="ytd-risk" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">YTD Risk <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskMoney(series.ytdRisk))}</div>
      <div class="revenue-budget-risk-kpi__meta">${esc(riskMeta)}</div>
    </div>
    <div class="revenue-budget-risk-kpi revenue-budget-risk-kpi--attainment" data-budget-risk-kpi-tooltip="target-attainment" tabindex="0">
      <div class="revenue-budget-risk-kpi__label">Target Attainment <span class="revenue-budget-risk-kpi__info" aria-hidden="true">i</span></div>
      <div class="revenue-budget-risk-kpi__value">${esc(formatBudgetRiskPercent(series.targetAttainment))}</div>
      <div class="revenue-budget-risk-kpi__meta">Actual YTD ÷ Committed Target</div>
    </div>
  `;

  buildBudgetRiskKpiTooltipData(series);
  bindBudgetRiskKpiTooltips(container);
}

function renderBudgetRiskStatus(series) {
  const element = document.getElementById('budgetActualRiskStatus');
  if (!element) return;

  const latestLabel = series.lastReportedIndex >= 0
    ? series.labels[series.lastReportedIndex]
    : 'No Time Sheet month reported';
  const varianceClass = series.ytdVariance >= 0 ? 'is-favorable' : 'is-at-risk';
  const varianceLabel = series.ytdVariance >= 0 ? 'ahead of YTD budget' : 'behind YTD budget';
  const targetText = series.committedTarget > 0
    ? `${formatBudgetRiskPercent(series.targetAttainment)} target attainment`
    : 'Committed target unavailable';

  if (series.lastReportedIndex < 0) {
    element.innerHTML = `
      <span class="revenue-budget-risk-status__period"><strong>No Time Sheet actual revenue reported for this fiscal year yet</strong></span>
      <span class="revenue-budget-risk-status__divider" aria-hidden="true"></span>
      <span>${esc(targetText)}</span>
    `;
    return;
  }

  element.innerHTML = `
    <span class="revenue-budget-risk-status__period">Actual through <strong>${esc(latestLabel)}</strong></span>
    <span class="revenue-budget-risk-status__divider" aria-hidden="true"></span>
    <span class="revenue-budget-risk-status__variance ${varianceClass}"><strong>${esc(formatBudgetRiskMoney(Math.abs(series.ytdVariance)))}</strong> ${esc(varianceLabel)}</span>
    <span class="revenue-budget-risk-status__divider" aria-hidden="true"></span>
    <span>${esc(targetText)}</span>
  `;
}

function toggleBudgetRiskTable(forceExpanded) {
  const panel = document.getElementById('budgetActualRiskTablePanel');
  const button = document.getElementById('budgetActualRiskTableToggle');
  if (!panel || !button) return;

  const currentlyExpanded = button.getAttribute('aria-expanded') === 'true';
  const expanded = typeof forceExpanded === 'boolean' ? forceExpanded : !currentlyExpanded;
  panel.hidden = !expanded;
  button.setAttribute('aria-expanded', String(expanded));
  const meta = button.querySelector('.revenue-budget-risk-table-toggle__meta');
  if (meta) meta.textContent = expanded ? 'Collapse' : 'Expand';
}

function budgetRiskValueClass(value) {
  return Number(value) <= 0 ? 'risk-favorable' : 'risk-positive';
}

function renderBudgetRiskTable(series) {
  const body = document.getElementById('budgetActualRiskTableBody');
  if (!body) return;

  body.innerHTML = series.labels.map((label, index) => {
    const reported = series.reported[index];
    const risk = series.risk[index];
    const cumulativeRisk = series.cumulativeRisk[index];
    const rowClass = index === series.lastReportedIndex ? 'is-latest-reported' : '';
    return `
      <tr class="${rowClass}">
        <td>${esc(label)}</td>
        <td>${esc(formatBudgetRiskMoney(series.budget[index]))}</td>
        <td class="${reported ? '' : 'is-not-reported'}">${reported ? esc(formatBudgetRiskMoney(series.actual[index])) : '—'}</td>
        <td class="${budgetRiskValueClass(risk)}">${esc(formatBudgetRiskMoney(risk))}</td>
        <td>${esc(formatBudgetRiskMoney(series.cumulativeBudget[index]))}</td>
        <td>${esc(formatBudgetRiskMoney(series.cumulativeActual[index]))}</td>
        <td class="${budgetRiskValueClass(cumulativeRisk)}">${esc(formatBudgetRiskMoney(cumulativeRisk))}</td>
      </tr>
    `;
  }).join('');
}

function renderBudgetRiskBasis(series) {
  const element = document.getElementById('budgetActualRiskBasis');
  if (!element) return;

  const unpricedPlanned = (series.plannedUnpricedHours || []).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  );
  const unpricedActual = (series.actualUnpricedHours || []).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  );
  const unpricedNote = unpricedPlanned > 0 || unpricedActual > 0
    ? ` <strong>Rate warning:</strong> ${(+unpricedPlanned.toFixed(1)).toLocaleString('en-US')} planned hours and ${(+unpricedActual.toFixed(1)).toLocaleString('en-US')} actual hours could not be priced because a matching Resource Revenue rate was unavailable.`
    : '';

  element.innerHTML = `
    <strong>Calculation basis:</strong>
    Budget = Local PS + Intra-Sourcing Resource Assignment revenue
    (${Number(WORK_HOURS_PER_WEEK).toLocaleString('en-US', { maximumFractionDigits: 2 })} hours/week × allocation % × applicable Resource Revenue hourly rate).
    Actual = Local PS + Intra-Sourcing Time Sheet hours × applicable rate.
    Risk = Budget − Actual; for a future/unreported month, Actual is treated as 0 so the month's full planned revenue remains outstanding.
    Cumulative lines are running totals from April to March.${unpricedNote}
  `;
}

function getBudgetRiskTooltipElement(chart) {
  const element = getOverviewChartTooltipElement(chart, 'budget-risk');
  element.classList.add('revenue-budget-risk-tooltip');
  return element;
}

function renderBudgetRiskTooltip(context, series) {
  const { chart, tooltip } = context;
  const element = getBudgetRiskTooltipElement(chart);
  const index = tooltip?.dataPoints?.[0]?.dataIndex;

  if (!tooltip || tooltip.opacity === 0 || index === undefined) {
    hideOverviewChartTooltip(element);
    return;
  }

  const reported = series.reported[index];
  const risk = series.risk[index];
  const cumulativeRisk = series.cumulativeRisk[index];
  const plannedUnpriced = Number(series.plannedUnpricedHours?.[index]) || 0;
  const actualUnpriced = Number(series.actualUnpricedHours?.[index]) || 0;

  const rows = [
    { label: 'Budget', value: formatBudgetRiskMoney(series.budget[index], { exact: true }), emphasis: true },
    { label: '↳ Local PS plan', value: formatBudgetRiskMoney(series.plannedLocal?.[index], { exact: true }) },
    { label: '↳ Intra-Sourcing plan', value: formatBudgetRiskMoney(series.plannedIntra?.[index], { exact: true }) },
    { label: 'Actual', value: reported ? formatBudgetRiskMoney(series.actual[index], { exact: true }) : 'Not reported', emphasis: true },
    { label: '↳ Local PS actual', value: reported ? formatBudgetRiskMoney(series.actualLocal?.[index], { exact: true }) : '—' },
    { label: '↳ Intra-Sourcing actual', value: reported ? formatBudgetRiskMoney(series.actualIntra?.[index], { exact: true }) : '—' },
    { label: reported ? 'Risk = Budget − Actual' : 'Risk / outstanding', value: formatBudgetRiskMoney(risk, { exact: true }), risk: true },
    { label: 'Cumulative Budget', value: formatBudgetRiskMoney(series.cumulativeBudget[index], { exact: true }), emphasis: true },
    { label: 'Cumulative Actual', value: formatBudgetRiskMoney(series.cumulativeActual[index], { exact: true }), emphasis: true },
    { label: 'Cumulative Risk', value: formatBudgetRiskMoney(cumulativeRisk, { exact: true }), risk: true },
  ];

  if (plannedUnpriced > 0) {
    rows.push({ label: 'Unpriced planned hours', value: `${plannedUnpriced.toLocaleString('en-US', { maximumFractionDigits: 1 })}h` });
  }
  if (actualUnpriced > 0) {
    rows.push({ label: 'Unpriced actual hours', value: `${actualUnpriced.toLocaleString('en-US', { maximumFractionDigits: 1 })}h` });
  }

  element.innerHTML = `
    <div class="dashboard-chart-table-tooltip__title">${esc(series.labels[index])}</div>
    <table class="dashboard-chart-tooltip-table">
      <tbody>
        ${rows.map(row => `
          <tr class="${row.emphasis ? 'is-emphasis' : ''} ${row.risk ? (Number(row.value?.replace?.(/[^0-9.-]/g, '')) <= 0 ? 'is-risk-favorable' : 'is-risk-positive') : ''}">
            <th>${esc(row.label)}</th>
            <td>${esc(row.value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  positionOverviewChartTooltip(element, chart, tooltip);
}

function renderBudgetActualRiskChart() {
  if (getRevenueAnalyticsActiveTab() === 'contribution-margin') {
    if (typeof renderContributionMarginChart === 'function') renderContributionMarginChart();
    return;
  }
  const element = document.getElementById('budgetActualRiskChart');
  if (!element || typeof Chart === 'undefined') return;

  if (S.charts.budgetActualRisk) {
    S.charts.budgetActualRisk.destroy();
    S.charts.budgetActualRisk = null;
  }

  const series = getBudgetActualRiskSeries();
  const fyLabel = fiscalYearDisplayLabel(getRevenueAnalysisFiscalYear());
  const latestLabel = series.lastReportedIndex >= 0
    ? series.labels[series.lastReportedIndex]
    : 'no reported Time Sheet month';

  updateRevenueAnalyticsHeader('budget-risk', fyLabel, latestLabel);

  renderBudgetRiskSummary(series);
  renderBudgetRiskStatus(series);
  renderBudgetRiskTable(series);
  renderBudgetRiskBasis(series);

  const monthlyMin = Math.min(0, ...series.risk);
  const monthlyMax = Math.max(
    1,
    ...series.budget,
    ...series.actual,
    ...series.risk.map(value => Math.abs(value)),
  );
  const cumulativeMin = Math.min(0, ...series.cumulativeRisk);
  const cumulativeMax = Math.max(
    1,
    ...series.cumulativeBudget,
    ...series.cumulativeActual,
    ...series.cumulativeRisk.map(value => Math.abs(value)),
    series.committedTarget,
  );

  const riskColors = series.risk.map((value, index) => {
    if (!series.reported[index]) return 'rgba(245, 158, 11, 0.34)';
    return Number(value) <= 0 ? 'rgba(16, 185, 129, 0.72)' : 'rgba(245, 158, 11, 0.78)';
  });
  const riskBorderColors = series.risk.map((value, index) => {
    if (!series.reported[index]) return 'rgba(217, 119, 6, 0.55)';
    return Number(value) <= 0 ? '#059669' : '#D97706';
  });
  const cumulativeActualChart = series.cumulativeActual.map((value, index) => (
    series.lastReportedIndex >= 0 && index <= series.lastReportedIndex ? value : null
  ));

  const futurePeriodPlugin = {
    id: 'budgetRiskFuturePeriod',
    beforeDatasetsDraw(chart) {
      if (series.lastReportedIndex < 0 || series.lastReportedIndex >= series.labels.length - 1) return;
      const xScale = chart.scales.x;
      const chartArea = chart.chartArea;
      if (!xScale || !chartArea) return;
      const currentX = xScale.getPixelForTick(series.lastReportedIndex);
      const nextX = xScale.getPixelForTick(series.lastReportedIndex + 1);
      const startX = (currentX + nextX) / 2;
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
      ctx.fillRect(startX, chartArea.top, chartArea.right - startX, chartArea.bottom - chartArea.top);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, chartArea.top);
      ctx.lineTo(startX, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Future / not reported', Math.min(startX + 8, chartArea.right - 92), chartArea.top + 13);
      ctx.restore();
    },
  };

  S.charts.budgetActualRisk = new Chart(element.getContext('2d'), {
    type: 'bar',
    plugins: [futurePeriodPlugin],
    data: {
      labels: series.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Actual',
          data: series.actual.map((value, index) => series.reported[index] ? value : null),
          yAxisID: 'yMonthly',
          backgroundColor: 'rgba(5, 150, 105, 0.82)',
          borderColor: '#047857',
          borderWidth: 0,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 20,
          categoryPercentage: 0.72,
          barPercentage: 0.88,
          order: 4,
        },
        {
          type: 'bar',
          label: 'Budget',
          data: series.budget,
          yAxisID: 'yMonthly',
          backgroundColor: 'rgba(59, 130, 246, 0.78)',
          borderColor: '#2563EB',
          borderWidth: 0,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 20,
          categoryPercentage: 0.72,
          barPercentage: 0.88,
          order: 4,
        },
        {
          type: 'bar',
          label: 'Risk / exposure',
          data: series.risk,
          yAxisID: 'yMonthly',
          backgroundColor: riskColors,
          borderColor: riskBorderColors,
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 20,
          categoryPercentage: 0.72,
          barPercentage: 0.88,
          order: 4,
        },
        {
          type: 'line',
          label: 'Cumulative Budget',
          data: series.cumulativeBudget,
          yAxisID: 'yCumulative',
          borderColor: '#1D4ED8',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.24,
          pointRadius: 2.2,
          pointHoverRadius: 4.2,
          pointBackgroundColor: '#FFFFFF',
          pointBorderWidth: 1.7,
          order: 2,
        },
        {
          type: 'line',
          label: 'Cumulative Actual',
          data: cumulativeActualChart,
          yAxisID: 'yCumulative',
          borderColor: '#047857',
          backgroundColor: 'transparent',
          borderWidth: 2.8,
          tension: 0.24,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#FFFFFF',
          pointBorderWidth: 2,
          spanGaps: false,
          order: 1,
        },
        {
          type: 'line',
          label: 'Cumulative Risk',
          data: series.cumulativeRisk,
          yAxisID: 'yCumulative',
          borderColor: '#B45309',
          backgroundColor: 'transparent',
          borderWidth: 1.8,
          borderDash: [2, 4],
          tension: 0.24,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: '#FFFFFF',
          pointBorderWidth: 1.5,
          order: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 10, right: 8, bottom: 0, left: 4 } },
      animation: { duration: 450 },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 9,
            boxHeight: 9,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 18,
            color: '#475569',
            font: { size: 10, weight: '600' },
          },
        },
        tooltip: {
          enabled: false,
          external: context => renderBudgetRiskTooltip(context, series),
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          border: { color: '#E2E8F0' },
          ticks: {
            color: '#475569',
            font: { size: 10, weight: '600' },
            maxRotation: 0,
            minRotation: 0,
            padding: 8,
          },
        },
        yMonthly: {
          position: 'left',
          beginAtZero: true,
          suggestedMin: monthlyMin < 0 ? monthlyMin * 1.16 : 0,
          suggestedMax: monthlyMax * 1.16,
          border: { display: false },
          grid: {
            color: context => Number(context.tick.value) === 0 ? '#CBD5E1' : '#EEF2F7',
            lineWidth: context => Number(context.tick.value) === 0 ? 1.2 : 1,
          },
          ticks: {
            color: '#64748B',
            font: { size: 9 },
            padding: 6,
            callback: burnupRevenueAxisUnit,
          },
          title: {
            display: true,
            text: 'Monthly revenue (USD)',
            color: '#94A3B8',
            font: { size: 10, weight: '600' },
          },
        },
        yCumulative: {
          position: 'right',
          beginAtZero: true,
          suggestedMin: cumulativeMin < 0 ? cumulativeMin * 1.1 : 0,
          suggestedMax: cumulativeMax * 1.08,
          border: { display: false },
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#64748B',
            font: { size: 9 },
            padding: 6,
            callback: burnupRevenueAxisUnit,
          },
          title: {
            display: true,
            text: 'Cumulative revenue (USD)',
            color: '#94A3B8',
            font: { size: 10, weight: '600' },
          },
        },
      },
    },
  });
}

