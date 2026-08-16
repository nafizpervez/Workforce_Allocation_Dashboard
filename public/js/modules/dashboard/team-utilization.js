/* Workforce Allocation Dashboard — PS Team Utilization */

const TEAM_UTILIZATION_FY_PROJECT_TARGET = 65;
const TEAM_UTILIZATION_HOURS_PER_DAY = 8;
const TEAM_UTILIZATION_PROJECT_TYPES = new Set([
  'Training Delivery',
  'Service Delivery - Local PS',
  'Service Delivery - Intrasourcing',
  'Pre - Sales',
]);
const TEAM_UTILIZATION_BILLABLE_TYPES = new Set([
  'Service Delivery - Local PS',
  'Service Delivery - Intrasourcing',
]);

const TEAM_UTILIZATION_TOOLTIP_DATA = new Map();
let teamUtilizationTooltipListenersReady = false;
let teamUtilizationTooltipHideTimer = null;
let teamUtilizationTooltipActiveTrigger = null;
let teamUtilizationSelectedFiscalYear = null;
let teamUtilizationSelectedMonthKey = null;

function teamUtilizationFormatHours(value) {
  return `${(Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}h`;
}

function teamUtilizationActualTypeBreakdown(rows, members) {
  const memberKeys = new Set((members || []).map(personIdentityKey));
  const labels = [
    'Service Delivery - Intrasourcing',
    'Service Delivery - Local PS',
    'Pre - Sales',
    'Training Delivery',
  ];
  const result = Object.fromEntries(labels.map(label => [label, 0]));
  for (const row of rows || []) {
    if (!memberKeys.has(personIdentityKey(row.worker))) continue;
    const type = normalizeTimesheetWorkType(row.workType) || row.workType;
    if (!Object.prototype.hasOwnProperty.call(result, type)) continue;
    result[type] += Number(row.qty) || 0;
  }
  return result;
}

function teamUtilizationDefaultMonthlyCapacityPerStaff() {
  return (Number(getDefaultAnnualWorkdays()) || 0) / 12;
}

function teamUtilizationMonthlyTeamCapacity(staffCount) {
  return teamUtilizationDefaultMonthlyCapacityPerStaff() * Math.max(0, Number(staffCount) || 0);
}

function teamUtilizationYtdTeamCapacity(staffCount, monthCount) {
  return teamUtilizationMonthlyTeamCapacity(staffCount) * Math.max(0, Number(monthCount) || 0);
}

function teamUtilizationMemberBasis(members, monthRows, ytdRows) {
  const monthHours = teamUtilizationWorkerHours(monthRows);
  const ytdHours = teamUtilizationWorkerHours(ytdRows);
  return (members || []).map(worker => {
    const month = monthHours.get(worker) || { local: 0, intra: 0 };
    const ytd = ytdHours.get(worker) || { local: 0, intra: 0 };
    const usedMonth = (month.local || 0) > 0 || (month.intra || 0) > 0;
    const employee = teamUtilizationEmployeeByWorker(worker);
    return {
      worker,
      designation: employee?.designation || '',
      localHours: usedMonth ? month.local : ytd.local,
      intraHours: usedMonth ? month.intra : ytd.intra,
      basis: usedMonth ? 'Reporting month' : 'YTD fallback',
    };
  });
}

function teamUtilizationTooltipRows(rows, columns = 2) {
  return `<table class="team-utilization-tooltip__table team-utilization-tooltip__table--${columns}">${rows.join('')}</table>`;
}

function teamUtilizationTooltipTitle(title, subtitle = '') {
  return `<div class="team-utilization-tooltip__title">${esc(title)}</div>${subtitle ? `<div class="team-utilization-tooltip__subtitle">${esc(subtitle)}</div>` : ''}`;
}

function teamUtilizationBuildTooltipData(tone, stats, reportMonth, nextMonth) {
  const monthLabel = `${teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true)} ${reportMonth.year}`;
  const defaultAnnualWorkdays = Number(getDefaultAnnualWorkdays()) || 0;
  const monthlyCapacityPerStaff = defaultAnnualWorkdays / 12;
  const capacityTotal = stats.monthCapacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const capacityRows = [
    `<tr><th>DEFAULT_ANNUAL_WORKDAYS</th><td>${defaultAnnualWorkdays.toLocaleString('en-US')} days<small>Root config.js</small></td></tr>`,
    `<tr><th>Monthly capacity / staff</th><td>${monthlyCapacityPerStaff.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12 months</small></td></tr>`,
    `<tr><th>Total Staff</th><td>${stats.staffCount}<small>Current reporting team</small></td></tr>`,
    `<tr><th>Monthly team capacity</th><td>${capacityTotal} days<small>(${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12) × ${stats.staffCount}</small></td></tr>`,
  ];

  const staffRows = stats.memberBasis.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <th>${esc(item.worker)}</th>
      <td>${esc(item.designation || '—')}</td>
      <td>${esc(item.basis)}</td>
      <td>${teamUtilizationFormatHours(item.localHours)}</td>
      <td>${teamUtilizationFormatHours(item.intraHours)}</td>
    </tr>`);
  const teamLabel = tone === 'local' ? 'Local PS Team' : 'Intra-Sourcing PS Team';
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:staff`, `
    ${teamUtilizationTooltipTitle('Total Staff — Resource List', `${monthLabel} · ${stats.staffCount} resources · ${teamLabel}`)}
    <div class="team-utilization-tooltip__note">Every row below is included in the displayed Total Staff count. Team membership is based on dominant Local PS vs Intra-Sourcing delivery hours for the reporting month; YTD is used when the selected month has no Local/Intra delivery hours.</div>
    <table class="team-utilization-tooltip__table team-utilization-tooltip__table--staff">
      <thead>
        <tr>
          <th>#</th>
          <th>Resource</th>
          <th>Designation</th>
          <th>Basis</th>
          <th>Local PS</th>
          <th>Intra-Sourcing</th>
        </tr>
      </thead>
      <tbody>${staffRows.join('')}</tbody>
    </table>
    <div class="team-utilization-tooltip__formula">Count of resource rows = <strong>${stats.staffCount}</strong> = Total Staff</div>`);

  const billableTypeRows = [
    ['Service Delivery - Local PS', stats.monthTypeBreakdown['Service Delivery - Local PS']],
    ['Service Delivery - Intrasourcing', stats.monthTypeBreakdown['Service Delivery - Intrasourcing']],
  ].map(([label, hours]) => `
    <tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${teamUtilizationFormatHours(hours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY}h/day = ${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`);
  const billableDays = stats.monthBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:billable-days`, `
    ${teamUtilizationTooltipTitle('Total Billable Days', monthLabel)}
    <div class="team-utilization-tooltip__note">Billable work includes Local PS and Intra-Sourcing Time Sheet hours only.</div>
    ${teamUtilizationTooltipRows(billableTypeRows)}
    <div class="team-utilization-tooltip__formula">(${teamUtilizationFormatHours(stats.monthBillableHours)}) ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} hours/day = <strong>${teamUtilizationFormatDays(billableDays)} billable days</strong></div>`);

  const projectTypeRows = [
    'Service Delivery - Local PS',
    'Service Delivery - Intrasourcing',
    'Pre - Sales',
    'Training Delivery',
  ].map(label => {
    const hours = stats.monthTypeBreakdown[label] || 0;
    return `<tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`;
  });
  const projectDays = stats.monthProjectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:project-days`, `
    ${teamUtilizationTooltipTitle('Total Project Days', monthLabel)}
    <div class="team-utilization-tooltip__note">Project work includes Local PS, Intra-Sourcing, Pre-Sales and Training Delivery Time Sheet hours.</div>
    ${teamUtilizationTooltipRows(projectTypeRows)}
    <div class="team-utilization-tooltip__formula">(${teamUtilizationFormatHours(stats.monthProjectHours)}) ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} hours/day = <strong>${teamUtilizationFormatDays(projectDays)} project days</strong></div>`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:billable-utilization`, `
    ${teamUtilizationTooltipTitle('Billable Utilization', monthLabel)}
    ${teamUtilizationTooltipRows(capacityRows)}
    <div class="team-utilization-tooltip__formula">Monthly team capacity = (${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12) × ${stats.staffCount} = <strong>${capacityTotal} days</strong></div>
    <div class="team-utilization-tooltip__formula">${billableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} billable days ÷ ${capacityTotal} days × 100 = <strong>${teamUtilizationFormatPercent(stats.monthBillablePercent)}</strong></div>`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:project-utilization`, `
    ${teamUtilizationTooltipTitle('Project Utilization', monthLabel)}
    ${teamUtilizationTooltipRows(capacityRows)}
    <div class="team-utilization-tooltip__formula">Monthly team capacity = (${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12) × ${stats.staffCount} = <strong>${capacityTotal} days</strong></div>
    <div class="team-utilization-tooltip__formula">${projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} project days ÷ ${capacityTotal} days × 100 = <strong>${teamUtilizationFormatPercent(stats.monthProjectPercent)}</strong></div>`);

  const ytdStart = stats.ytdMonths?.[0];
  const ytdEnd = stats.ytdMonths?.[stats.ytdMonths.length - 1];
  const ytdPeriodLabel = ytdStart && ytdEnd
    ? `${teamUtilizationMonthLabel(ytdStart.y, ytdStart.m, true)} ${ytdStart.y} – ${teamUtilizationMonthLabel(ytdEnd.y, ytdEnd.m, true)} ${ytdEnd.y}`
    : `${fiscalYearDisplayLabel(S.matrixFiscalYear)} YTD`;
  const ytdMonthCount = (stats.ytdMonths || []).length;
  const ytdCapacityTotal = stats.ytdCapacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const ytdCapacityRows = [
    `<tr><th>DEFAULT_ANNUAL_WORKDAYS</th><td>${defaultAnnualWorkdays.toLocaleString('en-US')} days<small>Root config.js</small></td></tr>`,
    `<tr><th>Monthly capacity / staff</th><td>${monthlyCapacityPerStaff.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12 months</small></td></tr>`,
    `<tr><th>Total Staff</th><td>${stats.staffCount}</td></tr>`,
    `<tr><th>YTD months</th><td>${ytdMonthCount}</td></tr>`,
    `<tr><th>YTD team capacity</th><td>${ytdCapacityTotal} days<small>(${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12) × ${stats.staffCount} × ${ytdMonthCount}</small></td></tr>`,
  ];
  const ytdBillableDays = stats.ytdBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdProjectDays = stats.ytdProjectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdBillableRows = [
    ['Service Delivery - Local PS', stats.ytdTypeBreakdown['Service Delivery - Local PS']],
    ['Service Delivery - Intrasourcing', stats.ytdTypeBreakdown['Service Delivery - Intrasourcing']],
  ].map(([label, hours]) => `
    <tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`);
  const ytdProjectRows = [
    'Service Delivery - Local PS',
    'Service Delivery - Intrasourcing',
    'Pre - Sales',
    'Training Delivery',
  ].map(label => {
    const hours = stats.ytdTypeBreakdown[label] || 0;
    return `<tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`;
  });

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:ytd-billable-utilization`, `
    ${teamUtilizationTooltipTitle('Billable Utilization — YTD', ytdPeriodLabel)}
    <div class="team-utilization-tooltip__note">YTD billable work includes Local PS and Intra-Sourcing Time Sheet hours from the fiscal-year start through the reporting month.</div>
    ${teamUtilizationTooltipRows(ytdBillableRows)}
    <div class="team-utilization-tooltip__note">Available capacity by month for the same reporting team:</div>
    ${teamUtilizationTooltipRows(ytdCapacityRows)}
    <div class="team-utilization-tooltip__formula">Billable days = ${teamUtilizationFormatHours(stats.ytdBillableHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${ytdBillableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
    <div class="team-utilization-tooltip__formula">${ytdBillableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} billable days ÷ ${ytdCapacityTotal} available days × 100 = <strong>${teamUtilizationFormatPercent(stats.ytdBillablePercent)}</strong></div>`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:ytd-project-utilization`, `
    ${teamUtilizationTooltipTitle('Project Utilization — YTD', ytdPeriodLabel)}
    <div class="team-utilization-tooltip__note">YTD project work includes Local PS, Intra-Sourcing, Pre-Sales and Training Delivery Time Sheet hours.</div>
    ${teamUtilizationTooltipRows(ytdProjectRows)}
    <div class="team-utilization-tooltip__note">Available capacity by month for the same reporting team:</div>
    ${teamUtilizationTooltipRows(ytdCapacityRows)}
    <div class="team-utilization-tooltip__formula">Project days = ${teamUtilizationFormatHours(stats.ytdProjectHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${ytdProjectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
    <div class="team-utilization-tooltip__formula">${ytdProjectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} project days ÷ ${ytdCapacityTotal} available days × 100 = <strong>${teamUtilizationFormatPercent(stats.ytdProjectPercent)}</strong></div>`);

  const nextActual = stats.nextMonthDetails;
  const nextActualLabel = nextMonth
    ? `${teamUtilizationMonthLabel(nextMonth.y, nextMonth.m, true)} ${nextMonth.y}`
    : 'Next fiscal month';
  const nextTypeRows = [
    'Service Delivery - Local PS',
    'Service Delivery - Intrasourcing',
    'Pre - Sales',
    'Training Delivery',
  ].map(label => {
    const hours = nextActual?.typeBreakdown?.[label] || 0;
    return `<tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`;
  });
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:next-month-project-utilization`, `
    ${teamUtilizationTooltipTitle('Next Month Project Utilization — Time Sheet', nextActualLabel)}
    <div class="team-utilization-tooltip__note">This value uses Time Sheet actuals only. Project work includes Local PS, Intra-Sourcing, Pre-Sales and Training Delivery for the same reporting-team resources.</div>
    ${nextActual?.hasActual ? teamUtilizationTooltipRows(nextTypeRows) : '<div class="team-utilization-tooltip__note">No Time Sheet actuals are available for this next month, so the value is NA.</div>'}
    ${nextActual?.hasActual ? `<div class="team-utilization-tooltip__formula">Project days = ${teamUtilizationFormatHours(nextActual.projectHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${nextActual.projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
    <div class="team-utilization-tooltip__formula">${nextActual.projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} project days ÷ ${nextActual.capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} team-capacity days × 100 = <strong>${teamUtilizationFormatPercent(nextActual.percent)}</strong></div>` : ''}`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:fy-target`, `
    ${teamUtilizationTooltipTitle('FY Target — Project Utilization', fiscalYearDisplayLabel(S.matrixFiscalYear))}
    <div class="team-utilization-tooltip__note">This is the configured Project Utilization target used by the PS Team Utilization table.</div>
    <div class="team-utilization-tooltip__formula">FY Project Utilization Target = <strong>${TEAM_UTILIZATION_FY_PROJECT_TARGET}%</strong></div>`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:variance`, `
    ${teamUtilizationTooltipTitle('Variance to FY Target', ytdPeriodLabel)}
    <div class="team-utilization-tooltip__note">Variance compares YTD Project Utilization with the FY Project Utilization target.</div>
    <div class="team-utilization-tooltip__formula">${teamUtilizationFormatPercent(stats.ytdProjectPercent)} YTD − ${TEAM_UTILIZATION_FY_PROJECT_TARGET}% target = <strong>${teamUtilizationFormatVariance(stats.projectVariance)}</strong></div>`);
}

function teamUtilizationGetTooltip() {
  let tooltip = document.getElementById('teamUtilizationCalculationTooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'teamUtilizationCalculationTooltip';
  tooltip.className = 'team-utilization-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);
  return tooltip;
}

function teamUtilizationCancelTooltipHide() {
  if (!teamUtilizationTooltipHideTimer) return;
  clearTimeout(teamUtilizationTooltipHideTimer);
  teamUtilizationTooltipHideTimer = null;
}

function teamUtilizationHideTooltip(tooltip) {
  teamUtilizationCancelTooltipHide();
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
  teamUtilizationTooltipActiveTrigger = null;
}

function teamUtilizationScheduleTooltipHide(tooltip, delay = 220) {
  teamUtilizationCancelTooltipHide();
  teamUtilizationTooltipHideTimer = setTimeout(() => {
    teamUtilizationTooltipHideTimer = null;
    const triggerHovered = teamUtilizationTooltipActiveTrigger?.matches?.(':hover');
    const triggerFocused = teamUtilizationTooltipActiveTrigger === document.activeElement;
    if (tooltip.matches(':hover') || triggerHovered || triggerFocused) return;
    teamUtilizationHideTooltip(tooltip);
  }, delay);
}

function positionTeamUtilizationTooltip(tooltip, trigger) {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const padding = 10;
  const isStaffList = String(trigger?.dataset?.teamUtilizationTooltip || '').endsWith(':staff');
  const width = Math.min(isStaffList ? 760 : 440, window.innerWidth - padding * 2);
  tooltip.style.maxWidth = `${width}px`;
  tooltip.style.left = `${padding}px`;
  tooltip.style.top = `${padding}px`;
  const tipRect = tooltip.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + tipRect.width > window.innerWidth - padding) left = window.innerWidth - tipRect.width - padding;
  if (top + tipRect.height > window.innerHeight - padding) top = rect.top - tipRect.height - gap;
  if (top < padding) top = Math.max(padding, Math.min(rect.top, window.innerHeight - tipRect.height - padding));
  tooltip.style.left = `${Math.max(padding, left)}px`;
  tooltip.style.top = `${Math.max(padding, top)}px`;
}

function teamUtilizationShowTooltip(tooltip, trigger) {
  const key = trigger?.dataset?.teamUtilizationTooltip;
  const html = TEAM_UTILIZATION_TOOLTIP_DATA.get(key);
  if (!html) return;
  teamUtilizationCancelTooltipHide();
  if (teamUtilizationTooltipActiveTrigger === trigger && tooltip.classList.contains('is-visible')) return;
  teamUtilizationTooltipActiveTrigger = trigger;
  tooltip.innerHTML = html;
  tooltip.scrollTop = 0;
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => positionTeamUtilizationTooltip(tooltip, trigger));
}

function initTeamUtilizationCalculationTooltips() {
  const tooltip = teamUtilizationGetTooltip();
  if (!teamUtilizationTooltipListenersReady) {
    teamUtilizationTooltipListenersReady = true;

    document.addEventListener('mouseover', event => {
      const trigger = event.target.closest?.('[data-team-utilization-tooltip]');
      if (!trigger) return;
      teamUtilizationShowTooltip(tooltip, trigger);
    });

    document.addEventListener('mouseout', event => {
      const trigger = event.target.closest?.('[data-team-utilization-tooltip]');
      if (!trigger || trigger.contains(event.relatedTarget)) return;
      if (event.relatedTarget === tooltip || tooltip.contains(event.relatedTarget)) return;
      teamUtilizationScheduleTooltipHide(tooltip);
    });

    tooltip.addEventListener('mouseenter', () => {
      teamUtilizationCancelTooltipHide();
    });

    tooltip.addEventListener('mouseleave', event => {
      if (event.relatedTarget === teamUtilizationTooltipActiveTrigger || teamUtilizationTooltipActiveTrigger?.contains?.(event.relatedTarget)) return;
      teamUtilizationScheduleTooltipHide(tooltip, 160);
    });

    tooltip.addEventListener('wheel', event => {
      // Keep wheel interaction inside long tooltips instead of closing the tooltip
      // or scrolling the dashboard behind it.
      event.stopPropagation();
    }, { passive: true });

    document.addEventListener('focusin', event => {
      const trigger = event.target.closest?.('[data-team-utilization-tooltip]');
      if (!trigger) return;
      teamUtilizationShowTooltip(tooltip, trigger);
    });

    document.addEventListener('focusout', event => {
      const trigger = event.target.closest?.('[data-team-utilization-tooltip]');
      if (!trigger) return;
      if (event.relatedTarget === tooltip || tooltip.contains(event.relatedTarget)) return;
      teamUtilizationScheduleTooltipHide(tooltip, 120);
    });

    window.addEventListener('scroll', event => {
      const scrollTarget = event.target;
      if (scrollTarget === tooltip || tooltip.contains(scrollTarget)) return;
      teamUtilizationHideTooltip(tooltip);
    }, true);

    window.addEventListener('resize', () => {
      teamUtilizationHideTooltip(tooltip);
    });
  }
}

function teamUtilizationMonthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function teamUtilizationMonthLabel(year, month, long = true) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: long ? 'long' : 'short', year: long ? undefined : 'numeric', timeZone: 'UTC' }).format(date);
}

function teamUtilizationFiscalMonthIndex(year, month, fiscalYear = S.matrixFiscalYear) {
  return fiscalMonths(fiscalYear).findIndex(item => (
    Number(item.y) === Number(year) && Number(item.m) === Number(month)
  ));
}

function teamUtilizationDefaultReportMonth(rowsOverride = null) {
  const fiscalYear = S.matrixFiscalYear;
  const months = fiscalMonths(fiscalYear);
  const rows = Array.isArray(rowsOverride)
    ? rowsOverride
    : (typeof getWorkSummaryTimesheetRows === 'function'
      ? getWorkSummaryTimesheetRows(fiscalYear)
      : []);

  const actualMonths = rows
    .map(row => typeof parseMonthlyWorkMonth === 'function' ? parseMonthlyWorkMonth(row.month) : null)
    .filter(Boolean)
    .filter(item => teamUtilizationFiscalMonthIndex(item.year, item.month, fiscalYear) >= 0)
    .sort((a, b) => (
      teamUtilizationFiscalMonthIndex(a.year, a.month, fiscalYear) -
      teamUtilizationFiscalMonthIndex(b.year, b.month, fiscalYear)
    ));

  if (actualMonths.length) return actualMonths[actualMonths.length - 1];

  const now = new Date();
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  if (teamUtilizationFiscalMonthIndex(current.year, current.month, fiscalYear) >= 0) return current;

  const currentFy = getCurrentFiscalYearStart(now);
  if (fiscalYear < currentFy) {
    const last = months[months.length - 1];
    return { year: last.y, month: last.m };
  }

  const first = months[0];
  return { year: first.y, month: first.m };
}

function teamUtilizationResolveReportMonth(rows) {
  const fiscalYear = Number(S.matrixFiscalYear);
  const months = fiscalMonths(fiscalYear);

  if (Number(teamUtilizationSelectedFiscalYear) !== fiscalYear) {
    teamUtilizationSelectedFiscalYear = fiscalYear;
    teamUtilizationSelectedMonthKey = null;
  }

  if (teamUtilizationSelectedMonthKey) {
    const selected = months.find(item => teamUtilizationMonthKey(item.y, item.m) === teamUtilizationSelectedMonthKey);
    if (selected) return { year: selected.y, month: selected.m };
  }

  const fallback = teamUtilizationDefaultReportMonth(rows);
  teamUtilizationSelectedMonthKey = teamUtilizationMonthKey(fallback.year, fallback.month);
  return fallback;
}

function teamUtilizationSyncMonthControl(rows, reportMonth) {
  const select = document.getElementById('teamUtilizationMonthSelect');
  if (!select) return;

  const actualMonthKeys = new Set((rows || []).map(row => {
    const parsed = typeof parseMonthlyWorkMonth === 'function' ? parseMonthlyWorkMonth(row.month) : null;
    return parsed ? teamUtilizationMonthKey(parsed.year, parsed.month) : null;
  }).filter(Boolean));

  const selectedKey = teamUtilizationMonthKey(reportMonth.year, reportMonth.month);
  select.innerHTML = fiscalMonths(S.matrixFiscalYear).map(item => {
    const key = teamUtilizationMonthKey(item.y, item.m);
    const label = `${teamUtilizationMonthLabel(item.y, item.m, true)} ${item.y}`;
    const suffix = actualMonthKeys.has(key) ? ' · Actual' : ' · No actual';
    return `<option value="${esc(key)}">${esc(label + suffix)}</option>`;
  }).join('');
  select.value = selectedKey;

  if (select.dataset.teamUtilizationBound !== '1') {
    select.dataset.teamUtilizationBound = '1';
    select.addEventListener('change', event => {
      teamUtilizationSelectedFiscalYear = Number(S.matrixFiscalYear);
      teamUtilizationSelectedMonthKey = String(event.target.value || '');
      renderTeamUtilizationSummary();
    });
  }
}

function teamUtilizationEmployeeByWorker(worker) {
  const key = personIdentityKey(worker);
  return (S.employees || []).find(employee => personIdentityKey(employee.name) === key) || null;
}

function teamUtilizationRowsThroughMonth(rows, reportMonth) {
  const reportIndex = teamUtilizationFiscalMonthIndex(
    reportMonth.year,
    reportMonth.month,
    S.matrixFiscalYear,
  );

  return (rows || []).filter(row => {
    const parsed = typeof parseMonthlyWorkMonth === 'function'
      ? parseMonthlyWorkMonth(row.month)
      : null;
    if (!parsed) return false;
    const index = teamUtilizationFiscalMonthIndex(parsed.year, parsed.month, S.matrixFiscalYear);
    return index >= 0 && index <= reportIndex;
  });
}

function teamUtilizationWorkerHours(rows) {
  const byWorker = new Map();
  for (const row of rows || []) {
    const worker = canonicalPersonName(row.worker);
    if (!worker) continue;
    if (!byWorker.has(worker)) {
      byWorker.set(worker, {
        worker,
        local: 0,
        intra: 0,
        billable: 0,
        project: 0,
        total: 0,
      });
    }
    const record = byWorker.get(worker);
    const workType = normalizeTimesheetWorkType(row.workType) || row.workType;
    const hours = Number(row.qty) || 0;
    record.total += hours;
    if (workType === 'Service Delivery - Local PS') record.local += hours;
    if (workType === 'Service Delivery - Intrasourcing') record.intra += hours;
    if (TEAM_UTILIZATION_BILLABLE_TYPES.has(workType)) record.billable += hours;
    if (TEAM_UTILIZATION_PROJECT_TYPES.has(workType)) record.project += hours;
  }
  return byWorker;
}

function teamUtilizationClassifyMembers(monthRows, ytdRows) {
  const monthByWorker = teamUtilizationWorkerHours(monthRows);
  const ytdByWorker = teamUtilizationWorkerHours(ytdRows);
  const workers = new Set([...monthByWorker.keys(), ...ytdByWorker.keys()]);
  const local = [];
  const intra = [];

  for (const worker of workers) {
    const month = monthByWorker.get(worker) || { local: 0, intra: 0, project: 0 };
    const ytd = ytdByWorker.get(worker) || { local: 0, intra: 0, project: 0 };
    const localHours = month.local || ytd.local || 0;
    const intraHours = month.intra || ytd.intra || 0;
    const projectHours = month.project || ytd.project || 0;

    if (intraHours > localHours && intraHours > 0) {
      intra.push(worker);
    } else if (localHours > 0 || projectHours > 0) {
      local.push(worker);
    }
  }

  return { local, intra };
}

function teamUtilizationAggregateActual(rows, members) {
  const memberKeys = new Set((members || []).map(personIdentityKey));
  let billableHours = 0;
  let projectHours = 0;

  for (const row of rows || []) {
    if (!memberKeys.has(personIdentityKey(row.worker))) continue;
    const type = normalizeTimesheetWorkType(row.workType) || row.workType;
    const hours = Number(row.qty) || 0;
    if (TEAM_UTILIZATION_BILLABLE_TYPES.has(type)) billableHours += hours;
    if (TEAM_UTILIZATION_PROJECT_TYPES.has(type)) projectHours += hours;
  }

  return { billableHours, projectHours };
}

function teamUtilizationPercent(days, capacityDays) {
  return capacityDays > 0 ? (Number(days) || 0) / capacityDays * 100 : 0;
}

function teamUtilizationNextMonthActualDetails(members, nextMonthRows) {
  const empty = {
    percent: null,
    capacityDays: teamUtilizationMonthlyTeamCapacity((members || []).length),
    projectDays: 0,
    projectHours: 0,
    typeBreakdown: {},
    hasActual: false,
  };
  if (!members?.length || !nextMonthRows?.length) return empty;

  const actual = teamUtilizationAggregateActual(nextMonthRows, members);
  const typeBreakdown = teamUtilizationActualTypeBreakdown(nextMonthRows, members);
  const projectDays = actual.projectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const capacityDays = teamUtilizationMonthlyTeamCapacity(members.length);
  return {
    percent: teamUtilizationPercent(projectDays, capacityDays),
    capacityDays,
    projectDays,
    projectHours: actual.projectHours,
    typeBreakdown,
    hasActual: true,
  };
}

function teamUtilizationFormatPercent(value, na = 'NA') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return na;
  return `${Math.round(Number(value))}%`;
}

function teamUtilizationFormatDays(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function teamUtilizationFormatVariance(value) {
  if (!Number.isFinite(Number(value))) return 'NA';
  const rounded = Math.round(Number(value));
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function buildTeamUtilizationSection(title, tone, stats, reportMonth, nextMonth) {
  const monthName = teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true);
  const nextMonthName = nextMonth
    ? teamUtilizationMonthLabel(nextMonth.y, nextMonth.m, true)
    : 'Next FY';
  const monthlyCapacity = stats.monthCapacityDays;
  const billableDays = stats.monthBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const projectDays = stats.monthProjectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  teamUtilizationBuildTooltipData(tone, stats, reportMonth, nextMonth);

  return `
    <section class="team-utilization-panel team-utilization-panel--${tone}">
      <div class="team-utilization-panel-heading">
        <div>
          <h3>${esc(title)}</h3>
          <p>${esc(fiscalYearDisplayLabel(S.matrixFiscalYear))} · ${stats.staffCount} staff in the current reporting team</p>
        </div>
        <span class="team-utilization-team-chip">${esc(monthName)}</span>
      </div>

      <div class="team-utilization-table-wrap">
        <table class="team-utilization-table">
          <thead>
            <tr>
              <th class="team-utilization-sn" aria-label="Serial number"></th>
              <th>Project Services</th>
              <th>This Month<br><span>(${esc(monthName)})</span></th>
              <th>YTD</th>
              <th>FY Target</th>
              <th>Var ±</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <th scope="row">Billable Utilization</th>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:billable-utilization" tabindex="0">${teamUtilizationFormatPercent(stats.monthBillablePercent)}</td>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:ytd-billable-utilization" tabindex="0">${teamUtilizationFormatPercent(stats.ytdBillablePercent)}</td>
              <td>NA</td>
              <td>NA</td>
            </tr>
            <tr>
              <td>2</td>
              <th scope="row">Project Utilization</th>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:project-utilization" tabindex="0">${teamUtilizationFormatPercent(stats.monthProjectPercent)}</td>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:ytd-project-utilization" tabindex="0">${teamUtilizationFormatPercent(stats.ytdProjectPercent)}</td>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:fy-target" tabindex="0">${TEAM_UTILIZATION_FY_PROJECT_TARGET}%</td>
              <td class="team-utilization-table-value ${stats.projectVariance >= 0 ? 'is-positive' : 'is-negative'}" data-team-utilization-tooltip="${tone}:variance" tabindex="0">${teamUtilizationFormatVariance(stats.projectVariance)}</td>
            </tr>
            <tr>
              <td>3</td>
              <th scope="row">Next Month Project Utilization<br><span>Time Sheet (${esc(nextMonthName)})</span></th>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:next-month-project-utilization" tabindex="0">${teamUtilizationFormatPercent(stats.nextMonthProjectPercent)}</td>
              <td>NA</td>
              <td>NA</td>
              <td>NA</td>
            </tr>
            <tr class="team-utilization-comments-row">
              <td></td>
              <th scope="row">Comments:</th>
              <td colspan="4">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="team-utilization-basis">
        <div class="team-utilization-basis-item team-utilization-staff-trigger" data-team-utilization-tooltip="${tone}:staff" tabindex="0" role="button" aria-label="Show ${esc(title)} resource list used for Total Staff"><span>Total Staff</span><strong>${stats.staffCount}</strong><em>View resources</em></div>
        <div><span>Total Billable Days</span><strong>${teamUtilizationFormatDays(billableDays)}</strong></div>
        <div><span>Total Project Days</span><strong>${teamUtilizationFormatDays(projectDays)}</strong></div>
        <div class="team-utilization-formula">
          <span>Billable Utilization</span>
          <strong>${teamUtilizationFormatDays(billableDays)} ÷ ((${teamUtilizationFormatDays(getDefaultAnnualWorkdays())} ÷ 12) × ${stats.staffCount}) = ${teamUtilizationFormatPercent(stats.monthBillablePercent)}</strong>
        </div>
        <div class="team-utilization-formula">
          <span>Project Utilization</span>
          <strong>${teamUtilizationFormatDays(projectDays)} ÷ ((${teamUtilizationFormatDays(getDefaultAnnualWorkdays())} ÷ 12) × ${stats.staffCount}) = ${teamUtilizationFormatPercent(stats.monthProjectPercent)}</strong>
        </div>
      </div>

      <div class="team-utilization-chart-card">
        <div class="team-utilization-chart-heading">
          <div>
            <strong>${tone === 'local' ? 'Local PS Utilization' : 'Intra-Sourcing Utilization'}</strong>
            <span>Monthly Time Sheet utilization across ${esc(fiscalYearDisplayLabel(S.matrixFiscalYear))} (April–March)</span>
          </div>
          <span class="team-utilization-chart-period">${esc(fiscalYearDisplayLabel(S.matrixFiscalYear))}</span>
        </div>
        <div class="team-utilization-chart-wrap">
          <canvas id="teamUtilizationChart-${tone}" aria-label="${tone === 'local' ? 'Local PS' : 'Intra-Sourcing'} utilization chart"></canvas>
        </div>
      </div>
    </section>`;
}

function teamUtilizationBuildStats(members, monthRows, ytdRows, reportMonth, ytdMonths, nextMonthRows) {
  const monthlyActual = teamUtilizationAggregateActual(monthRows, members);
  const ytdActual = teamUtilizationAggregateActual(ytdRows, members);
  const monthCapacityDays = teamUtilizationMonthlyTeamCapacity(members.length);
  const ytdCapacityDays = teamUtilizationYtdTeamCapacity(members.length, (ytdMonths || []).length);
  const monthBillableDays = monthlyActual.billableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const monthProjectDays = monthlyActual.projectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdBillableDays = ytdActual.billableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdProjectDays = ytdActual.projectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdProjectPercent = teamUtilizationPercent(ytdProjectDays, ytdCapacityDays);
  const monthTypeBreakdown = teamUtilizationActualTypeBreakdown(monthRows, members);
  const ytdTypeBreakdown = teamUtilizationActualTypeBreakdown(ytdRows, members);
  const memberBasis = teamUtilizationMemberBasis(members, monthRows, ytdRows);
  const nextMonthDetails = teamUtilizationNextMonthActualDetails(members, nextMonthRows);

  return {
    staffCount: members.length,
    members: [...members],
    memberBasis,
    monthTypeBreakdown,
    ytdTypeBreakdown,
    ytdMonths: [...(ytdMonths || [])],
    monthBillableHours: monthlyActual.billableHours,
    monthProjectHours: monthlyActual.projectHours,
    ytdBillableHours: ytdActual.billableHours,
    ytdProjectHours: ytdActual.projectHours,
    monthCapacityDays,
    ytdCapacityDays,
    monthBillablePercent: teamUtilizationPercent(monthBillableDays, monthCapacityDays),
    monthProjectPercent: teamUtilizationPercent(monthProjectDays, monthCapacityDays),
    ytdBillablePercent: teamUtilizationPercent(ytdBillableDays, ytdCapacityDays),
    ytdProjectPercent,
    projectVariance: ytdProjectPercent - TEAM_UTILIZATION_FY_PROJECT_TARGET,
    nextMonthDetails,
    nextMonthProjectPercent: nextMonthDetails.percent,
  };
}

function teamUtilizationDestroyChart(key) {
  const chart = S?.charts?.[key];
  if (chart && typeof chart.destroy === 'function') chart.destroy();
  if (S?.charts) delete S.charts[key];
}

function teamUtilizationBuildFiscalChartSeries(allRows, tone) {
  const months = fiscalMonths(S.matrixFiscalYear);
  const labels = [];
  const billableValues = [];
  const projectValues = [];

  for (const month of months) {
    const reportMonth = { year: month.y, month: month.m };
    const monthRows = (allRows || []).filter(row => {
      const parsed = typeof parseMonthlyWorkMonth === 'function'
        ? parseMonthlyWorkMonth(row.month)
        : null;
      return parsed
        && Number(parsed.year) === Number(month.y)
        && Number(parsed.month) === Number(month.m);
    });
    const ytdRows = teamUtilizationRowsThroughMonth(allRows || [], reportMonth);
    const teams = teamUtilizationClassifyMembers(monthRows, ytdRows);
    const members = tone === 'local' ? teams.local : teams.intra;
    const actual = teamUtilizationAggregateActual(monthRows, members);
    const capacityDays = teamUtilizationMonthlyTeamCapacity(members.length);
    const billableDays = actual.billableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
    const projectDays = actual.projectHours / TEAM_UTILIZATION_HOURS_PER_DAY;

    labels.push(teamUtilizationMonthLabel(month.y, month.m, false));
    billableValues.push(teamUtilizationPercent(billableDays, capacityDays));
    projectValues.push(teamUtilizationPercent(projectDays, capacityDays));
  }

  return { labels, billableValues, projectValues };
}

function teamUtilizationRenderChart(tone, allRows) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(`teamUtilizationChart-${tone}`);
  if (!canvas) return;

  if (!S.charts) S.charts = {};
  const chartKey = tone === 'local' ? 'teamUtilizationLocal' : 'teamUtilizationIntra';
  teamUtilizationDestroyChart(chartKey);

  const series = teamUtilizationBuildFiscalChartSeries(allRows, tone);
  const billableValues = series.billableValues;
  const projectValues = series.projectValues;
  const targetValues = series.labels.map(() => TEAM_UTILIZATION_FY_PROJECT_TARGET);
  const finiteValues = [...billableValues, ...projectValues, TEAM_UTILIZATION_FY_PROJECT_TARGET]
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
  const maxValue = finiteValues.length ? Math.max(...finiteValues) : 100;
  const suggestedMax = Math.max(100, Math.ceil((maxValue + 8) / 10) * 10);

  S.charts[chartKey] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Project Utilization',
          data: projectValues,
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 38,
          order: 2,
        },
        {
          type: 'line',
          label: 'Billable Utilization',
          data: billableValues,
          borderColor: '#c026d3',
          backgroundColor: '#c026d3',
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#c026d3',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: false,
          spanGaps: false,
          tension: 0.25,
          order: 1,
        },
        {
          type: 'line',
          label: 'FY Target',
          data: targetValues,
          borderColor: '#d97706',
          backgroundColor: '#d97706',
          borderWidth: 2,
          borderDash: [7, 5],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'rectRounded',
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            color: '#475569',
            font: { size: 10, weight: '600' },
          },
        },
        tooltip: {
          padding: 10,
          displayColors: true,
          callbacks: {
            label(context) {
              const value = context.raw;
              if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
              return `${context.dataset.label}: ${Math.round(Number(value))}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#475569',
            font: { size: 10, weight: '600' },
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax,
          grid: { color: '#e8eef6' },
          ticks: {
            color: '#64748b',
            font: { size: 10 },
            callback: value => `${value}%`,
          },
          title: {
            display: true,
            text: 'Utilization',
            color: '#94a3b8',
            font: { size: 10, weight: '600' },
          },
        },
      },
    },
  });
}

function teamUtilizationRenderCharts(allRows) {
  teamUtilizationRenderChart('local', allRows);
  teamUtilizationRenderChart('intra', allRows);
}

function renderTeamUtilizationSummary() {
  TEAM_UTILIZATION_TOOLTIP_DATA.clear();
  initTeamUtilizationCalculationTooltips();
  const content = document.getElementById('teamUtilizationContent');
  if (!content) return;

  const fyBadge = document.getElementById('teamUtilizationFyBadge');
  if (fyBadge) fyBadge.textContent = fiscalYearDisplayLabel(S.matrixFiscalYear);

  const allRows = typeof getWorkSummaryTimesheetRows === 'function'
    ? getWorkSummaryTimesheetRows(S.matrixFiscalYear)
    : [];
  const reportMonth = teamUtilizationResolveReportMonth(allRows);
  teamUtilizationSyncMonthControl(allRows, reportMonth);
  const reportIndex = teamUtilizationFiscalMonthIndex(reportMonth.year, reportMonth.month, S.matrixFiscalYear);
  const fiscalMonthList = fiscalMonths(S.matrixFiscalYear);
  const ytdMonths = fiscalMonthList.slice(0, Math.max(0, reportIndex) + 1);
  const nextMonth = reportIndex >= 0 && reportIndex < fiscalMonthList.length - 1
    ? fiscalMonthList[reportIndex + 1]
    : null;
  const monthRows = allRows.filter(row => {
    const parsed = typeof parseMonthlyWorkMonth === 'function'
      ? parseMonthlyWorkMonth(row.month)
      : null;
    return parsed && Number(parsed.year) === Number(reportMonth.year) && Number(parsed.month) === Number(reportMonth.month);
  });
  const nextMonthRows = nextMonth
    ? allRows.filter(row => {
        const parsed = typeof parseMonthlyWorkMonth === 'function'
          ? parseMonthlyWorkMonth(row.month)
          : null;
        return parsed && Number(parsed.year) === Number(nextMonth.y) && Number(parsed.month) === Number(nextMonth.m);
      })
    : [];
  const ytdRows = teamUtilizationRowsThroughMonth(allRows, reportMonth);
  const teams = teamUtilizationClassifyMembers(monthRows, ytdRows);

  const reportMonthText = document.getElementById('teamUtilizationReportMonth');
  if (reportMonthText) {
    const monthLabel = `${teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true)} ${reportMonth.year}`;
    reportMonthText.textContent = monthRows.length
      ? `${monthLabel}: ${monthRows.length} actual Time Sheet row${monthRows.length === 1 ? '' : 's'}`
      : `${monthLabel}: no Time Sheet actuals`;
  }

  const localStats = teamUtilizationBuildStats(
    teams.local,
    monthRows,
    ytdRows,
    reportMonth,
    ytdMonths,
    nextMonthRows,
  );
  const intraStats = teamUtilizationBuildStats(
    teams.intra,
    monthRows,
    ytdRows,
    reportMonth,
    ytdMonths,
    nextMonthRows,
  );

  content.innerHTML = `
    <div class="team-utilization-note">
      <strong>Calculation basis:</strong> Select any April–March month in the chosen Matrix FY. Actual Billable Utilization = Total Billable Days ÷ ((DEFAULT_ANNUAL_WORKDAYS ÷ 12) × Total Staff) × 100, where DEFAULT_ANNUAL_WORKDAYS comes from root config.js. Actual Project Utilization uses the same denominator with Total Project Days. Billable work = Local PS + Intra-Sourcing Time Sheet hours; Project work additionally includes Pre-Sales and Training Delivery. YTD capacity uses the same monthly team-capacity basis multiplied by the number of YTD months. Team membership follows each resource's dominant Local PS vs Intra-Sourcing Time Sheet delivery hours for the selected month (YTD fallback). Next-month Project Utilization uses only next-month Time Sheet actuals for the same reporting-team resources; when no next-month Time Sheet exists it is shown as NA. Project Utilization FY Target = ${TEAM_UTILIZATION_FY_PROJECT_TARGET}%.
    </div>
    <div class="team-utilization-grid">
      ${buildTeamUtilizationSection('Utilization – Local PS Team', 'local', localStats, reportMonth, nextMonth)}
      ${buildTeamUtilizationSection('Utilization – Intra-Sourcing PS Team', 'intra', intraStats, reportMonth, nextMonth)}
    </div>`;

  teamUtilizationRenderCharts(allRows);
}
