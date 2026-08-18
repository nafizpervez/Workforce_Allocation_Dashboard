/* Workforce Allocation Dashboard — PS Team Utilization */

const TEAM_UTILIZATION_FY_PROJECT_TARGET = 65;
const TEAM_UTILIZATION_HOURS_PER_DAY = 8;
const TEAM_UTILIZATION_PROJECT_TYPES = new Set([
  'Training Delivery',
  'Service Delivery - Local PS',
  'Service Delivery - Intrasourcing',
  'Pre - Sales',
]);
const TEAM_UTILIZATION_TOOLTIP_DATA = new Map();
let teamUtilizationTooltipListenersReady = false;
let teamUtilizationTooltipHideTimer = null;
let teamUtilizationTooltipActiveTrigger = null;
let teamUtilizationSelectedFiscalYear = null;
let teamUtilizationSelectedMonthKey = null;
const TEAM_UTILIZATION_INPUT_SAVE_DELAY = 450;
const teamUtilizationInputSaveTimers = new Map();

function teamUtilizationManualInputKey(tone, monthKey) {
  return `${tone}:${monthKey}`;
}

function teamUtilizationMonthInput(tone, month) {
  if (!month) return { team: tone, month: '', utilizationPercent: null, comments: '' };
  const monthKey = teamUtilizationMonthKey(month.y, month.m);
  return S.teamUtilizationInputs?.entries?.[teamUtilizationManualInputKey(tone, monthKey)] || {
    team: tone,
    month: monthKey,
    utilizationPercent: null,
    comments: '',
  };
}

function teamUtilizationStoreMonthInput(input) {
  const team = String(input?.team || '').trim().toLowerCase();
  const month = String(input?.month || '').trim();
  if (!['local', 'intra'].includes(team) || !/^\d{4}-\d{2}$/.test(month)) return null;
  const utilizationPercent = input?.utilizationPercent === null || input?.utilizationPercent === undefined || input?.utilizationPercent === ''
    ? null
    : Number(input.utilizationPercent);
  const normalized = {
    team,
    month,
    utilizationPercent: Number.isFinite(utilizationPercent) && utilizationPercent >= 0 ? utilizationPercent : null,
    comments: String(input?.comments ?? ''),
    updatedAt: input?.updatedAt || null,
  };
  S.teamUtilizationInputs ||= { fiscalYear: Number(S.matrixFiscalYear), entries: {} };
  S.teamUtilizationInputs.entries ||= {};
  S.teamUtilizationInputs.entries[teamUtilizationManualInputKey(team, month)] = normalized;
  return normalized;
}

async function loadTeamUtilizationInputsForFiscalYear(fiscalYear) {
  const requestedFiscalYear = Number(fiscalYear);
  const data = await api('GET', `/api/ps-team-utilization-inputs?fiscalYear=${requestedFiscalYear}`);
  if (requestedFiscalYear !== Number(S.matrixFiscalYear)) return false;

  const entries = {};
  for (const input of data?.inputs || []) {
    const team = String(input?.team || '').trim().toLowerCase();
    const month = String(input?.month || '').trim();
    if (!['local', 'intra'].includes(team) || !/^\d{4}-\d{2}$/.test(month)) continue;
    const utilizationPercent = input?.utilizationPercent === null || input?.utilizationPercent === undefined
      ? null
      : Number(input.utilizationPercent);
    entries[teamUtilizationManualInputKey(team, month)] = {
      team,
      month,
      utilizationPercent: Number.isFinite(utilizationPercent) && utilizationPercent >= 0 ? utilizationPercent : null,
      comments: String(input?.comments ?? ''),
      updatedAt: input?.updatedAt || null,
    };
  }

  S.teamUtilizationInputs = {
    fiscalYear: requestedFiscalYear,
    entries,
  };
  return true;
}

window.loadTeamUtilizationInputsForFiscalYear = loadTeamUtilizationInputsForFiscalYear;

function teamUtilizationManualTooltip(tone, month, percent) {
  const teamLabel = tone === 'combined'
    ? 'Combined PS Team (Local PS + Intra-Sourcing)'
    : (tone === 'local' ? 'Local PS Team' : 'Intra-Sourcing PS Team');
  const monthLabel = month
    ? `${teamUtilizationMonthLabel(month.y, month.m, true)} ${month.y}`
    : 'Next month';
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) {
    return `
      ${teamUtilizationTooltipTitle('Next Month Project Utilization', `${monthLabel} · ${teamLabel}`)}
      <div class="team-utilization-tooltip__note">Enter the next-month Project Utilization percentage directly in the table.</div>`;
  }
  return `
    ${teamUtilizationTooltipTitle('Next Month Project Utilization', `${monthLabel} · ${teamLabel}`)}
    <div class="team-utilization-tooltip__note">This is a manually entered percentage. No project-days conversion is applied.</div>
    <div class="team-utilization-tooltip__formula">Entered Project Utilization = <strong>${teamUtilizationFormatPercent(percent)}</strong></div>`;
}

function teamUtilizationScheduleInputSave(tone, monthKey) {
  const key = teamUtilizationManualInputKey(tone, monthKey);
  const existingTimer = teamUtilizationInputSaveTimers.get(key);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    teamUtilizationInputSaveTimers.delete(key);
    const input = S.teamUtilizationInputs?.entries?.[key];
    if (!input) return;
    const snapshot = {
      utilizationPercent: input.utilizationPercent,
      comments: input.comments,
    };
    try {
      const saved = await api('PUT', `/api/ps-team-utilization-inputs/${encodeURIComponent(tone)}/${encodeURIComponent(monthKey)}`, snapshot);
      const current = S.teamUtilizationInputs?.entries?.[key];
      const unchanged = current
        && current.utilizationPercent === snapshot.utilizationPercent
        && current.comments === snapshot.comments;
      if (unchanged) teamUtilizationStoreMonthInput(saved);
    } catch (error) {
      console.error('Failed to save PS team utilization input:', error);
      toast(error.message || 'Failed to save PS team utilization input', 'error');
    }
  }, TEAM_UTILIZATION_INPUT_SAVE_DELAY);

  teamUtilizationInputSaveTimers.set(key, timer);
}

function teamUtilizationBindManualInputs(root, statsByTone, nextMonth) {
  if (!root || !nextMonth) return;
  const monthKey = teamUtilizationMonthKey(nextMonth.y, nextMonth.m);

  root.querySelectorAll('[data-team-utilization-project-percent]').forEach(input => {
    input.addEventListener('input', event => {
      const tone = String(event.currentTarget.dataset.teamUtilizationTeam || '').trim();
      if (!statsByTone[tone]) return;

      const raw = String(event.currentTarget.value || '').trim();
      const utilizationPercent = raw === '' ? null : Number(raw);
      if (utilizationPercent !== null && (!Number.isFinite(utilizationPercent) || utilizationPercent < 0)) return;

      const current = teamUtilizationMonthInput(tone, nextMonth);
      const stored = teamUtilizationStoreMonthInput({
        ...current,
        team: tone,
        month: monthKey,
        utilizationPercent,
      });

      TEAM_UTILIZATION_TOOLTIP_DATA.set(
        `${tone}:next-month-project-utilization`,
        teamUtilizationManualTooltip(tone, nextMonth, stored?.utilizationPercent),
      );
      teamUtilizationScheduleInputSave(tone, monthKey);
    });

    input.addEventListener('blur', event => {
      const tone = String(event.currentTarget.dataset.teamUtilizationTeam || '').trim();
      if (!tone) return;
      teamUtilizationScheduleInputSave(tone, monthKey);
    });
  });

  root.querySelectorAll('[data-team-utilization-comments]').forEach(input => {
    input.addEventListener('input', event => {
      const tone = String(event.currentTarget.dataset.teamUtilizationTeam || '').trim();
      if (!statsByTone[tone]) return;
      const current = teamUtilizationMonthInput(tone, nextMonth);
      teamUtilizationStoreMonthInput({
        ...current,
        team: tone,
        month: monthKey,
        comments: event.currentTarget.value,
      });
      teamUtilizationScheduleInputSave(tone, monthKey);
    });

    input.addEventListener('blur', event => {
      const tone = String(event.currentTarget.dataset.teamUtilizationTeam || '').trim();
      if (!tone) return;
      teamUtilizationScheduleInputSave(tone, monthKey);
    });
  });
}

function selectTeamUtilizationReportingMonth(monthKey) {
  const normalized = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return false;
  const existsInSelectedFy = fiscalMonths(S.matrixFiscalYear).some(item => (
    teamUtilizationMonthKey(item.y, item.m) === normalized
  ));
  if (!existsInSelectedFy) return false;
  teamUtilizationSelectedFiscalYear = Number(S.matrixFiscalYear);
  teamUtilizationSelectedMonthKey = normalized;
  return true;
}

window.selectTeamUtilizationReportingMonth = selectTeamUtilizationReportingMonth;

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

function teamUtilizationTooltipRows(rows, columns = 2) {
  return `<table class="team-utilization-tooltip__table team-utilization-tooltip__table--${columns}">${rows.join('')}</table>`;
}

function teamUtilizationTooltipTitle(title, subtitle = '') {
  return `<div class="team-utilization-tooltip__title">${esc(title)}</div>${subtitle ? `<div class="team-utilization-tooltip__subtitle">${esc(subtitle)}</div>` : ''}`;
}

function teamUtilizationBuildCalculationBasisTooltip() {
  const defaultAnnualWorkdays = Number(getDefaultAnnualWorkdays()) || 0;
  return `
    ${teamUtilizationTooltipTitle('PS Team Utilization — Calculation Basis', fiscalYearDisplayLabel(S.matrixFiscalYear))}
    <div class="team-utilization-tooltip__note">Assigned To carries forward until changed; — makes the resource unassigned.</div>
    <table class="team-utilization-tooltip__table team-utilization-tooltip__table--basis">
      <tr><th>Team membership</th><td>Assigned To = Local PS or Intra-Sourcing.</td></tr>
      <tr><th>Billable work</th><td>Time Sheet rows where <strong>Billable? = Yes</strong>.</td></tr>
      <tr><th>Project work</th><td>Local PS + Intra-Sourcing + Pre-Sales + Training Delivery Time Sheet hours.</td></tr>
      <tr><th>Monthly capacity</th><td>(${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12) × Total Staff</td></tr>
      <tr><th>Billable Utilization</th><td>Total Billable Days ÷ Monthly Team Capacity × 100</td></tr>
      <tr><th>Project Utilization</th><td>Total Project Days ÷ Monthly Team Capacity × 100</td></tr>
      <tr><th>YTD</th><td>Sum monthly actuals using each month’s effective Assigned To.</td></tr>
      <tr><th>Next month</th><td>Enter Project Utilization % directly; if left blank, next-month Time Sheet actual remains the fallback.</td></tr>
      <tr><th>FY Target</th><td>Project Utilization target = ${TEAM_UTILIZATION_FY_PROJECT_TARGET}%.</td></tr>
    </table>
    <div class="team-utilization-tooltip__formula">DEFAULT_ANNUAL_WORKDAYS = <strong>${defaultAnnualWorkdays.toLocaleString('en-US')}</strong> from root config.js</div>`;
}

function teamUtilizationBuildTooltipData(tone, stats, reportMonth, nextMonth) {
  const monthLabel = `${teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true)} ${reportMonth.year}`;
  const defaultAnnualWorkdays = Number(getDefaultAnnualWorkdays()) || 0;
  const monthlyCapacityPerStaff = defaultAnnualWorkdays / 12;
  const capacityTotal = stats.monthCapacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const capacityRows = [
    `<tr><th>DEFAULT_ANNUAL_WORKDAYS</th><td>${defaultAnnualWorkdays.toLocaleString('en-US')} days<small>Root config.js</small></td></tr>`,
    `<tr><th>Monthly capacity / staff</th><td>${monthlyCapacityPerStaff.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12 months</small></td></tr>`,
    `<tr><th>Total Staff</th><td>${stats.staffCount}<small>Manual Assigned To membership for this month</small></td></tr>`,
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
  const teamLabel = tone === 'combined'
    ? 'Combined PS Team (Local PS + Intra-Sourcing)'
    : (tone === 'local' ? 'Local PS Team' : 'Intra-Sourcing PS Team');
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:staff`, `
    ${teamUtilizationTooltipTitle('Total Staff — Resource List', `${monthLabel} · ${stats.staffCount} resources · ${teamLabel}`)}
    <div class="team-utilization-tooltip__note">Every row below is included in the displayed Total Staff count. Team membership comes only from the manually saved Assigned To value for this exact month. Resources left unassigned (—) are excluded from both PS teams.</div>
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

  const billableTypeRows = Object.entries(stats.monthBillableTypeBreakdown || {})
    .filter(([, hours]) => Number(hours) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
    .map(([label, hours]) => `
      <tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${teamUtilizationFormatHours(hours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY}h/day = ${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`);
  const billableDays = stats.monthBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:billable-days`, `
    ${teamUtilizationTooltipTitle('Total Billable Days', monthLabel)}
    <div class="team-utilization-tooltip__note">Billable work is taken directly from the uploaded Time Sheet: every source row where <strong>Billable? = Yes</strong> counts, regardless of work type.</div>
    ${billableTypeRows.length ? teamUtilizationTooltipRows(billableTypeRows) : '<div class="team-utilization-tooltip__note">No Billable? = Yes Time Sheet hours were found for this team and month.</div>'}
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
    <div class="team-utilization-tooltip__note">Numerator: uploaded Time Sheet rows for this team where <strong>Billable? = Yes</strong>.</div>
    ${billableTypeRows.length ? teamUtilizationTooltipRows(billableTypeRows) : '<div class="team-utilization-tooltip__note">No Billable? = Yes Time Sheet hours were found for this team and month.</div>'}
    ${teamUtilizationTooltipRows(capacityRows)}
    <div class="team-utilization-tooltip__formula">Monthly team capacity = (${defaultAnnualWorkdays.toLocaleString('en-US')} ÷ 12) × ${stats.staffCount} = <strong>${capacityTotal} days</strong></div>
    <div class="team-utilization-tooltip__formula">Billable days = ${teamUtilizationFormatHours(stats.monthBillableHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${billableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
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
    ...(stats.ytdCapacityBreakdown || []).map(item => `<tr><th>${esc(teamUtilizationMonthLabel(item.year, item.month, true))} ${item.year}</th><td>${item.staffCount} staff · ${item.capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>Manual Assigned To membership for that month</small></td></tr>`),
    `<tr><th>YTD team capacity</th><td>${ytdCapacityTotal} days<small>Sum of monthly Assigned To team capacities</small></td></tr>`,
  ];
  const ytdBillableDays = stats.ytdBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdProjectDays = stats.ytdProjectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdBillableRows = Object.entries(stats.ytdBillableTypeBreakdown || {})
    .filter(([, hours]) => Number(hours) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
    .map(([label, hours]) => `
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
    <div class="team-utilization-tooltip__note">YTD billable work is the sum of uploaded Time Sheet rows where <strong>Billable? = Yes</strong> from the fiscal-year start through the reporting month, regardless of work type.</div>
    ${ytdBillableRows.length ? teamUtilizationTooltipRows(ytdBillableRows) : '<div class="team-utilization-tooltip__note">No Billable? = Yes Time Sheet hours were found in this YTD period.</div>'}
    <div class="team-utilization-tooltip__note">Available capacity by month using each month's manual Assigned To team:</div>
    ${teamUtilizationTooltipRows(ytdCapacityRows)}
    <div class="team-utilization-tooltip__formula">Billable days = ${teamUtilizationFormatHours(stats.ytdBillableHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${ytdBillableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
    <div class="team-utilization-tooltip__formula">${ytdBillableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} billable days ÷ ${ytdCapacityTotal} available days × 100 = <strong>${teamUtilizationFormatPercent(stats.ytdBillablePercent)}</strong></div>`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:ytd-project-utilization`, `
    ${teamUtilizationTooltipTitle('Project Utilization — YTD', ytdPeriodLabel)}
    <div class="team-utilization-tooltip__note">YTD project work includes Local PS, Intra-Sourcing, Pre-Sales and Training Delivery Time Sheet hours.</div>
    ${teamUtilizationTooltipRows(ytdProjectRows)}
    <div class="team-utilization-tooltip__note">Available capacity by month using each month's manual Assigned To team:</div>
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
  if (stats.nextMonthManualUtilizationPercent !== null) {
    TEAM_UTILIZATION_TOOLTIP_DATA.set(
      `${tone}:next-month-project-utilization`,
      teamUtilizationManualTooltip(
        tone,
        nextMonth,
        stats.nextMonthManualUtilizationPercent,
      ),
    );
  } else {
    TEAM_UTILIZATION_TOOLTIP_DATA.set(`${tone}:next-month-project-utilization`, `
      ${teamUtilizationTooltipTitle('Next Month Project Utilization — Time Sheet', nextActualLabel)}
      <div class="team-utilization-tooltip__note">Enter the Project Utilization percentage directly in this row. No project-days conversion is applied to a manual entry. Until a manual percentage is entered, uploaded next-month Time Sheet actuals remain the fallback.</div>
      ${nextActual?.hasActual ? teamUtilizationTooltipRows(nextTypeRows) : '<div class="team-utilization-tooltip__note">No manual percentage or next-month Time Sheet actual is available, so the value is NA.</div>'}
      ${nextActual?.hasActual ? `<div class="team-utilization-tooltip__formula">Fallback Time Sheet Project Utilization = ${nextActual.projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} project days ÷ ${nextActual.capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} team-capacity days × 100 = <strong>${teamUtilizationFormatPercent(nextActual.percent)}</strong></div>` : ''}`);
  }

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
  const tooltipKey = String(trigger?.dataset?.teamUtilizationTooltip || '');
  const isStaffList = tooltipKey.endsWith(':staff');
  const isCalculationBasis = tooltipKey === 'calculation-basis';
  const preferredWidth = isStaffList ? 760 : (isCalculationBasis ? 720 : 440);
  const width = Math.min(preferredWidth, window.innerWidth - padding * 2);
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
  const fiscalYear = Number(S.matrixFiscalYear);
  const months = fiscalMonths(fiscalYear);
  const now = new Date();

  // PS Team Utilization is a completed-month report. By default it always opens
  // on the previous calendar month (for example: February -> January,
  // April -> March, August -> July) rather than the current/open month.
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = {
    year: previousMonthDate.getFullYear(),
    month: previousMonthDate.getMonth() + 1,
  };

  if (teamUtilizationFiscalMonthIndex(previous.year, previous.month, fiscalYear) >= 0) {
    return previous;
  }

  // If the user has selected another Matrix FY, keep the reporting month inside
  // that FY: completed historical FYs open on March; future FYs open on April.
  const previousFiscalYear = Number(getCurrentFiscalYearStart(previousMonthDate));
  if (fiscalYear < previousFiscalYear) {
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


function teamUtilizationAssignmentMonthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function teamUtilizationAssignmentSnapshot(year, month) {
  const key = teamUtilizationAssignmentMonthKey(year, month);
  return S.psTeamAssignments?.months?.[key] || null;
}

function teamUtilizationAssignedEntries(year, month, tone) {
  const snapshot = teamUtilizationAssignmentSnapshot(year, month);
  const activeIds = new Set((typeof getActiveEmployees === 'function' ? getActiveEmployees() : (S.employees || []).filter(e => e.active !== 0)).map(e => Number(e.id)));
  const expectedTeams = tone === 'combined'
    ? new Set(['Local PS', 'Intra-Sourcing'])
    : new Set([tone === 'intra' ? 'Intra-Sourcing' : 'Local PS']);
  return (snapshot?.assignments || []).filter(entry => (
    activeIds.has(Number(entry.employeeId)) && expectedTeams.has(entry.assignedTo)
  ));
}

function teamUtilizationAssignedMembers(year, month, tone) {
  return teamUtilizationAssignedEntries(year, month, tone)
    .map(entry => canonicalPersonName(entry.employeeName))
    .filter(Boolean);
}

function teamUtilizationAssignmentSourceLabel(entry) {
  if (!entry) return 'Unassigned';
  const origin = entry.effectiveMonth || entry.monthKey || '';
  const label = (() => {
    const match = String(origin).match(/^(\d{4})-(\d{2})$/);
    if (!match) return origin || 'selected month';
    return `${MN[Number(match[2]) - 1] || ''} ${Number(match[1])}`.trim();
  })();
  if (!entry.assignedTo) {
    if (entry.source === 'manual-unassigned') return `Unassigned manually · ${label}`;
    if (entry.source === 'carried-forward-unassigned') return `Unassigned since ${label}`;
    return 'Never assigned';
  }
  return entry.source === 'carried-forward'
    ? `Carried forward from ${label}`
    : `Manual · ${label}`;
}

function teamUtilizationAssignedMemberBasis(year, month, tone, monthRows = []) {
  const workerHours = teamUtilizationWorkerHours(monthRows);
  return teamUtilizationAssignedEntries(year, month, tone).map(entry => {
    const employee = (S.employees || []).find(e => Number(e.id) === Number(entry.employeeId));
    const worker = canonicalPersonName(entry.employeeName || employee?.name);
    const actual = workerHours.get(worker) || { local: 0, intra: 0 };
    return {
      worker,
      designation: employee?.designation || entry.designation || '',
      localHours: Number(actual.local) || 0,
      intraHours: Number(actual.intra) || 0,
      basis: teamUtilizationAssignmentSourceLabel(entry),
      assignedTo: entry.assignedTo || '',
      source: entry.source || '',
    };
  });
}

function teamUtilizationRowsForMonth(rows, year, month) {
  return (rows || []).filter(row => {
    const parsed = typeof parseMonthlyWorkMonth === 'function' ? parseMonthlyWorkMonth(row.month) : null;
    return parsed && Number(parsed.year) === Number(year) && Number(parsed.month) === Number(month);
  });
}

function teamUtilizationAddBreakdown(target, source) {
  for (const key of Object.keys(target)) target[key] += Number(source?.[key]) || 0;
  return target;
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
    if (TEAM_UTILIZATION_PROJECT_TYPES.has(workType)) record.project += hours;
  }
  return byWorker;
}

function teamUtilizationBillableRowsForMonth(year, month) {
  return teamUtilizationRowsForMonth(S.timesheetBillableRows || [], year, month);
}

function teamUtilizationBillableTypeBreakdown(rows, members) {
  const memberKeys = new Set((members || []).map(personIdentityKey));
  const result = {};
  for (const row of rows || []) {
    if (!memberKeys.has(personIdentityKey(row.worker))) continue;
    const label = normalizeTimesheetWorkType(row.workType) || String(row.workType || 'Billable Work').trim() || 'Billable Work';
    result[label] = (Number(result[label]) || 0) + (Number(row.qty) || 0);
  }
  return result;
}

function teamUtilizationBillableHours(rows, members) {
  const memberKeys = new Set((members || []).map(personIdentityKey));
  let total = 0;
  for (const row of rows || []) {
    if (!memberKeys.has(personIdentityKey(row.worker))) continue;
    total += Number(row.qty) || 0;
  }
  return total;
}

function teamUtilizationMergeBreakdown(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (Number(target[key]) || 0) + (Number(value) || 0);
  }
  return target;
}

function teamUtilizationAggregateActual(rows, members, billableRows = []) {
  const memberKeys = new Set((members || []).map(personIdentityKey));
  const billableHours = teamUtilizationBillableHours(billableRows, members);
  let projectHours = 0;

  for (const row of rows || []) {
    if (!memberKeys.has(personIdentityKey(row.worker))) continue;
    const type = normalizeTimesheetWorkType(row.workType) || row.workType;
    const hours = Number(row.qty) || 0;
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
              <td class="team-utilization-na">NA</td>
              <td class="team-utilization-na">NA</td>
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
              <td class="team-utilization-next-month-cell">
                ${nextMonth ? `
                  <div class="team-utilization-next-month-editor">
                    <label class="team-utilization-next-month-input">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        inputmode="decimal"
                        value="${stats.nextMonthProjectPercent === null || stats.nextMonthProjectPercent === undefined ? '' : esc(+Number(stats.nextMonthProjectPercent).toFixed(1))}"
                        placeholder="Percent"
                        data-team-utilization-project-percent
                        data-team-utilization-team="${tone}"
                        data-team-utilization-tooltip="${tone}:next-month-project-utilization"
                        aria-label="${esc(title)} ${esc(nextMonthName)} Project Utilization percentage"
                      />
                      <span>%</span>
                    </label>
                  </div>
                ` : '<span class="team-utilization-next-month-na team-utilization-na">NA</span>'}
              </td>
              <td class="team-utilization-na">NA</td>
              <td class="team-utilization-na">NA</td>
              <td class="team-utilization-na">NA</td>
            </tr>
            <tr class="team-utilization-comments-row">
              <td></td>
              <th scope="row">Comments:</th>
              <td colspan="4">
                ${nextMonth ? `
                  <input
                    type="text"
                    maxlength="2000"
                    class="team-utilization-comments-input"
                    value="${esc(stats.nextMonthInput?.comments || '')}"
                    placeholder="Write comments"
                    data-team-utilization-comments
                    data-team-utilization-team="${tone}"
                    aria-label="${esc(title)} ${esc(nextMonthName)} comments"
                  />
                ` : '—'}
              </td>
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

function teamUtilizationBuildCombinedMonthTooltipData(allRows, year, month) {
  const monthLabel = `${teamUtilizationMonthLabel(year, month, true)} ${year}`;
  const members = teamUtilizationAssignedMembers(year, month, 'combined');
  const localStaff = teamUtilizationAssignedMembers(year, month, 'local').length;
  const intraStaff = teamUtilizationAssignedMembers(year, month, 'intra').length;
  const monthRows = teamUtilizationRowsForMonth(allRows, year, month);
  const billableRows = teamUtilizationBillableRowsForMonth(year, month);
  const actual = teamUtilizationAggregateActual(monthRows, members, billableRows);
  const billableBreakdown = teamUtilizationBillableTypeBreakdown(billableRows, members);
  const projectBreakdown = teamUtilizationActualTypeBreakdown(monthRows, members);
  const capacityPerStaff = teamUtilizationDefaultMonthlyCapacityPerStaff();
  const capacityDays = teamUtilizationMonthlyTeamCapacity(members.length);
  const billableDays = actual.billableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const projectDays = actual.projectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const billablePercent = teamUtilizationPercent(billableDays, capacityDays);
  const projectPercent = teamUtilizationPercent(projectDays, capacityDays);
  const key = teamUtilizationMonthKey(year, month);

  const capacityRows = [
    `<tr><th>Local PS Staff</th><td>${localStaff}</td></tr>`,
    `<tr><th>Intra-Sourcing Staff</th><td>${intraStaff}</td></tr>`,
    `<tr><th>Combined Staff</th><td>${members.length}</td></tr>`,
    `<tr><th>Capacity / staff</th><td>${capacityPerStaff.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>${Number(getDefaultAnnualWorkdays()).toLocaleString('en-US')} ÷ 12</small></td></tr>`,
    `<tr><th>Combined capacity</th><td>${capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days<small>(${Number(getDefaultAnnualWorkdays()).toLocaleString('en-US')} ÷ 12) × ${members.length}</small></td></tr>`,
  ];
  const billableRowsHtml = Object.entries(billableBreakdown || {})
    .filter(([, hours]) => Number(hours) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
    .map(([label, hours]) => `<tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${(Number(hours) / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`);
  const projectRowsHtml = [
    'Service Delivery - Local PS',
    'Service Delivery - Intrasourcing',
    'Pre - Sales',
    'Training Delivery',
  ].map(label => {
    const hours = Number(projectBreakdown?.[label]) || 0;
    return `<tr><th>${esc(label)}</th><td>${teamUtilizationFormatHours(hours)}<small>${(hours / TEAM_UTILIZATION_HOURS_PER_DAY).toLocaleString('en-US', { maximumFractionDigits: 1 })} days</small></td></tr>`;
  });

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`combined:${key}:billable`, `
    ${teamUtilizationTooltipTitle('Combined Billable Utilization', monthLabel)}
    <div class="team-utilization-tooltip__note">Members are all active resources assigned to either Local PS or Intra-Sourcing in ${esc(monthLabel)}. Billable work comes from uploaded Time Sheet rows where <strong>Billable? = Yes</strong> for those members.</div>
    ${billableRowsHtml.length ? teamUtilizationTooltipRows(billableRowsHtml) : '<div class="team-utilization-tooltip__note">No Billable? = Yes Time Sheet hours were found for the combined team in this month.</div>'}
    ${teamUtilizationTooltipRows(capacityRows)}
    <div class="team-utilization-tooltip__formula">Billable days = ${teamUtilizationFormatHours(actual.billableHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${billableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
    <div class="team-utilization-tooltip__formula">${billableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} ÷ ${capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} × 100 = <strong>${teamUtilizationFormatPercent(billablePercent)}</strong></div>`);

  TEAM_UTILIZATION_TOOLTIP_DATA.set(`combined:${key}:project`, `
    ${teamUtilizationTooltipTitle('Combined Project Utilization', monthLabel)}
    <div class="team-utilization-tooltip__note">Project work includes Local PS + Intra-Sourcing + Pre-Sales + Training Delivery Time Sheet hours for all resources assigned to either PS team in this month.</div>
    ${teamUtilizationTooltipRows(projectRowsHtml)}
    ${teamUtilizationTooltipRows(capacityRows)}
    <div class="team-utilization-tooltip__formula">Project days = ${teamUtilizationFormatHours(actual.projectHours)} ÷ ${TEAM_UTILIZATION_HOURS_PER_DAY} = <strong>${projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days</strong></div>
    <div class="team-utilization-tooltip__formula">${projectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} ÷ ${capacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} × 100 = <strong>${teamUtilizationFormatPercent(projectPercent)}</strong></div>`);
}

function buildCombinedTeamUtilizationSection(stats, allRows, reportMonth) {
  teamUtilizationBuildTooltipData('combined', stats, reportMonth, null);
  const series = teamUtilizationBuildFiscalChartSeries(allRows, 'combined');
  const months = fiscalMonths(S.matrixFiscalYear);
  const reportKey = teamUtilizationMonthKey(reportMonth.year, reportMonth.month);
  const monthlyRows = months.map((month, index) => {
    const monthKey = teamUtilizationMonthKey(month.y, month.m);
    teamUtilizationBuildCombinedMonthTooltipData(allRows, month.y, month.m);
    const localStaff = teamUtilizationAssignedMembers(month.y, month.m, 'local').length;
    const intraStaff = teamUtilizationAssignedMembers(month.y, month.m, 'intra').length;
    const combinedStaff = teamUtilizationAssignedMembers(month.y, month.m, 'combined').length;
    return `<tr class="${monthKey === reportKey ? 'is-current' : ''}">
      <th scope="row">${esc(teamUtilizationMonthLabel(month.y, month.m, true))} ${month.y}</th>
      <td>${localStaff}</td>
      <td>${intraStaff}</td>
      <td><strong>${combinedStaff}</strong></td>
      <td class="team-utilization-combined-calc" data-team-utilization-tooltip="combined:${monthKey}:billable" tabindex="0">${teamUtilizationFormatPercent(series.billableValues[index])}</td>
      <td class="team-utilization-combined-calc" data-team-utilization-tooltip="combined:${monthKey}:project" tabindex="0">${teamUtilizationFormatPercent(series.projectValues[index])}</td>
    </tr>`;
  }).join('');

  const projectVariance = stats.ytdProjectPercent - TEAM_UTILIZATION_FY_PROJECT_TARGET;
  const reportMonthLabel = `${teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true)} ${reportMonth.year}`;
  const localStaff = teamUtilizationAssignedMembers(reportMonth.year, reportMonth.month, 'local').length;
  const intraStaff = teamUtilizationAssignedMembers(reportMonth.year, reportMonth.month, 'intra').length;
  const monthBillableDays = stats.monthBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const monthProjectDays = stats.monthProjectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const capacityLabel = stats.monthCapacityDays.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const ytdStart = stats.ytdMonths?.[0];
  const ytdEnd = stats.ytdMonths?.[stats.ytdMonths.length - 1];
  const ytdShortLabel = ytdStart && ytdEnd
    ? `${teamUtilizationMonthLabel(ytdStart.y, ytdStart.m, true)}–${teamUtilizationMonthLabel(ytdEnd.y, ytdEnd.m, true)}`
    : 'FY YTD';

  return `
    <section class="team-utilization-combined-panel">
      <div class="team-utilization-combined-heading">
        <div>
          <h3>Combined PS Utilization – Local PS + Intra-Sourcing</h3>
          <p>Utilization = Time Sheet days ÷ combined team capacity × 100. Capacity = (${Number(getDefaultAnnualWorkdays()).toLocaleString('en-US')} ÷ 12) × combined staff. Hover KPI cards or monthly percentages to see the full calculation.</p>
        </div>
        <span class="team-utilization-chart-period">${esc(fiscalYearDisplayLabel(S.matrixFiscalYear))}</span>
      </div>

      <div class="team-utilization-combined-kpis">
        <div class="team-utilization-combined-kpi-trigger" data-team-utilization-tooltip="combined:staff" tabindex="0"><span>Combined Staff</span><strong>${stats.staffCount}</strong><small>${localStaff} Local PS + ${intraStaff} Intra · ${esc(reportMonthLabel)}</small></div>
        <div class="team-utilization-combined-kpi-trigger" data-team-utilization-tooltip="combined:billable-utilization" tabindex="0"><span>This Month Billable (${esc(reportMonthLabel)})</span><strong>${teamUtilizationFormatPercent(stats.monthBillablePercent)}</strong><small>${monthBillableDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days ÷ ${capacityLabel} capacity days</small></div>
        <div class="team-utilization-combined-kpi-trigger" data-team-utilization-tooltip="combined:project-utilization" tabindex="0"><span>This Month Project (${esc(reportMonthLabel)})</span><strong>${teamUtilizationFormatPercent(stats.monthProjectPercent)}</strong><small>${monthProjectDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days ÷ ${capacityLabel} capacity days</small></div>
        <div class="team-utilization-combined-kpi-trigger" data-team-utilization-tooltip="combined:ytd-billable-utilization" tabindex="0"><span>YTD Billable (${esc(ytdShortLabel)})</span><strong>${teamUtilizationFormatPercent(stats.ytdBillablePercent)}</strong><small>YTD billable days ÷ YTD combined capacity</small></div>
        <div class="team-utilization-combined-kpi-trigger" data-team-utilization-tooltip="combined:ytd-project-utilization" tabindex="0"><span>YTD Project (${esc(ytdShortLabel)})</span><strong>${teamUtilizationFormatPercent(stats.ytdProjectPercent)}</strong><small>YTD project days ÷ YTD combined capacity</small></div>
        <div class="team-utilization-combined-kpi-trigger" data-team-utilization-tooltip="combined:variance" tabindex="0"><span>FY Target / Var</span><strong>${TEAM_UTILIZATION_FY_PROJECT_TARGET}% <em class="${projectVariance >= 0 ? 'is-positive' : 'is-negative'}">${teamUtilizationFormatVariance(projectVariance)}</em></strong><small>YTD Project − ${TEAM_UTILIZATION_FY_PROJECT_TARGET}% target</small></div>
      </div>

      <div class="team-utilization-combined-layout">
        <div class="team-utilization-combined-table-wrap">
          <table class="team-utilization-combined-table">
            <thead><tr><th>Month</th><th>Local PS Staff</th><th>Intra-Sourcing Staff</th><th>Combined Staff</th><th>Billable Utilization</th><th>Project Utilization</th></tr></thead>
            <tbody>${monthlyRows}</tbody>
          </table>
        </div>

        <div class="team-utilization-chart-card team-utilization-chart-card--combined">
          <div class="team-utilization-chart-heading">
            <div><strong>Combined PS Utilization Trend</strong><span>Local PS + Intra-Sourcing team utilization across April–March · hover the table percentages for calculation details</span></div>
            <span class="team-utilization-chart-period">${esc(fiscalYearDisplayLabel(S.matrixFiscalYear))}</span>
          </div>
          <div class="team-utilization-chart-wrap team-utilization-chart-wrap--combined">
            <canvas id="teamUtilizationChart-combined" aria-label="Combined Local PS and Intra-Sourcing utilization chart"></canvas>
          </div>
        </div>
      </div>
    </section>`;
}

function teamUtilizationBuildStats(tone, allRows, reportMonth, ytdMonths, nextMonth) {
  const members = teamUtilizationAssignedMembers(reportMonth.year, reportMonth.month, tone);
  const monthRows = teamUtilizationRowsForMonth(allRows, reportMonth.year, reportMonth.month);
  const memberBasis = teamUtilizationAssignedMemberBasis(reportMonth.year, reportMonth.month, tone, monthRows);
  const monthBillableRows = teamUtilizationBillableRowsForMonth(reportMonth.year, reportMonth.month);
  const monthlyActual = teamUtilizationAggregateActual(monthRows, members, monthBillableRows);
  const monthTypeBreakdown = teamUtilizationActualTypeBreakdown(monthRows, members);
  const monthBillableTypeBreakdown = teamUtilizationBillableTypeBreakdown(monthBillableRows, members);
  const monthCapacityDays = teamUtilizationMonthlyTeamCapacity(members.length);
  const monthBillableDays = monthlyActual.billableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const monthProjectDays = monthlyActual.projectHours / TEAM_UTILIZATION_HOURS_PER_DAY;

  const ytdTypeBreakdown = Object.fromEntries([
    'Service Delivery - Intrasourcing',
    'Service Delivery - Local PS',
    'Pre - Sales',
    'Training Delivery',
  ].map(label => [label, 0]));
  let ytdBillableHours = 0;
  const ytdBillableTypeBreakdown = {};
  let ytdProjectHours = 0;
  let ytdCapacityDays = 0;
  const ytdCapacityBreakdown = [];

  for (const item of ytdMonths || []) {
    const monthMembers = teamUtilizationAssignedMembers(item.y, item.m, tone);
    const rows = teamUtilizationRowsForMonth(allRows, item.y, item.m);
    const billableRows = teamUtilizationBillableRowsForMonth(item.y, item.m);
    const actual = teamUtilizationAggregateActual(rows, monthMembers, billableRows);
    const breakdown = teamUtilizationActualTypeBreakdown(rows, monthMembers);
    const billableBreakdown = teamUtilizationBillableTypeBreakdown(billableRows, monthMembers);
    const capacityDays = teamUtilizationMonthlyTeamCapacity(monthMembers.length);
    ytdBillableHours += actual.billableHours;
    teamUtilizationMergeBreakdown(ytdBillableTypeBreakdown, billableBreakdown);
    ytdProjectHours += actual.projectHours;
    ytdCapacityDays += capacityDays;
    teamUtilizationAddBreakdown(ytdTypeBreakdown, breakdown);
    ytdCapacityBreakdown.push({
      year: item.y,
      month: item.m,
      staffCount: monthMembers.length,
      capacityDays,
    });
  }

  const ytdBillableDays = ytdBillableHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdProjectDays = ytdProjectHours / TEAM_UTILIZATION_HOURS_PER_DAY;
  const ytdBillablePercent = teamUtilizationPercent(ytdBillableDays, ytdCapacityDays);
  const ytdProjectPercent = teamUtilizationPercent(ytdProjectDays, ytdCapacityDays);

  let nextMonthDetails = {
    percent: null,
    capacityDays: 0,
    projectDays: 0,
    projectHours: 0,
    typeBreakdown: {},
    hasActual: false,
    staffCount: 0,
  };
  if (nextMonth) {
    const nextMembers = teamUtilizationAssignedMembers(nextMonth.y, nextMonth.m, tone);
    const nextRows = teamUtilizationRowsForMonth(allRows, nextMonth.y, nextMonth.m);
    nextMonthDetails = teamUtilizationNextMonthActualDetails(nextMembers, nextRows);
    nextMonthDetails.staffCount = nextMembers.length;
  }

  const nextMonthInput = teamUtilizationMonthInput(tone, nextMonth);
  const nextMonthManualUtilizationPercent = nextMonthInput.utilizationPercent === null || nextMonthInput.utilizationPercent === undefined
    ? null
    : Number(nextMonthInput.utilizationPercent);

  return {
    tone,
    staffCount: members.length,
    members: [...members],
    memberBasis,
    monthTypeBreakdown,
    monthBillableTypeBreakdown,
    ytdTypeBreakdown,
    ytdBillableTypeBreakdown,
    ytdMonths: [...(ytdMonths || [])],
    ytdCapacityBreakdown,
    monthBillableHours: monthlyActual.billableHours,
    monthProjectHours: monthlyActual.projectHours,
    ytdBillableHours,
    ytdProjectHours,
    monthCapacityDays,
    ytdCapacityDays,
    monthBillablePercent: teamUtilizationPercent(monthBillableDays, monthCapacityDays),
    monthProjectPercent: teamUtilizationPercent(monthProjectDays, monthCapacityDays),
    ytdBillablePercent,
    ytdProjectPercent,
    projectVariance: ytdProjectPercent - TEAM_UTILIZATION_FY_PROJECT_TARGET,
    nextMonthDetails,
    nextMonthInput,
    nextMonthManualUtilizationPercent,
    nextMonthProjectPercent: nextMonthManualUtilizationPercent === null
      ? nextMonthDetails.percent
      : nextMonthManualUtilizationPercent,
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
    const monthRows = teamUtilizationRowsForMonth(allRows, month.y, month.m);
    const members = teamUtilizationAssignedMembers(month.y, month.m, tone);
    const monthBillableRows = teamUtilizationBillableRowsForMonth(month.y, month.m);
    const actual = teamUtilizationAggregateActual(monthRows, members, monthBillableRows);
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
  const chartKey = tone === 'local'
    ? 'teamUtilizationLocal'
    : tone === 'intra'
      ? 'teamUtilizationIntra'
      : 'teamUtilizationCombined';
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
  teamUtilizationRenderChart('combined', allRows);
}

function renderTeamUtilizationSummary() {
  TEAM_UTILIZATION_TOOLTIP_DATA.clear();
  TEAM_UTILIZATION_TOOLTIP_DATA.set('calculation-basis', teamUtilizationBuildCalculationBasisTooltip());
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
  const monthRows = teamUtilizationRowsForMonth(allRows, reportMonth.year, reportMonth.month);

  const reportMonthText = document.getElementById('teamUtilizationReportMonth');
  if (reportMonthText) {
    const monthLabel = `${teamUtilizationMonthLabel(reportMonth.year, reportMonth.month, true)} ${reportMonth.year}`;
    reportMonthText.textContent = monthRows.length
      ? `${monthLabel}: ${monthRows.length} actual Time Sheet row${monthRows.length === 1 ? '' : 's'}`
      : `${monthLabel}: no Time Sheet actuals`;
  }

  const localStats = teamUtilizationBuildStats(
    'local',
    allRows,
    reportMonth,
    ytdMonths,
    nextMonth,
  );
  const intraStats = teamUtilizationBuildStats(
    'intra',
    allRows,
    reportMonth,
    ytdMonths,
    nextMonth,
  );
  const combinedStats = teamUtilizationBuildStats(
    'combined',
    allRows,
    reportMonth,
    ytdMonths,
    nextMonth,
  );

  content.innerHTML = `
    <div class="team-utilization-grid">
      ${buildTeamUtilizationSection('Utilization – Local PS Team', 'local', localStats, reportMonth, nextMonth)}
      ${buildTeamUtilizationSection('Utilization – Intra-Sourcing PS Team', 'intra', intraStats, reportMonth, nextMonth)}
    </div>
    ${buildCombinedTeamUtilizationSection(combinedStats, allRows, reportMonth)}`;

  teamUtilizationBindManualInputs(
    content,
    { local: localStats, intra: intraStats },
    nextMonth,
  );
  teamUtilizationRenderCharts(allRows);
}
