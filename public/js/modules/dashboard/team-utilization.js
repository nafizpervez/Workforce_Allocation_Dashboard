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
const TEAM_UTILIZATION_PROJECT_ASSIGNMENT_KEYS = new Set([
  'intrasourcing',
  'local',
  'preSale',
  'training',
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
    return {
      worker,
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

  const staffRows = stats.memberBasis.map(item => `
    <tr>
      <th>${esc(item.worker)}<small>${esc(item.basis)}</small></th>
      <td>Local ${teamUtilizationFormatHours(item.localHours)}<br>Intra ${teamUtilizationFormatHours(item.intraHours)}</td>
    </tr>`);
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:staff`, `
    ${teamUtilizationTooltipTitle('Total Staff', `${monthLabel} · ${stats.staffCount} resources`)}
    <div class="team-utilization-tooltip__note">Team membership is based on each resource's dominant Local PS vs Intra-Sourcing delivery hours for the reporting month; YTD is used when the month has no Local/Intra delivery hours.</div>
    ${teamUtilizationTooltipRows(staffRows)}
    <div class="team-utilization-tooltip__formula">Count of listed resources = <strong>${stats.staffCount}</strong></div>`);

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

  const forecast = stats.forecastDetails;
  const forecastLabel = nextMonth
    ? `${teamUtilizationMonthLabel(nextMonth.y, nextMonth.m, true)} ${nextMonth.y}`
    : 'Next fiscal month';
  const forecastRows = (forecast?.employeeRows || []).map(item => `
    <tr>
      <th>${esc(item.worker)}${item.designation ? `<small>${esc(item.designation)}</small>` : ''}</th>
      <td>${item.normalizedProjectPercent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%<small>${item.weeklyPercentTotal.toLocaleString('en-US', { maximumFractionDigits: 1 })}% assignment total ÷ ${item.availableWeeks} available weeks</small></td>
      <td>${item.projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>${item.capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} capacity days × ${item.normalizedProjectPercent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</small></td>
    </tr>`);
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:forecast-project-utilization`, `
    ${teamUtilizationTooltipTitle('Forecasted Project Utilization', forecastLabel)}
    <div class="team-utilization-tooltip__note">Forecast uses next-month Resource Assignment Matrix percentages for Local PS, Intra-Sourcing, Pre-Sales and Training, normalized by each resource's available weeks.</div>
    ${forecastRows.length ? teamUtilizationTooltipRows(forecastRows, 3) : '<div class="team-utilization-tooltip__note">No qualifying next-month Resource Assignment data is available for this team.</div>'}
    <div class="team-utilization-tooltip__formula">Forecast project days = <strong>${(forecast?.projectDays || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}</strong></div>
    <div class="team-utilization-tooltip__formula">${(forecast?.projectDays || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} project days ÷ ${(forecast?.capacityDays || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} available days × 100 = <strong>${teamUtilizationFormatPercent(forecast?.percent)}</strong></div>`);

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
  const width = Math.min(440, window.innerWidth - padding * 2);
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

function teamUtilizationEmployeeMonthlyCapacity(employee, year, month) {
  const annualWorkdays = Number(employee?.workdays);
  const baseWorkdays = Number.isFinite(annualWorkdays) && annualWorkdays >= 0
    ? annualWorkdays
    : getDefaultAnnualWorkdays();

  if (!employee?.id) return baseWorkdays / 12;

  const availableWeeks = getEmployeeAvailableMonthWeekCount(
    employee.id,
    year,
    month,
    S.matrixAssignments,
  );
  return (baseWorkdays / 12) * (availableWeeks / 4);
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

function teamUtilizationForecastProjectDetails(members, year, month) {
  const empty = { percent: null, capacityDays: 0, projectDays: 0, employeeRows: [] };
  if (!year || !month || !members?.length) return empty;
  const memberEmployeeIds = new Set(
    members
      .map(worker => teamUtilizationEmployeeByWorker(worker)?.id)
      .filter(id => Number.isFinite(Number(id)))
      .map(Number),
  );
  if (!memberEmployeeIds.size) return empty;

  const assignments = getEffectiveAssignments(S.matrixAssignments).filter(assignment => (
    memberEmployeeIds.has(Number(assignment.employee_id)) &&
    Number(assignment.year) === Number(year) &&
    Number(assignment.month) === Number(month)
  ));

  let capacityDays = 0;
  let projectDays = 0;
  const employeeRows = [];

  for (const employeeId of memberEmployeeIds) {
    const employee = (S.employees || []).find(item => Number(item.id) === Number(employeeId));
    const availableWeeks = getEmployeeAvailableMonthWeekCount(
      employeeId,
      year,
      month,
      S.matrixAssignments,
    );
    if (!availableWeeks) continue;

    const employeeCapacity = teamUtilizationEmployeeMonthlyCapacity(employee, year, month);
    capacityDays += employeeCapacity;

    const projectPercentageSum = assignments
      .filter(assignment => Number(assignment.employee_id) === Number(employeeId))
      .reduce((total, assignment) => {
        const category = classifyAllocationProject(
          typeof getSummaryAssignmentProjectName === 'function'
            ? getSummaryAssignmentProjectName(assignment)
            : assignment.project_name,
        );
        return TEAM_UTILIZATION_PROJECT_ASSIGNMENT_KEYS.has(category)
          ? total + (Number(assignment.percentage) || 0)
          : total;
      }, 0);

    const normalizedProjectPercent = availableWeeks > 0
      ? projectPercentageSum / availableWeeks
      : 0;
    const employeeProjectDays = employeeCapacity * (normalizedProjectPercent / 100);
    projectDays += employeeProjectDays;
    employeeRows.push({
      worker: employee?.name || `Resource #${employeeId}`,
      designation: employee?.designation || '',
      availableWeeks,
      capacityDays: employeeCapacity,
      weeklyPercentTotal: projectPercentageSum,
      normalizedProjectPercent,
      projectDays: employeeProjectDays,
    });
  }

  return {
    percent: capacityDays > 0 ? projectDays / capacityDays * 100 : null,
    capacityDays,
    projectDays,
    employeeRows,
  };
}

function teamUtilizationForecastProjectPercent(members, year, month) {
  return teamUtilizationForecastProjectDetails(members, year, month).percent;
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
              <th scope="row">Forecasted Project Utilization<br><span>Next Month (${esc(nextMonthName)})</span></th>
              <td class="team-utilization-table-value" data-team-utilization-tooltip="${tone}:forecast-project-utilization" tabindex="0">${teamUtilizationFormatPercent(stats.forecastProjectPercent)}</td>
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
        <div><span>Total Staff</span><strong>${stats.staffCount}</strong></div>
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
            <span>Selected month, YTD and next-month forecast</span>
          </div>
          <span class="team-utilization-chart-period">${esc(monthName)}</span>
        </div>
        <div class="team-utilization-chart-wrap">
          <canvas id="teamUtilizationChart-${tone}" aria-label="${tone === 'local' ? 'Local PS' : 'Intra-Sourcing'} utilization chart"></canvas>
        </div>
      </div>
    </section>`;
}

function teamUtilizationBuildStats(members, monthRows, ytdRows, reportMonth, ytdMonths, nextMonth) {
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
  const forecastDetails = nextMonth
    ? teamUtilizationForecastProjectDetails(members, nextMonth.y, nextMonth.m)
    : { percent: null, capacityDays: 0, projectDays: 0, employeeRows: [] };

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
    forecastDetails,
    forecastProjectPercent: forecastDetails.percent,
  };
}

function teamUtilizationDestroyChart(key) {
  const chart = S?.charts?.[key];
  if (chart && typeof chart.destroy === 'function') chart.destroy();
  if (S?.charts) delete S.charts[key];
}

function teamUtilizationRenderChart(tone, stats, reportMonth, nextMonth) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(`teamUtilizationChart-${tone}`);
  if (!canvas) return;

  if (!S.charts) S.charts = {};
  const chartKey = tone === 'local' ? 'teamUtilizationLocal' : 'teamUtilizationIntra';
  teamUtilizationDestroyChart(chartKey);

  const monthName = teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true);
  const nextMonthName = nextMonth
    ? teamUtilizationMonthLabel(nextMonth.y, nextMonth.m, true)
    : 'Next FY';
  const billableValues = [stats.monthBillablePercent, stats.ytdBillablePercent, null];
  const projectValues = [stats.monthProjectPercent, stats.ytdProjectPercent, stats.forecastProjectPercent];
  const finiteValues = [...billableValues, ...projectValues, TEAM_UTILIZATION_FY_PROJECT_TARGET]
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
  const maxValue = finiteValues.length ? Math.max(...finiteValues) : 100;
  const suggestedMax = Math.max(100, Math.ceil((maxValue + 8) / 10) * 10);

  S.charts[chartKey] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [`This Month (${monthName})`, 'YTD', `Forecast (${nextMonthName})`],
      datasets: [
        {
          label: 'Billable Utilization',
          data: billableValues,
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.10)',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0f766e',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: true,
          spanGaps: false,
          tension: 0.3,
        },
        {
          label: 'Project Utilization',
          data: projectValues,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.09)',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: true,
          spanGaps: false,
          tension: 0.3,
        },
        {
          label: 'FY Target',
          data: [TEAM_UTILIZATION_FY_PROJECT_TARGET, TEAM_UTILIZATION_FY_PROJECT_TARGET, TEAM_UTILIZATION_FY_PROJECT_TARGET],
          borderColor: '#d97706',
          backgroundColor: '#d97706',
          borderWidth: 2,
          borderDash: [7, 5],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
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
          ticks: { color: '#475569', font: { size: 10, weight: '600' } },
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

function teamUtilizationRenderCharts(localStats, intraStats, reportMonth, nextMonth) {
  teamUtilizationRenderChart('local', localStats, reportMonth, nextMonth);
  teamUtilizationRenderChart('intra', intraStats, reportMonth, nextMonth);
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
    nextMonth,
  );
  const intraStats = teamUtilizationBuildStats(
    teams.intra,
    monthRows,
    ytdRows,
    reportMonth,
    ytdMonths,
    nextMonth,
  );

  content.innerHTML = `
    <div class="team-utilization-note">
      <strong>Calculation basis:</strong> Select any April–March month in the chosen Matrix FY. Actual Billable Utilization = Total Billable Days ÷ ((DEFAULT_ANNUAL_WORKDAYS ÷ 12) × Total Staff) × 100, where DEFAULT_ANNUAL_WORKDAYS comes from root config.js. Actual Project Utilization uses the same denominator with Total Project Days. Billable work = Local PS + Intra-Sourcing Time Sheet hours; Project work additionally includes Pre-Sales and Training Delivery. YTD capacity uses the same monthly team-capacity basis multiplied by the number of YTD months. Team membership follows each resource's dominant Local PS vs Intra-Sourcing actual delivery hours for the selected month (YTD fallback). Forecast uses the same team's following-month Resource Assignment plan. Project Utilization FY Target = ${TEAM_UTILIZATION_FY_PROJECT_TARGET}%.
    </div>
    <div class="team-utilization-grid">
      ${buildTeamUtilizationSection('Utilization – Local PS Team', 'local', localStats, reportMonth, nextMonth)}
      ${buildTeamUtilizationSection('Utilization – Intra-Sourcing PS Team', 'intra', intraStats, reportMonth, nextMonth)}
    </div>`;

  teamUtilizationRenderCharts(localStats, intraStats, reportMonth, nextMonth);
}
