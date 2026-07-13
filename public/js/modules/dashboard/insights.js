/* Workforce Allocation Dashboard — dashboard/insights.js */

/* ── local utilization (for period selector) ─────────────────── */
function calcLocalUtil(period) {
  // Utilization = sum(percentage/100 per slot) / TOTAL_PERIOD_WEEKS * 100
  // Full day slot = 100%, half day = 50% → weight 1.0 or 0.5
  const TOTAL_FY_WEEKS = 48; // 12 months × 4 weeks
  const now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate();
  const curW = curD <= 7 ? 1 : curD <= 14 ? 2 : curD <= 21 ? 3 : 4;
  const fy = S.fiscalYear;
  let rel, totalWeeks;

  if (period === 'week') {
    rel = S.assignments.filter(a => a.year === curY && a.month === curM && a.week === curW);
    totalWeeks = 1;
  } else if (period === 'month') {
    rel = S.assignments.filter(a => a.year === curY && a.month === curM);
    totalWeeks = 4;
  } else {
    rel = S.assignments.filter(a =>
      (a.year === fy && a.month >= 4) || (a.year === fy + 1 && a.month <= 3)
    );
    totalWeeks = TOTAL_FY_WEEKS;
  }

  // Sum weighted slots per employee (percentage/100 per slot)
  const empWeighted = {};
  for (const a of rel) {
    empWeighted[a.employee_id] = (empWeighted[a.employee_id] || 0) + (a.percentage / 100);
  }

  const active = getActiveEmployees();
  const all = active.map(e => ({
    id: e.id, name: e.name, dept: e.dept,
    utilization: +Math.min(((empWeighted[e.id] || 0) / totalWeeks * 100), 100).toFixed(1)
  })).sort((a, b) => a.utilization - b.utilization);

  return { all, top_available: all.slice(0, 5), high_workload: [...all].reverse().slice(0, 5) };
}

function setInsightsPeriod(card, period) {
  if (card === 'high') S.insightsPeriodHigh = period;
  else S.insightsPeriodLow = period;
  document.querySelectorAll(`[data-card="${card}"][data-pd]`).forEach(b => b.classList.toggle('active', b.dataset.pd === period));
  const util = calcLocalUtil(period);
  const empty = '<p class="text-sm text-gray-400 text-center py-4">No data</p>';
  if (card === 'high') document.getElementById('highWorkloadList').innerHTML = util.high_workload.map(insightRow).join('') || empty;
  else document.getElementById('topAvailableList').innerHTML = util.top_available.map(insightRow).join('') || empty;
}

function renderInsights() {
  const empty = '<p class="text-sm text-gray-400 text-center py-4">No data</p>';
  document.getElementById('highWorkloadList').innerHTML = calcLocalUtil(S.insightsPeriodHigh).high_workload.map(insightRow).join('') || empty;
  document.getElementById('topAvailableList').innerHTML = calcLocalUtil(S.insightsPeriodLow).top_available.map(insightRow).join('') || empty;
}

function openEmployeeDetailModal(empId) {
  const emp = S.employees.find(e => e.id === empId);
  if (!emp) return;
  const fy = S.fiscalYear;
  // All assignments for this employee in the fiscal year
  const empAsgs = S.assignments.filter(a => a.employee_id === empId &&
    ((a.year === fy && a.month >= 4) || (a.year === fy + 1 && a.month <= 3))
  ).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.week - b.week);

  // Build per-project totals
  const projMap = {};
  for (const a of empAsgs) {
    if (!projMap[a.project_id]) {
      const proj = S.projects.find(p => p.id === a.project_id);
      projMap[a.project_id] = { proj, weeks: [], totalPct: 0, slotCount: 0 };
    }
    projMap[a.project_id].weeks.push(a);
    projMap[a.project_id].totalPct += a.percentage;
    projMap[a.project_id].slotCount++;
  }

  // Weekly breakdown per project
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekLabel = a => `${MONTHS[a.month - 1]} ${a.year} W${a.week}`;

  // Overall utilization for FY
  // Utilization = weighted slots / 48 FY weeks * 100
  const TOTAL_FY_WEEKS = 48;
  const weightedTotal = empAsgs.reduce((s, a) => s + a.percentage / 100, 0);
  const avgUtil = +Math.min((weightedTotal / TOTAL_FY_WEEKS * 100), 100).toFixed(1);
  // Peak week = highest single week's combined percentage
  const wMap = {};
  for (const a of empAsgs) { const k = `${a.year}|${a.month}|${a.week}`; wMap[k] = (wMap[k] || 0) + a.percentage; }
  const maxUtil = Object.values(wMap).length ? Math.max(...Object.values(wMap)) : 0;
  const assignedWeeks = Object.keys(wMap).length;

  const projCards = Object.values(projMap).map(({ proj, weeks, totalPct, slotCount }) => {
    const name = proj ? esc(proj.name) : 'Unknown';
    const code = proj ? esc(proj.code || '') : '';
    const avgW = slotCount ? +(totalPct / slotCount).toFixed(1) : 0;
    const weekRows = weeks.map(a =>
      `<div class="flex items-center justify-between py-0.5 text-xs text-gray-600">
        <span class="mono text-gray-400 w-28 flex-shrink-0">${weekLabel(a)}</span>
        <div class="flex-1 mx-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full bg-indigo-400" style="width:${Math.min(a.percentage, 100)}%"></div>
        </div>
        <span class="font-semibold w-10 text-right">${a.percentage}%</span>
      </div>`
    ).join('');
    return `<div class="rounded-xl border border-gray-100 bg-gray-50 p-3 mb-3">
      <div class="flex items-center justify-between mb-1">
        <div>
          <span class="text-xs font-bold text-blue-600 mono">${code}</span>
          <div class="text-sm font-semibold text-gray-900">${name}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-400">${slotCount} week slot${slotCount === 1 ? '' : 's'}</div>
          <div class="text-sm font-bold text-indigo-600">${avgW}% avg</div>
        </div>
      </div>
      <div class="mt-2 space-y-0.5">${weekRows}</div>
    </div>`;
  }).join('') || '<p class="text-xs text-gray-400 py-4 text-center">No assignments this FY</p>';

  const uClr = avgUtil >= 80 ? 'text-red-600' : avgUtil >= 50 ? 'text-amber-600' : 'text-emerald-600';
  const initials = inits(emp.name);
  const badge = ub(avgUtil);

  openModal(
    mHdr(`${emp.name} — FY${fy + 1} Workload`, `${emp.dept || '—'} · ${emp.email || '—'}`)
    + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">
        <!-- Summary cards -->
        <div class="grid grid-cols-4 gap-3 mb-5">
          <div class="bg-indigo-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold ${uClr}">${avgUtil}%</div>
            <div class="text-xs text-gray-500 mt-0.5">FY Utilization</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-gray-800">${assignedWeeks}</div>
            <div class="text-xs text-gray-500 mt-0.5">Weeks Assigned</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-gray-800">${maxUtil}%</div>
            <div class="text-xs text-gray-500 mt-0.5">Peak Week</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-gray-800">${Object.keys(projMap).length}</div>
            <div class="text-xs text-gray-500 mt-0.5">Projects</div>
          </div>
        </div>
        <div class="text-xs text-gray-400 mb-3 px-1">
          FY Utilization = weeks assigned (weighted by %) ÷ 48 FY weeks × 100 &nbsp;·&nbsp; Half-day slot = 0.5 weeks
        </div>
        <!-- Per-project breakdown -->
        <div class="text-sm font-semibold text-gray-700 mb-2">Project Assignments</div>
        ${projCards}
      </div>
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-2xl'
  );
}

