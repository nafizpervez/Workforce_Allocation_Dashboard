/* ================================================================
   Workforce Allocation Dashboard — app.js
   ================================================================ */

/* ================================================================ STATE */
const S = {
  psTypeData: [],
  fiscalYear: 2026,
  employees: [], projects: [], assignments: [],
  matrix: {}, employeeUtil: new Map(), charts: {},
  searchQuery: '',
  insightsPeriodHigh: 'fiscal',
  insightsPeriodLow: 'fiscal',
  newLogoFilter: 'COMBINED',
  nlProductFilter: new Set(['ALL']),  // multi-select category filter for Deal Acquisition + Revenue chart
  newLogoChartData: {},          // keyed by category: { ALL: [...], ALLCLEAN: [...], ... }
  psRevenueData: {},             // keyed by category
  /* matrix filters */
  matrixProjectFilter: null, matrixResourceFilter: null,
  matrixMonthFilter: '', matrixStageFilt: '', matrixAmountFilt: '',
  matrixCloseDateFilt: '', matrixProjCloseFilt: '',
  matrixSortHigh: false, matrixSortLow: false, matrixSortAssigned: false,
  /* pipeline filters */
  pipelineStageFilt: '', pipelineDealStatusFilt: '', pipelineAmountFilt: '', pipelineCloseFilt: '', pipelineProjCloseFilt: '', pipelineSortAssigned: false,
  pipelineProdFamilyFilt: '', pipelineProductTypeFilt: '', pipelineSearch: '',
  /* running filters */
  runAmountFilt: '', runCloseFilt: '', runProjCloseFilt: '', runSortAssigned: false,
  runProdFamilyFilt: '', runSearch: '', runProductTypeFilt: '',
  /* cached data for re-filter */
  lastRunningData: [],
  /* uploaded Time Sheet Excel summary */
  timesheetRows: [],
  timesheetFileName: '',
  timesheetSheetName: '',
  individualSummaryMonthFilter: '',
  workSummaryTab: 'team',
  resourceMatrixTab: 'matrix',
};

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STAGES = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won', 'Closed Lost'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PCOLORS = ['#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF'];
const DEPT_COLORS = { 'Solution': '#2563EB', 'Professional Services': '#8B5CF6', 'Finance': '#14B8A6', 'Sales': '#F59E0B', 'Operations': '#10B981', 'Management': '#EC4899' };
const STAGE_COLOR = { 'Prospect': '#6B7280', 'Qualify': '#0EA5E9', 'Validate': '#8B5CF6', 'Presentation - Solve': '#EC4899', 'Proposal': '#F59E0B', 'Negotiate': '#F97316', 'Closed Won': '#10B981', 'Closed Lost': '#DC2626' };
const STAGE_PILL = { 'Prospect': 'bg-gray-100 text-gray-700', 'Qualify': 'bg-sky-100 text-sky-700', 'Validate': 'bg-purple-100 text-purple-700', 'Presentation - Solve': 'bg-pink-100 text-pink-700', 'Proposal': 'bg-amber-100 text-amber-700', 'Negotiate': 'bg-orange-100 text-orange-700', 'Closed Won': 'bg-green-100 text-green-700', 'Closed Lost': 'bg-red-100 text-red-700' };
const PRIORITY_COLOR = { Critical: '#DC2626', High: '#D97706', Medium: '#2563EB', Low: '#6B7280' };
const PRIORITY_PILL = { Critical: 'bg-red-100 text-red-700', High: 'bg-orange-100 text-orange-700', Medium: 'bg-blue-100 text-blue-700', Low: 'bg-gray-100 text-gray-700' };

/* ── helpers ─────────────────────────────────────────────────── */
function fiscalMonths(fy) { return [{ y: fy, m: 4 }, { y: fy, m: 5 }, { y: fy, m: 6 }, { y: fy, m: 7 }, { y: fy, m: 8 }, { y: fy, m: 9 }, { y: fy, m: 10 }, { y: fy, m: 11 }, { y: fy, m: 12 }, { y: fy + 1, m: 1 }, { y: fy + 1, m: 2 }, { y: fy + 1, m: 3 }].map(x => ({ ...x, label: `${MN[x.m - 1]} ${x.y}` })); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uc(u) { return u > 100 ? '#DC2626' : u > 85 ? '#D97706' : u > 50 ? '#2563EB' : '#059669'; }
function ub(u) { return u > 100 ? 'bg-red-100 text-red-700' : u > 85 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'; }
function us(u) { return u > 100 ? 'Over Capacity' : u > 85 ? 'High Load' : 'Available'; }
function inits(n) { return n.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase(); }
function shortCustomerName(name) {
  const s = String(name || '').trim();
  const m = s.match(/\(([^()]+)\)\s*$/);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  return s;
}
function fmtUsd(n) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD'; }

function parseDateInputLocal(value) {
  if (!value) return null;

  const parts = String(value).split('-').map(Number);

  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function formatDateInputLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function addDaysLocal(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function getMatrixSlotFromDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let week = Math.floor((day - 1) / 7) + 1;
  if (week > 4) week = 4;

  return { year, month, week };
}

function expandDateRange(start, end) {
  const out = [];
  const seen = new Set();
  const s = parseDateInputLocal(start);
  const e = parseDateInputLocal(end || start);

  if (!s || !e || e < s) return out;

  for (let cur = new Date(s.getFullYear(), s.getMonth(), s.getDate()); cur <= e; cur = addDaysLocal(cur, 1)) {
    const slot = getMatrixSlotFromDate(cur);
    const k = `${slot.year}-${slot.month}-${slot.week}`;

    if (!seen.has(k)) {
      seen.add(k);
      out.push(slot);
    }
  }

  return out;
}

function weekDateRange(year, month, week) {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const startDay = ((week - 1) * 7) + 1;
  const endDay = week >= 4 ? lastDayOfMonth : week * 7;

  return {
    start: formatDateInputLocal(new Date(year, month - 1, startDay)),
    end: formatDateInputLocal(new Date(year, month - 1, endDay)),
  };
}

/* ── filter helpers ──────────────────────────────────────────── */
function parseAmountRange(r) { if (!r) return null; if (r.endsWith('+')) return [+r.slice(0, -1), Infinity]; const p = r.split('-'); return [+p[0], +p[1]]; }

function matchDateFilter(dateStr, filter) {
  if (!dateStr || !filter) return true;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (isNaN(d)) return false;
  if (filter === 'overdue') return d < now;
  if (filter === 'thismonth') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (filter === 'next3months') { const t = new Date(now); t.setMonth(t.getMonth() + 3); return d >= now && d <= t; }
  if (filter === 'thisyear') return d.getFullYear() === now.getFullYear();
  return true;
}

function matchPipelineCloseDateFilter(dateStr, filter) {
  if (!dateStr || !filter) return true;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(d)) return false;
  const addDays = (base, days) => {
    const t = new Date(base);
    t.setDate(t.getDate() + days);
    t.setHours(23, 59, 59, 999);
    return t;
  };
  if (filter === 'overdue') return d < today;
  if (filter === 'thismonth') return d >= today && d <= addDays(today, 30);
  if (filter === 'next2months') return d >= today && d <= addDays(today, 60);
  if (filter === 'next3months') return d >= today && d <= addDays(today, 90);
  if (filter === 'thisyear') {
    const yearEnd = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
    return d >= today && d <= yearEnd;
  }
  return true;
}

function getAmountOk(opp_amount, filt) { if (!filt) return true; const [min, max] = parseAmountRange(filt); const a = Number(opp_amount) || 0; return a >= min && (max === Infinity || a <= max); }

function normalizeProductTypeName(value) {
  const s = String(value || '').trim();
  const u = s.toUpperCase().replace(/\s+/g, ' ');
  if (u.includes('PS PROJECT IMPLEMENTATION') || u.includes('PS PROJECT IMPLEMENT') || u.includes('PS PROJECT IMPLEMETATION')) return 'PS Project Implementation';
  if (u.includes('PS SYSTEM SUPPORT')) return 'PS System Support';
  return s;
}

function sameProductType(actual, selected) {
  if (!selected) return true;
  return normalizeProductTypeName(actual).toUpperCase() === normalizeProductTypeName(selected).toUpperCase();
}

function uniqueNormalizedProductTypes(list) {
  const m = new Map();
  for (const item of list || []) {
    const label = normalizeProductTypeName(item.product_name);
    if (!label) continue;
    const key = label.toUpperCase();
    if (!m.has(key)) m.set(key, label);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}

function getFteCount(projId) { return new Set(S.assignments.filter(a => a.project_id === projId).map(a => a.employee_id)).size; }

function getAssignedTaskCount(projId) {
  const fy = S.fiscalYear;
  return S.assignments.filter(a => a.project_id === projId && ((a.year === fy && a.month >= 4) || (a.year === fy + 1 && a.month <= 3))).length;
}

function getRunningSortDate(row) {
  const dateStr = row.closing_date || row.project_closing_date || row.end_date;
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : null;
  return d && !isNaN(d) ? d : new Date('9999-12-31T00:00:00');
}

function getRunningYearRank(row) {
  const d = getRunningSortDate(row);
  const y = d.getFullYear();
  const currentYear = new Date().getFullYear();
  if (y > currentYear) return y - currentYear - 1;
  if (y === currentYear) return 1000;
  return 1000 + (currentYear - y);
}

function sortRunningProjects(a, b) {
  const rankA = getRunningYearRank(a);
  const rankB = getRunningYearRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return getRunningSortDate(a) - getRunningSortDate(b);
}

function applyPipelineFilters(list) {
  const q = (S.pipelineSearch || '').toLowerCase().trim();
  return list.filter(p => {
    if (p.stage === 'Closed Lost') return false;
    if (S.pipelineDealStatusFilt && p.deal_status !== S.pipelineDealStatusFilt) return false;
    if (S.pipelineStageFilt && p.stage !== S.pipelineStageFilt) return false;
    if (!getAmountOk(p.opp_amount, S.pipelineAmountFilt)) return false;
    if (!matchPipelineCloseDateFilter(p.end_date, S.pipelineCloseFilt)) return false;
    if (!matchDateFilter(p.project_closing_date, S.pipelineProjCloseFilt)) return false;
    if (S.pipelineProdFamilyFilt && p.product_family !== S.pipelineProdFamilyFilt) return false;
    if (S.pipelineProductTypeFilt && !sameProductType(p.product_name, S.pipelineProductTypeFilt)) return false;
    if (q && !(p.name || '').toLowerCase().includes(q) && !(p.code || '').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (!S.pipelineSortAssigned) return 0;
    const diff = getAssignedTaskCount(b.id) - getAssignedTaskCount(a.id);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function applyRunningFilters(list) {
  const q = (S.runSearch || '').toLowerCase().trim();
  return list.filter(d => {
    if (!getAmountOk(d.opp_amount, S.runAmountFilt)) return false;
    const cd = d.closing_date || d.project_closing_date || d.end_date;
    if (S.runCloseFilt && !matchDateFilter(cd, S.runCloseFilt)) return false;
    if (S.runProjCloseFilt && !matchDateFilter(d.project_closing_date, S.runProjCloseFilt)) return false;
    if (S.runProdFamilyFilt && d.product_family !== S.runProdFamilyFilt) return false;
    if (S.runProductTypeFilt && !sameProductType(d.product_name, S.runProductTypeFilt)) return false;
    if (q && !(d.name || '').toLowerCase().includes(q) && !(d.code || '').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (S.runSortAssigned) {
      const diff = getAssignedTaskCount(b.id) - getAssignedTaskCount(a.id);
      if (diff !== 0) return diff;
    }
    return sortRunningProjects(a, b);
  });
}

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

  const active = S.employees.filter(e => e.active !== 0);
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

/* ================================================================ API */
async function api(method, path, body) { const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.status); } return r.json(); }

/* ================================================================ TOASTS */
function toast(msg, kind = 'success') { const root = document.getElementById('toasts'), c = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-gray-800' }[kind]; const el = document.createElement('div'); el.className = `toast-enter ${c} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 max-w-xs`; const ic = kind === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>' : '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'; el.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ic}</svg><span>${esc(msg)}</span>`; root.appendChild(el); setTimeout(() => { el.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => el.remove(), 250); }, 2800); }

/* ================================================================ LOAD */
async function loadAll() {
  try {
    const fy = S.fiscalYear;
    const [emps, projs, asgs, stats, trends, wl, util, pipe, dl, nlChart, psRevChart, psTypeChart] = await Promise.all([
      api('GET', '/api/employees'), api('GET', '/api/projects'),
      api('GET', `/api/assignments?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/stats?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/trends?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/workload?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/utilization?fiscalYear=${fy}`),
      api('GET', '/api/dashboard/pipeline'),
      api('GET', '/api/dashboard/deadlines'),
      api('GET', '/api/dashboard/new-logo-chart'),
      api('GET', '/api/dashboard/ps-revenue-chart'),
      api('GET', '/api/dashboard/ps-type-chart'),
    ]);
    S.employees = emps; S.projects = projs; S.assignments = asgs;
    buildMatrix();
    S.employeeUtil = new Map(util.all.map(u => [u.id, u.utilization]));
    renderStats(stats);
    renderMatrix();
    renderTrends(trends);
    renderWorkload(wl);
    renderAllocation(wl);
    renderNewLogoChart(nlChart);
    // Sync initial category button states
    document.querySelectorAll('.nl-prod-btn').forEach(b => {
      const isActive = S.nlProductFilter.has(b.dataset.prod);
      b.style.background = isActive ? '#1e40af' : 'white';
      b.style.color = isActive ? 'white' : '#374151';
      b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
    });
    S.psRevenueData = psRevChart;  // keyed by category
    S.psTypeData = psTypeChart;
    renderInsights();
    S.lastRunningData = dl;
    applyAndRenderRunning();
    renderServicePipeline(projs);
    populateMatrixFilter();
    populatePipelineStageFilter();
    populateProductFamilyDropdowns();

    await loadSavedTimesheetFromDb();

    initCardDrag();
  } catch (e) { toast(e.message, 'error'); console.error(e); }
}

function buildMatrix() { S.matrix = {}; for (const a of S.assignments) { const k = `${a.year}-${a.month}-${a.week}`; S.matrix[a.employee_id] ||= {}; (S.matrix[a.employee_id][k] ||= []).push(a); } }

/* ================================================================ FILTER POPULATION */
function populateMatrixFilter() {
  const activeEmployeeIds = getActiveEmployeeIdSet();

  if (S.matrixResourceFilter && !activeEmployeeIds.has(+S.matrixResourceFilter)) {
    S.matrixResourceFilter = null;
  }

  const ps = document.getElementById('matrixProjectFilter');
  if (ps) {
    const pids = new Set(
      S.assignments
        .filter(a => activeEmployeeIds.has(a.employee_id))
        .map(a => a.project_id)
    );

    ps.innerHTML =
      '<option value="">All Projects</option>' +
      S.projects
        .filter(p => pids.has(p.id))
        .map(p => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}</option>`)
        .join('');

    ps.value = String(S.matrixProjectFilter || '');
  }

  const rs = document.getElementById('matrixResourceFilter');
  if (rs) {
    rs.innerHTML =
      '<option value="">All Resources</option>' +
      getActiveEmployees()
        .map(e => `<option value="${e.id}">${esc(e.name)}</option>`)
        .join('');

    rs.value = String(S.matrixResourceFilter || '');
  }

  const ms = document.getElementById('matrixMonthFilter');
  if (ms && ms.options.length <= 1) {
    ms.innerHTML =
      '<option value="">All Months</option>' +
      fiscalMonths(S.fiscalYear)
        .map(m => `<option value="${m.y}-${m.m}">${esc(m.label)}</option>`)
        .join('');
  }

  const ss = document.getElementById('matrixStageFilter');
  if (ss && ss.options.length <= 1) {
    ss.innerHTML =
      '<option value="">All Stages</option>' +
      STAGES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
}

function populatePipelineStageFilter() {
  const sel = document.getElementById('pipeStageFilt');
  if (sel && sel.options.length <= 1) { sel.innerHTML = '<option value="">All Stages</option>' + STAGES.filter(s => s !== 'Closed Won' && s !== 'Closed Lost').map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join(''); }
}

/* ================================================================ STATS */
function renderStats(s) {
  const t = s.trends || {};
  const cards = [
    { v: s.active_employees.toLocaleString(), label: 'Active Resources', tk: 'employees', action: 'view-employees', bg: 'bg-blue-100', fg: 'text-blue-600', formula: `Active team members · click to manage active\/inactive status`, icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { v: s.active_projects.toLocaleString(), label: 'Projects', tk: 'projects', action: 'view-projects', bg: 'bg-purple-100', fg: 'text-purple-600', formula: `Count of all projects registered in the system`, icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
    { v: s.avg_utilization + '%', label: 'Avg Utilization', tk: 'utilization', bg: 'bg-teal-100', fg: 'text-teal-600', formula: `Sum of all weekly allocation % ÷ Total assignment slots`, icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
    { v: s.assigned_projects.toLocaleString(), label: 'Assigned Projects', tk: 'assigned_projects', bg: 'bg-orange-100', fg: 'text-orange-600', formula: `Distinct projects with ≥ 1 weekly assignment in FY${S.fiscalYear}`, icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { v: `${s.productivity}/${s.ps_count}`, label: 'Productivity Score', tk: 'productivity', bg: 'bg-amber-100', fg: 'text-amber-600', formula: `Active PS Resources: ${s.ps_count} · Avg Utilization: ${s.avg_utilization}% · Score = avg util ÷ PS count`, icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
    { v: s.on_time_pct + '%', label: 'On-Time Completion', tk: 'on_time', bg: 'bg-emerald-100', fg: 'text-emerald-600', formula: `On-track projects ÷ Total projects × 100`, icon: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
  ];
  document.getElementById('statsRow').innerHTML = cards.map(c => {
    const td = t[c.tk] || { value: '—', up: true }, up = td.up;
    return `<div class="dc dc-stat"${c.action ? ` data-stat-action="${c.action}" style="cursor:pointer"` : ''}><div class="dc-handle" title="Drag card"><svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg></div>
    <div class="stat-card-inner bg-white rounded-xl border border-gray-200 p-5 relative" style="box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div class="stat-tooltip">${esc(c.formula)}</div>
      <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3"><svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg></div>
      <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
      <div class="text-sm text-gray-500 mb-2">${esc(c.label)}</div>
      <div class="flex items-center gap-1 text-xs font-medium ${up ? 'text-green-600' : 'text-orange-600'}">
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${up ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' : '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'}</svg>
        ${esc(td.value)}</div></div></div>`;
  }).join('');
}

/* ================================================================ MATRIX */
function renderMatrix() {
  const t = document.getElementById('matrixTable'), months = fiscalMonths(S.fiscalYear);
  let th = '<tr class="months">';
  th += `<th class="sticky-sn col-sn border-b-2 border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2">SN</th>`;
  th += `<th class="sticky-empid col-empid border-b-2 border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2">Res ID</th>`;
  th += `<th class="sticky-name col-name border-b-2 border-gray-300 px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2"><div style="position:relative;display:flex;align-items:center;height:100%">Resource<div class="col-resizer" data-col="name"></div></div></th>`;
  th += `<th class="sticky-dept col-dept border-b-2 border-gray-300 px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2"><div style="position:relative;display:flex;align-items:center;height:100%">Department<div class="col-resizer" data-col="dept"></div></div></th>`;
  for (let i = 0; i < months.length; i++) { const m = months[i]; th += `<th colspan="4" class="border-b border-gray-200 px-2 py-3 text-center text-xs font-semibold text-gray-700 bg-gray-50 ${i < months.length - 1 ? 'border-r border-gray-200' : ''}">${esc(m.label)}</th>`; }
  th += '</tr><tr class="weeks">';
  for (let i = 0; i < months.length; i++) for (let w = 1; w <= 4; w++) th += `<th class="border-b border-gray-200 px-2 py-2 text-center text-xs text-gray-500 font-medium bg-gray-50 col-week ${w === 4 ? 'border-r border-gray-200' : 'border-r border-dotted border-gray-200'}" style="min-width:110px">W${w}</th>`;
  th += '</tr>';
  t.querySelector('thead').innerHTML = th;

  const q = S.searchQuery.toLowerCase();
  const activeEmployees = getActiveEmployees();
  let emps = activeEmployees.filter(e => !q || e.name.toLowerCase().includes(q) || e.dept.toLowerCase().includes(q));

  if (S.matrixProjectFilter) { const pid = +S.matrixProjectFilter; emps = emps.filter(e => S.assignments.some(a => a.employee_id === e.id && a.project_id === pid)); }
  if (S.matrixResourceFilter) { emps = emps.filter(e => e.id === +S.matrixResourceFilter); }
  if (S.matrixMonthFilter) { const [fy, fm] = S.matrixMonthFilter.split('-').map(Number); emps = emps.filter(e => S.assignments.some(a => a.employee_id === e.id && a.year === fy && a.month === fm)); }

  if (S.matrixStageFilt || S.matrixAmountFilt || S.matrixCloseDateFilt || S.matrixProjCloseFilt) {
    const okPids = new Set(S.projects.filter(p => {
      if (S.matrixStageFilt && p.stage !== S.matrixStageFilt) return false;
      if (!getAmountOk(p.opp_amount, S.matrixAmountFilt)) return false;
      if (!matchDateFilter(p.end_date, S.matrixCloseDateFilt)) return false;
      if (!matchDateFilter(p.project_closing_date, S.matrixProjCloseFilt)) return false;
      return true;
    }).map(p => p.id));
    emps = emps.filter(e => S.assignments.some(a => a.employee_id === e.id && okPids.has(a.project_id)));
  }

  if (S.matrixSortAssigned) { emps = [...emps].sort((a, b) => S.assignments.filter(x => x.employee_id === b.id).length - S.assignments.filter(x => x.employee_id === a.id).length); }
  else if (S.matrixSortHigh) { emps = [...emps].sort((a, b) => (S.employeeUtil.get(b.id) || 0) - (S.employeeUtil.get(a.id) || 0)); }
  else if (S.matrixSortLow) { emps = [...emps].sort((a, b) => (S.employeeUtil.get(a.id) || 0) - (S.employeeUtil.get(b.id) || 0)); }

  const info = document.getElementById('matrixFilterInfo');
  if (info) {
    info.textContent = emps.length < activeEmployees.length ? `Showing ${emps.length} active resource${emps.length === 1 ? '' : 's'}` : '';
  }

  const rows = [];
  emps.forEach((emp, idx) => {
    const rowBg = idx % 2 === 0 ? 'row-even' : 'row-odd', util = S.employeeUtil.get(emp.id) || 0, uClr = uc(util), deptPill = 'pill-' + emp.dept.replace(/\s+/g, '-');
    let r = `<tr class="matrix-row ${rowBg} border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer" data-emp="${emp.id}">`;
    r += `<td class="sticky-sn col-sn border-r border-gray-200 px-3 py-3 text-center text-xs font-semibold text-gray-500">${idx + 1}</td>`;
    r += `<td class="sticky-empid col-empid border-r border-gray-200 px-3 py-3"><span class="text-xs font-medium text-gray-600 mono">${esc(emp.employee_code || '')}</span></td>`;
    r += `<td class="sticky-name col-name border-r border-gray-200 px-4 py-3"><button class="flex items-center gap-3 w-full text-left" data-action="edit-emp" data-emp="${emp.id}"><div class="w-9 h-9 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(emp.name))}</div><div class="min-w-0"><div class="text-sm font-medium text-gray-900 truncate">${esc(emp.name)}</div><div class="text-xs text-gray-500 truncate">${esc(emp.email || '')}</div></div></button></td>`;
    r += `<td class="sticky-dept col-dept border-r border-gray-200 px-4 py-3"><div class="flex items-center justify-between gap-2"><span class="inline-block pill ${deptPill}">${esc(emp.dept)}</span><span class="text-xs font-semibold" style="color:${uClr}">${Math.round(util)}%</span></div></td>`;
    for (let mi = 0; mi < months.length; mi++) {
      const m = months[mi];
      for (let w = 1; w <= 4; w++) {
        const key = `${m.y}-${m.m}-${w}`, asgs = (S.matrix[emp.id] && S.matrix[emp.id][key]) || [];
        r += `<td class="cell col-week ${w === 4 ? 'month-end' : ''}" data-emp="${emp.id}" data-year="${m.y}" data-month="${m.m}" data-week="${w}">`;
        for (const a of asgs) {
          const chipProj = S.projects.find(p => p.id === a.project_id) || {};
          const chipCustomer = a.account_name || chipProj.account_name || chipProj.client || '—';
          const chipProduct = a.product_name || chipProj.product_name || '—';
          const chipTitle = `${a.project_code || chipProj.code || ''} — ${a.project_name || chipProj.name || ''}
Customer Name: ${chipCustomer}
Product Name: ${chipProduct}`;
          const chipDisplayName = shortCustomerName(chipCustomer) || a.project_code;
          r += `<div class="chip" data-action="edit-assign" data-id="${a.id}" style="background:${a.project_color}20;border-left:3px solid ${a.project_color};min-width:0;width:100%;box-sizing:border-box;" title="${esc(chipTitle)}"><div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:4px;min-width:0;"><span class="chip-code" style="color:${a.project_color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:11px;">${esc(chipDisplayName)}</span><span class="chip-pct" style="color:#6b7280;white-space:nowrap;flex-shrink:0;font-size:11px;">${a.percentage}%</span></div><span class="chip-del" data-action="delete-assign" data-id="${a.id}" style="flex-shrink:0;">×</span></div>`;
        }
        r += `<span class="cell-add">+</span></td>`;
      }
    }
    r += '</tr>'; rows.push(r);
  });
  t.querySelector('tbody').innerHTML = rows.join('') || `<tr><td colspan="${4 + 48}" class="p-8 text-center text-sm text-gray-400">No resources found.</td></tr>`;
}

/* ================================================================ CHARTS */
function renderTrends(data) { if (S.charts.trends) S.charts.trends.destroy(); const ctx = document.getElementById('trendsChart').getContext('2d'); S.charts.trends = new Chart(ctx, { type: 'line', data: { labels: data.map(d => d.label), datasets: [{ label: 'Assignments', data: data.map(d => d.assignments), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.06)', tension: 0.4, borderWidth: 2, pointRadius: 3, fill: true, yAxisID: 'y' }, { label: 'Utilization %', data: data.map(d => d.utilization), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.04)', tension: 0.4, borderWidth: 2, pointRadius: 3, yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, padding: 8 } }, scales: { x: { ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y: { position: 'left', ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y1: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } } } } }); }

function renderWorkload(data) { if (S.charts.workload) S.charts.workload.destroy(); const ctx = document.getElementById('workloadChart').getContext('2d'); const depts = data.map(d => d.dept), colors = depts.map(d => DEPT_COLORS[d] || '#8B5CF6'); S.charts.workload = new Chart(ctx, { type: 'bar', data: { labels: depts, datasets: [{ data: data.map(d => d.assignment_count), backgroundColor: colors, borderRadius: 4, borderSkipped: false }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 } } }, scales: { x: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y: { ticks: { font: { size: 12 }, color: '#374151' }, grid: { display: false } } } } }); }

function renderAllocation(data) { if (S.charts.allocation) S.charts.allocation.destroy(); const ctx = document.getElementById('allocationChart').getContext('2d'); const depts = data.map(d => d.dept), colors = depts.map(d => DEPT_COLORS[d] || '#8B5CF6'); S.charts.allocation = new Chart(ctx, { type: 'pie', data: { labels: depts, datasets: [{ data: data.map(d => d.assignment_count), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 10 } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, callbacks: { label: c => { const tot = c.dataset.data.reduce((a, b) => a + b, 0); return ` ${c.label}: ${c.parsed} (${((c.parsed / tot) * 100).toFixed(0)}%)`; } } } } } }); }

/* ================================================================ WORK SUMMARY: PROJECT / TEAM / INDIVIDUAL */
const TIMESHEET_WORK_TYPE_ORDER = [
  'Training Delivery',
  'Skill Development',
  'Service Delivery - Local PS',
  'Service Delivery - Intrasourcing',
  'Pre - Sales',
  'General Admin',
];

const TIMESHEET_WORK_TYPE_COLORS = {
  'Training Delivery': '#449328',
  'Skill Development': '#F6C6AD',
  'Service Delivery - Local PS': '#D9F2D0',
  'Service Delivery - Intrasourcing': '#F2CFEE',
  'Pre - Sales': '#96DCF8',
  'General Admin': '#D1D1D1',
};

function normalizeTimesheetWorkType(value) {
  const raw = String(value || '').trim();
  const key = raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();

  if (key === 'training delivery') return 'Training Delivery';
  if (key === 'skill development') return 'Skill Development';
  if (key === 'service delivery-local ps' || key === 'service delivery local ps') return 'Service Delivery - Local PS';
  if (key === 'service delivery-intrasourcing' || key === 'service delivery intrasourcing') return 'Service Delivery - Intrasourcing';
  if (key === 'pre-sales' || key === 'pre sales' || key === 'presales' || key === 'pre - sales') return 'Pre - Sales';
  if (key === 'general admin') return 'General Admin';

  // Only the six approved work types are shown in Team Summary / Individual Summary.
  return null;
}

function workTypeColor(type) {
  const normalized = normalizeTimesheetWorkType(type) || type;
  return TIMESHEET_WORK_TYPE_COLORS[normalized] || '#9CA3AF';
}

function timesheetLegendLabels() {
  return {
    boxWidth: 10,
    boxHeight: 10,
    font: { size: 11 },
    padding: 10,
    generateLabels: chart => chart.data.datasets.map((ds, i) => ({
      text: ds.label,
      fillStyle: ds.timesheetColor || ds.backgroundColor,
      strokeStyle: ds.timesheetColor || ds.borderColor || ds.backgroundColor,
      lineWidth: 0,
      hidden: !chart.isDatasetVisible(i),
      datasetIndex: i,
    })),
  };
}

function orderedPresentWorkTypes(rows) {
  const present = new Set((rows || []).map(r => r.workType).filter(Boolean));
  return TIMESHEET_WORK_TYPE_ORDER.filter(type => present.has(type));
}
function monthSortKey(label, fallbackIndex = 0) {
  const s = String(label || '').trim();
  const m = s.match(/^([A-Za-z]{3,})\s*[- ]?\s*(\d{2,4})?/);
  if (!m) return 999999 + fallbackIndex;
  const monthIdx = MN.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
  if (monthIdx < 0) return 999999 + fallbackIndex;
  let year = m[2] ? Number(m[2]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return year * 12 + monthIdx;
}
function getRowValue(row, names) {
  for (const name of names) if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const target = names.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [key, value] of Object.entries(row)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (target.includes(norm)) return value;
  }
  return '';
}
function normalizeTimesheetRows(rows) {
  return (rows || []).map(row => {
    const month = String(getRowValue(row, ['Month', 'Months (Date)', 'Month (Date)']) || '').trim();
    const rawWorkType = String(getRowValue(row, ['Work Type', 'WorkType']) || '').trim();
    const workType = normalizeTimesheetWorkType(rawWorkType);
    const worker = String(getRowValue(row, ['Worker', 'Employee', 'Resource']) || '').trim();
    const projectName = String(getRowValue(row, ['Project Name', 'Project']) || '').trim();
    const qtyRaw = getRowValue(row, ['Qty (Hrs)', 'Qty Hrs', 'Quantity', 'Hours', 'Hrs']);
    const qty = Number(String(qtyRaw).replace(/,/g, '')) || 0;
    return { month, workType, worker, projectName, qty, raw: row };
  }).filter(r => r.month && r.worker && r.workType && r.qty > 0);
}

function aggregateTimesheetRows(rows) {
  const map = new Map();

  for (const r of rows || []) {
    const month = String(r.month || '').trim();
    const worker = String(r.worker || '').trim();
    const workType = String(r.workType || '').trim();
    const projectName = String(r.projectName || '(No project name)').trim();
    const qty = Number(r.qty) || 0;

    if (!month || !worker || !workType || qty <= 0) continue;

    const key = [month, worker, workType, projectName].join('\u001F');

    if (!map.has(key)) {
      map.set(key, {
        month,
        worker,
        workType,
        projectName,
        qty: 0,
      });
    }

    map.get(key).qty += qty;
  }

  return [...map.values()].map(r => ({
    ...r,
    qty: +r.qty.toFixed(4),
  }));
}

function normalizePersonName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPersonKey(value) {
  return normalizePersonName(value).replace(/\s+/g, '');
}

function getActiveEmployees() {
  return (S.employees || []).filter(e => e.active !== 0);
}

function getActiveEmployeeIdSet() {
  return new Set(getActiveEmployees().map(e => e.id));
}

function getInactiveEmployeeKeySet() {
  return new Set(
    (S.employees || [])
      .filter(e => e.active === 0)
      .map(e => compactPersonKey(e.name))
      .filter(Boolean)
  );
}

function isInactiveTimesheetWorker(workerName) {
  const key = compactPersonKey(workerName);
  if (!key) return false;
  return getInactiveEmployeeKeySet().has(key);
}

function getVisibleTimesheetRows() {
  // Time Sheet names may not always exactly match the employee master list.
  // Therefore, do NOT require every Time Sheet worker to exist in active employees.
  // Only remove workers whose names explicitly match inactive employees.
  return (S.timesheetRows || []).filter(r => !isInactiveTimesheetWorker(r.worker));
}

function getTimesheetMonthOptions() {
  return [...new Set(getVisibleTimesheetRows().map(r => r.month).filter(Boolean))]
    .sort((a, b) => monthSortKey(a) - monthSortKey(b));
}

function populateIndividualMonthFilter() {
  const sel = document.getElementById('individualSummaryMonthFilter');
  if (!sel) return;

  const months = getTimesheetMonthOptions();
  const current = S.individualSummaryMonthFilter;

  sel.innerHTML =
    '<option value="">All Months</option>' +
    months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');

  if (current && months.includes(current)) {
    sel.value = current;
  } else {
    S.individualSummaryMonthFilter = '';
    sel.value = '';
  }
}

async function loadSavedTimesheetFromDb() {
  try {
    const data = await api('GET', '/api/timesheet-summary');
    const rows = data.rows || [];

    S.timesheetRows = rows;
    S.timesheetFileName = data.last_source_file || '';
    S.timesheetSheetName = data.last_sheet_name || '';
    S.individualSummaryMonthFilter = '';

    populateIndividualMonthFilter();

    const status = document.getElementById('timesheetStatus');

    if (status) {
      if (rows.length) {
        status.innerHTML =
          `<span class="font-semibold text-emerald-700">Loaded from DB:</span> ` +
          `${esc(data.last_source_file || 'Saved Time Sheet Data')}` +
          ` · Sheet: ${esc(data.last_sheet_name || 'Database')}` +
          ` · ${rows.length} saved rows` +
          ` · ${(Number(data.total_hours) || 0).toFixed(1)} hrs`;
      } else {
        status.innerHTML =
          `Upload an Excel file with sheet name ` +
          `<span class="font-semibold">Time Sheet</span> ` +
          `or matching columns: Month, Work Type, Worker, Qty (Hrs).`;
      }
    }

    renderTeamSummaryChart();
    renderIndividualSummaryChart();
  } catch (e) {
    console.error(e);
    toast('Failed to load saved Time Sheet data from DB', 'error');
  }
}

function getIndividualSummaryRows() {
  const rows = getVisibleTimesheetRows();
  const month = S.individualSummaryMonthFilter;
  return month ? rows.filter(r => r.month === month) : rows;
}
function buildWorkTypePivot(rows, rowField) {
  const rowOrder = [], table = {}, totals = {};
  for (const r of rows) {
    const rowLabel = rowField === 'month' ? r.month : r.worker;
    const type = r.workType;
    if (!rowLabel || !type) continue;
    if (!rowOrder.includes(rowLabel)) rowOrder.push(rowLabel);
    table[rowLabel] ||= {};
    table[rowLabel][type] = (table[rowLabel][type] || 0) + r.qty;
    totals[rowLabel] = (totals[rowLabel] || 0) + r.qty;
  }
  if (rowField === 'month') rowOrder.sort((a, b) => monthSortKey(a, rowOrder.indexOf(a)) - monthSortKey(b, rowOrder.indexOf(b)));
  else rowOrder.sort((a, b) => a.localeCompare(b));

  const typeOrder = orderedPresentWorkTypes(rows);
  return { rowOrder, typeOrder, table, totals };
}
const stackedPercentLabelPlugin = {
  id: 'stackedPercentLabel', afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((bar, index) => {
        const val = Number(ds.data[index]) || 0;
        if (val < 3) return;
        const props = bar.getProps(['x', 'y', 'base'], true);
        ctx.save(); ctx.fillStyle = val >= 15 ? '#111827' : '#374151'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${val.toFixed(val >= 10 ? 0 : 1)}%`, props.x, (props.y + props.base) / 2); ctx.restore();
      });
    });
  }
};
function buildStackedPercentDatasets(pivot, mode = 'team') {
  const isIndividual = mode === 'individual';

  return pivot.typeOrder.map(type => {
    const color = workTypeColor(type);

    return {
      label: type,
      workType: type,
      timesheetColor: color,
      backgroundColor: color,
      hoverBackgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
      barPercentage: 0.55,
      categoryPercentage: 0.72,
      maxBarThickness: 72,
      data: pivot.rowOrder.map(rowLabel => {
        const total = pivot.totals[rowLabel] || 0;
        const val = pivot.table[rowLabel]?.[type] || 0;
        return total ? +((val / total) * 100).toFixed(2) : 0;
      }),
      hoursData: pivot.rowOrder.map(rowLabel => +(pivot.table[rowLabel]?.[type] || 0).toFixed(2)),
    };
  });
}
function setTimesheetEmptyState(kind, hasData) {
  const empty = document.getElementById(`${kind}SummaryEmpty`); const wrap = document.getElementById(`${kind}SummaryChartWrap`);
  if (empty) empty.classList.toggle('hidden', hasData); if (wrap) wrap.classList.toggle('hidden', !hasData);
}
function renderTeamSummaryChart() {
  const canvas = document.getElementById('teamSummaryChart');
  if (!canvas) return;

  if (S.charts.teamSummary) {
    S.charts.teamSummary.destroy();
  }

  const allRows = S.timesheetRows || [];
  const rows = getVisibleTimesheetRows();
  const info = document.getElementById('teamSummaryInfo');

  if (!allRows.length) {
    setTimesheetEmptyState('team', false);
    if (info) info.textContent = '';
    return;
  }

  if (!rows.length) {
    setTimesheetEmptyState('team', false);
    if (info) info.textContent = 'No active Time Sheet rows found. Inactive employees are excluded.';
    return;
  }

  setTimesheetEmptyState('team', true);

  const pivot = buildWorkTypePivot(rows, 'month');
  const datasets = buildStackedPercentDatasets(pivot, 'team');
  const totalHours = rows.reduce((s, r) => s + r.qty, 0);

  if (info) {
    info.textContent = `${pivot.rowOrder.length} month${pivot.rowOrder.length === 1 ? '' : 's'} · ${pivot.typeOrder.length} work type${pivot.typeOrder.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)} hrs · inactive employees excluded`;
  }

  S.charts.teamSummary = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    plugins: [stackedPercentLabelPlugin],
    data: {
      labels: pivot.rowOrder,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      onClick: (event, elements) => {
        if (elements.length) {
          openTimesheetSummaryModal('team', pivot.rowOrder[elements[0].index]);
        }
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: timesheetLegendLabels(),
        },
        tooltip: {
          callbacks: {
            title: items => `${items[0].label} · ${pivot.totals[items[0].label].toFixed(1)} hrs`,
            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toFixed(1)}% (${(ctx.dataset.hoursData[ctx.dataIndex] || 0).toFixed(1)} hrs)`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          ticks: {
            font: {
              size: 11,
            },
            color: '#374151',
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: v => `${v}%`,
            font: {
              size: 11,
            },
            color: '#6B7280',
          },
          grid: {
            color: '#F3F4F6',
          },
        },
      },
    },
  });
}

function renderIndividualSummaryChart() {
  const canvas = document.getElementById('individualSummaryChart');
  if (!canvas) return;

  if (S.charts.individualSummary) {
    S.charts.individualSummary.destroy();
  }

  populateIndividualMonthFilter();

  const allRows = S.timesheetRows || [];
  const visibleRows = getVisibleTimesheetRows();
  const rows = getIndividualSummaryRows();
  const info = document.getElementById('individualSummaryInfo');

  if (!allRows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = '';
    return;
  }

  if (!visibleRows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = 'No active Time Sheet rows found. Inactive employees are excluded.';
    return;
  }

  if (!rows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = 'No active employee rows found for selected month.';
    return;
  }

  setTimesheetEmptyState('individual', true);

  const pivot = buildWorkTypePivot(rows, 'worker');
  const datasets = buildStackedPercentDatasets(pivot, 'individual');
  const totalHours = rows.reduce((s, r) => s + r.qty, 0);
  const monthText = S.individualSummaryMonthFilter ? ` · Month: ${S.individualSummaryMonthFilter}` : ' · All months';

  if (info) {
    info.textContent = `${pivot.rowOrder.length} employee${pivot.rowOrder.length === 1 ? '' : 's'} · ${pivot.typeOrder.length} work type${pivot.typeOrder.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)} hrs${monthText} · inactive employees excluded`;
  }

  S.charts.individualSummary = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    plugins: [stackedPercentLabelPlugin],
    data: {
      labels: pivot.rowOrder,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      onClick: (event, elements) => {
        if (elements.length) {
          openTimesheetSummaryModal('individual', pivot.rowOrder[elements[0].index]);
        }
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: timesheetLegendLabels(),
        },
        tooltip: {
          callbacks: {
            title: items => `${items[0].label} · ${pivot.totals[items[0].label].toFixed(1)} hrs`,
            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toFixed(1)}% (${(ctx.dataset.hoursData[ctx.dataIndex] || 0).toFixed(1)} hrs)`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          ticks: {
            font: {
              size: 10,
            },
            color: '#374151',
            maxRotation: 45,
            minRotation: 35,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: v => `${v}%`,
            font: {
              size: 11,
            },
            color: '#6B7280',
          },
          grid: {
            color: '#F3F4F6',
          },
        },
      },
    },
  });
}

function openTimesheetSummaryModal(kind, label) {
  const rows = getVisibleTimesheetRows().filter(r => {
    if (kind === 'team') return r.month === label;
    if (S.individualSummaryMonthFilter && r.month !== S.individualSummaryMonthFilter) return false;
    return r.worker === label;
  });
  const total = rows.reduce((s, r) => s + r.qty, 0), typeMap = {}, projectMap = {};
  for (const r of rows) { typeMap[r.workType] = (typeMap[r.workType] || 0) + r.qty; const proj = r.projectName || '(No project name)'; projectMap[proj] ||= {}; projectMap[proj][r.workType] = (projectMap[proj][r.workType] || 0) + r.qty; }
  const typeRows = TIMESHEET_WORK_TYPE_ORDER.filter(type => typeMap[type]).map((type, i) => { const hrs = typeMap[type]; const pct = total ? hrs / total * 100 : 0; return `<div class="timesheet-modal-row"><div class="flex items-center justify-between gap-3"><div class="flex items-center gap-2 min-w-0"><span class="w-3 h-3 rounded-sm flex-shrink-0" style="background:${workTypeColor(type, i)}"></span><span class="text-sm font-semibold text-gray-900 truncate">${esc(type)}</span></div><div class="text-right flex-shrink-0"><div class="text-sm font-bold text-gray-900">${pct.toFixed(1)}%</div><div class="text-xs text-gray-500">${hrs.toFixed(1)} hrs</div></div></div><div class="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(pct, 100)}%;background:${workTypeColor(type, i)}"></div></div></div>`; }).join('');
  const projectRows = Object.entries(projectMap).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).slice(0, 20).map(([project, typeObj]) => { const hrs = Object.values(typeObj).reduce((s, v) => s + v, 0); return `<div class="py-2 border-b border-gray-100 last:border-0"><div class="text-sm font-semibold text-gray-800">${esc(project)}</div><div class="text-xs text-gray-500 mt-0.5">${hrs.toFixed(1)} hrs · ${Object.keys(typeObj).map(esc).join(', ')}</div></div>`; }).join('');
  const monthLabel = kind === 'individual' && S.individualSummaryMonthFilter ? ` · Month: ${S.individualSummaryMonthFilter}` : '';
  openModal(mHdr(`${label} — ${kind === 'team' ? 'Team Summary' : 'Individual Summary'}`, `${S.timesheetFileName || 'Uploaded Time Sheet'}${monthLabel} · ${rows.length} entry${rows.length === 1 ? '' : 'ies'} · ${total.toFixed(1)} hrs`) + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh"><div class="grid grid-cols-2 gap-4"><div><div class="text-sm font-semibold text-gray-700 mb-2">Work Type Breakdown</div>${typeRows || '<p class="text-sm text-gray-400">No work-type data.</p>'}</div><div><div class="text-sm font-semibold text-gray-700 mb-2">Top Project Details</div><div class="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2">${projectRows || '<p class="text-sm text-gray-400 py-3">No project details.</p>'}</div></div></div></div><div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl"><button onclick="closeModal()" class="btn-gray">Close</button></div>`, 'max-w-4xl');
}
function switchResourceMatrixTab(tab) {
  S.resourceMatrixTab = tab;

  document.querySelectorAll('.resource-matrix-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.resourceMatrixTab === tab);
  });

  document.querySelectorAll('.resource-matrix-tab-content').forEach(panel => {
    panel.classList.toggle('hidden', !panel.id.endsWith('-' + tab));
  });

  if (tab === 'matrix') {
    renderMatrix();
  }

  if (tab === 'project') {
    setTimeout(() => renderYearlyWorkByProjectChart(), 0);
  }

  if (tab === 'people') {
    setTimeout(() => renderProjectWisePeopleChart(), 0);
  }
}

function switchWorkSummaryTab(tab) {
  const safeTab = tab === 'individual' ? 'individual' : 'team';
  S.workSummaryTab = safeTab;

  document.querySelectorAll('.work-summary-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.workSummaryTab === safeTab);
  });

  document.querySelectorAll('.work-summary-tab-content').forEach(panel => {
    panel.classList.toggle('hidden', !panel.id.endsWith('-' + safeTab));
  });

  if (safeTab === 'team') renderTeamSummaryChart();
  if (safeTab === 'individual') renderIndividualSummaryChart();
}

function getProjectImportCellValue(row, names) {
  const wanted = names.map(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (wanted.includes(normalizedKey)) return value;
  }
  return '';
}

function normalizeProjectImportDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let mo = +m[1], d = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dObj = new Date(s);
  if (!isNaN(dObj)) return dObj.toISOString().slice(0, 10);
  return '';
}

function normalizeProjectImportNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseProjectExcelRows(sheetRows) {
  return (sheetRows || []).map(row => {
    const code = String(getProjectImportCellValue(row, [
      'Opportunity Number', 'Opportunity No', 'Opportunity #', 'SA Number', 'SA No', 'Code'
    ]) || '').trim().toUpperCase();

    const name = String(getProjectImportCellValue(row, [
      'Opportunity Name', 'Project Name', 'Name'
    ]) || '').trim();

    return {
      code,
      name,
      account_name: String(getProjectImportCellValue(row, ['Account Name', 'Customer Name', 'Client']) || '').trim(),
      opportunity_owner: String(getProjectImportCellValue(row, ['Opportunity Owner', 'Owner']) || '').trim(),
      probability: normalizeProjectImportNumber(getProjectImportCellValue(row, ['Probability (%)', 'Probability', 'Probability %'])),
      product_family: String(getProjectImportCellValue(row, ['Product Family']) || '').trim(),
      product_name: String(getProjectImportCellValue(row, [
        'Product Name',
        'Product Description',
        'Product Desc',
        'Product Detail',
        'Item Description'
      ]) || '').trim(),
      stage: String(getProjectImportCellValue(row, ['Stage']) || '').trim(),
      close_date: normalizeProjectImportDate(getProjectImportCellValue(row, ['Close Date', 'Closed Won Date', 'Close Won Date'])),
      created_date: normalizeProjectImportDate(getProjectImportCellValue(row, ['Created Date'])),
      product_amount: normalizeProjectImportNumber(getProjectImportCellValue(row, ['Product Amount'])),
      amount: normalizeProjectImportNumber(getProjectImportCellValue(row, ['Amount', 'Opportunity Amount'])),
    };
  }).filter(r => r.code && r.name);
}

function openProjectImportResultModal(result, fileName) {
  const inserted = result.inserted || [];
  const skipped = result.skipped_existing || [];
  const failed = result.failed || [];

  const row = (p, badgeCls, badgeText) => `
    <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div class="min-w-0">
        <div class="text-xs font-bold text-blue-600 mono">${esc(p.code || '—')}</div>
        <div class="text-sm font-semibold text-gray-900 truncate">${esc(p.name || '—')}</div>
        ${(p.product_name || p.product_amount !== undefined) ? `<div class="text-xs text-gray-500 mt-0.5 truncate">${esc(p.product_name || '—')} · ${Number(p.product_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</div>` : ''}
        ${p.error ? `<div class="text-xs text-red-500 mt-0.5">${esc(p.error)}</div>` : ''}
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls} flex-shrink-0">${badgeText}</span>
    </div>`;

  openModal(
    mHdr('Project Excel Import Completed', `${fileName || 'Uploaded Excel'} · ${result.normalized_projects || 0} unique project lines traced by Opportunity Number + resolved Product Name/Product Description + Product Amount`)
    + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
            <div class="text-2xl font-bold text-emerald-700">${result.inserted_count || 0}</div>
            <div class="text-xs text-emerald-700 mt-1">Inserted Lines</div>
          </div>
          <div class="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
            <div class="text-2xl font-bold text-gray-700">${result.skipped_existing_count || 0}</div>
            <div class="text-xs text-gray-500 mt-1">Already Existing Lines</div>
          </div>
          <div class="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
            <div class="text-2xl font-bold text-red-700">${result.failed_count || 0}</div>
            <div class="text-xs text-red-600 mt-1">Failed</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Inserted Projects</div>
            <div class="rounded-xl border border-gray-100 bg-white max-h-72 overflow-y-auto nice-scroll px-3">
              ${inserted.length ? inserted.map(p => row(p, 'bg-emerald-100 text-emerald-700', 'Inserted')).join('') : '<p class="text-sm text-gray-400 text-center py-6">No new projects inserted.</p>'}
            </div>
          </div>
          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Skipped / Failed</div>
            <div class="rounded-xl border border-gray-100 bg-white max-h-72 overflow-y-auto nice-scroll px-3">
              ${skipped.slice(0, 80).map(p => row(p, 'bg-gray-100 text-gray-600', 'Exists')).join('')}
              ${failed.map(p => row(p, 'bg-red-100 text-red-700', 'Failed')).join('')}
              ${!skipped.length && !failed.length ? '<p class="text-sm text-gray-400 text-center py-6">No skipped or failed rows.</p>' : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
        <button onclick="openProjectsModal()" class="btn-blue">View Projects</button>
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-4xl'
  );
}

async function handleProjectExcelUpload(file) {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    toast('Excel parser is not loaded. Check SheetJS CDN.', 'error');
    return;
  }

  try {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: '',
      raw: false,
    });

    const rows = parseProjectExcelRows(sheetRows);

    if (!rows.length) {
      toast('No valid project rows found. Required: Opportunity Number and Opportunity Name. Product Name or Product Description + Product Amount are used for duplicate matching when available.', 'error');
      return;
    }

    const result = await api('POST', '/api/projects/import', { rows });

    const [projs, nlChart, psRevChart, psTypeChart, dl] = await Promise.all([
      api('GET', '/api/projects'),
      api('GET', '/api/dashboard/new-logo-chart'),
      api('GET', '/api/dashboard/ps-revenue-chart'),
      api('GET', '/api/dashboard/ps-type-chart'),
      api('GET', '/api/dashboard/deadlines'),
    ]);

    S.projects = projs;
    S.psRevenueData = psRevChart;
    S.psTypeData = psTypeChart;
    S.lastRunningData = dl;

    buildMatrix();
    renderMatrix();
    renderYearlyWorkByProjectChart();
    renderNewLogoChart(nlChart, S.newLogoFilter, S.nlProductFilter);
    renderServicePipeline(projs);
    applyAndRenderRunning();
    populateMatrixFilter();
    populatePipelineStageFilter();
    populateProductFamilyDropdowns();

    const stats = await api('GET', `/api/dashboard/stats?fiscalYear=${S.fiscalYear}`);
    renderStats(stats);

    toast(`Inserted ${result.inserted_count || 0} new project${(result.inserted_count || 0) === 1 ? '' : 's'}`);
    openProjectImportResultModal(result, file.name);
  } catch (e) {
    console.error(e);
    toast('Failed to import projects from Excel', 'error');
  }
}

async function handleTimesheetUpload(file) {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    toast('Excel parser is not loaded. Check internet/CDN access for SheetJS.', 'error');
    return;
  }

  try {
    const buf = await file.arrayBuffer();

    const workbook = XLSX.read(buf, {
      type: 'array',
      cellDates: false,
    });

    const sheetName =
      workbook.SheetNames.find(n => n.trim().toLowerCase() === 'time sheet') ||
      workbook.SheetNames[0];

    const parsedRows = normalizeTimesheetRows(
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
        raw: false,
      })
    );

    const rows = aggregateTimesheetRows(parsedRows);

    if (!rows.length) {
      toast(
        'No valid Time Sheet rows found. Required columns: Month, Work Type, Worker, Qty (Hrs).',
        'error'
      );
      return;
    }

    const saved = await api('POST', '/api/timesheet-summary/bulk', {
      fileName: file.name,
      sheetName,
      replaceMonths: true,
      rows,
    });

    await loadSavedTimesheetFromDb();

    switchWorkSummaryTab(S.workSummaryTab || 'team');

    toast(
      `Saved ${saved.saved_rows} Time Sheet rows for ${saved.month_count} month${saved.month_count === 1 ? '' : 's'}`
    );
  } catch (e) {
    console.error(e);
    toast('Failed to read or save the Excel file', 'error');
  }
}
function openYearlyWorkProjectModal(empId) {
  const emp = S.employees.find(e => e.id === empId); if (!emp) return;
  const TOTAL_FY_WEEKS = 48, empAssignments = S.assignments.filter(a => a.employee_id === empId), projectMap = {};
  for (const a of empAssignments) { const project = S.projects.find(p => p.id === a.project_id); if (!project) continue; if (!projectMap[a.project_id]) projectMap[a.project_id] = { project_id: a.project_id, code: project.code || a.project_code || '', name: project.name || a.project_name || '', account_name: project.account_name || project.client || a.account_name || '—', product_name: project.product_name || a.product_name || '—', product_family: project.product_family || '—', stage: project.stage || '—', color: project.color || a.project_color || '#8B5CF6', weightedWeeks: 0, slotCount: 0, totalPct: 0 }; projectMap[a.project_id].weightedWeeks += (Number(a.percentage) || 0) / 100; projectMap[a.project_id].slotCount += 1; projectMap[a.project_id].totalPct += Number(a.percentage) || 0; }
  const projects = Object.values(projectMap).map(p => ({ ...p, contribution: +((p.weightedWeeks / TOTAL_FY_WEEKS) * 100).toFixed(1), avgPct: p.slotCount ? +(p.totalPct / p.slotCount).toFixed(1) : 0 })).sort((a, b) => b.contribution - a.contribution);
  const totalContribution = projects.reduce((sum, p) => sum + p.contribution, 0);
  const rows = projects.map((p, idx) => `<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-3"><div class="flex items-start justify-between gap-4"><div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1"><span class="w-3 h-3 rounded-sm flex-shrink-0" style="background:${p.color}"></span><span class="text-xs font-bold text-blue-600 mono">${esc(p.code)}</span><span class="text-xs text-gray-400">#${idx + 1}</span></div><div class="text-sm font-semibold text-gray-900 leading-snug">${esc(p.name)}</div><div class="text-xs text-gray-500 mt-1">${esc(p.account_name)}<span class="text-gray-300 mx-1">·</span>${esc(p.product_name)}</div><div class="flex flex-wrap gap-1.5 mt-2"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(p.product_family)}</span><span class="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">${esc(p.stage)}</span></div></div><div class="text-right flex-shrink-0"><div class="text-lg font-bold text-gray-900">${p.contribution}%</div><div class="text-xs text-gray-400">FY contribution</div><div class="text-xs text-gray-500 mt-1">${p.slotCount} week slot${p.slotCount === 1 ? '' : 's'}</div><div class="text-xs text-gray-500">${p.avgPct}% avg workload</div></div></div><div class="mt-3 flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(p.contribution, 100)}%;background:${p.color}"></div></div><span class="text-xs font-semibold text-gray-600 w-12 text-right">${p.contribution}%</span></div></div>`).join('');
  openModal(mHdr(`${emp.name} — Yearly Project Work`, `FY${S.fiscalYear + 1} · ${projects.length} assigned project${projects.length === 1 ? '' : 's'} · Total ${totalContribution.toFixed(1)}%`) + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">${rows || '<p class="text-sm text-gray-400 text-center py-8">No project assignments found.</p>'}</div><div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl"><button onclick="closeModal()" class="btn-gray">Close</button></div>`, 'max-w-3xl');
}
function renderYearlyWorkByProjectChart() {
  const canvas = document.getElementById('yearlyWorkChart'); if (!canvas) return; if (S.charts.yearlyWork) S.charts.yearlyWork.destroy();
  const ctx = canvas.getContext('2d'), TOTAL_FY_WEEKS = 48, employees = S.employees.filter(e => e.active !== 0), empProjectMap = {};
  for (const e of employees) empProjectMap[e.id] = {};
  for (const a of S.assignments) { if (!empProjectMap[a.employee_id]) continue; const project = S.projects.find(p => p.id === a.project_id); if (!project) continue; empProjectMap[a.employee_id][a.project_id] ||= { weightedWeeks: 0 }; empProjectMap[a.employee_id][a.project_id].weightedWeeks += (Number(a.percentage) || 0) / 100; }
  const assignedProjectIds = [...new Set(S.assignments.filter(a => employees.some(e => e.id === a.employee_id)).map(a => a.project_id))];
  const assignedProjects = assignedProjectIds.map(pid => S.projects.find(p => p.id === pid)).filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const labels = employees.map(e => e.name);
  const datasets = assignedProjects.map(project => ({ label: `${project.code || ''} — ${project.name || ''}`, projectCode: project.code || '', projectName: project.name || '', data: employees.map(e => { const item = empProjectMap[e.id]?.[project.id]; return item ? +((item.weightedWeeks / TOTAL_FY_WEEKS) * 100).toFixed(2) : 0; }), backgroundColor: project.color || '#8B5CF6', borderWidth: 0, borderRadius: 2, barPercentage: 0.75, categoryPercentage: 0.78 }));
  const totalUtilByEmployee = employees.map(e => { const weightedWeeks = Object.values(empProjectMap[e.id] || {}).reduce((sum, item) => sum + item.weightedWeeks, 0); return +((weightedWeeks / TOTAL_FY_WEEKS) * 100).toFixed(1); });
  S.charts.yearlyWork = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, onClick: (event, elements) => { if (!elements.length) return; const emp = employees[elements[0].index]; if (emp) openYearlyWorkProjectModal(emp.id); }, onHover: (event, elements) => { const target = event.native?.target; if (target) target.style.cursor = elements.length ? 'pointer' : 'default'; }, interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 }, padding: 8, generateLabels: chart => { const shortText = (txt, max = 32) => { const t = String(txt || '').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; }; return chart.data.datasets.map((ds, i) => ({ text: shortText(ds.projectName || ds.label), fillStyle: ds.backgroundColor, strokeStyle: ds.backgroundColor, lineWidth: 0, hidden: !chart.isDatasetVisible(i), datasetIndex: i })); } } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 12, weight: '600' }, padding: 10, callbacks: { title: items => `${employees[items[0].dataIndex].name} · Total ${totalUtilByEmployee[items[0].dataIndex]}%`, label: c => { const val = c.parsed.y || 0; if (!val) return ''; return [` ${c.dataset.projectCode}: ${val}%`, ` ${c.dataset.projectName}`]; } } } }, scales: { x: { stacked: true, ticks: { font: { size: 11 }, color: '#374151', maxRotation: 45, minRotation: 35 }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { font: { size: 11 }, color: '#6B7280', callback: v => `${v}%` }, grid: { color: '#F3F4F6' }, title: { display: true, text: 'FY workload contribution (%)', font: { size: 11 }, color: '#9CA3AF' } } } } });
}


function getProjectWisePeopleBreakdown() {
  const TOTAL_FY_WEEKS = 48;
  const activeEmployees = S.employees.filter(e => e.active !== 0);
  const employeeMap = new Map(activeEmployees.map(e => [e.id, e]));
  const projectMap = new Map();

  for (const a of S.assignments || []) {
    const emp = employeeMap.get(a.employee_id);
    if (!emp) continue;

    const project = S.projects.find(p => p.id === a.project_id);
    if (!project) continue;

    if (!projectMap.has(project.id)) {
      projectMap.set(project.id, {
        project,
        people: new Map(),
        weightedWeeks: 0,
        slotCount: 0,
      });
    }

    const bucket = projectMap.get(project.id);
    if (!bucket.people.has(emp.id)) {
      bucket.people.set(emp.id, {
        employee: emp,
        weightedWeeks: 0,
        slotCount: 0,
        totalPct: 0,
      });
    }

    const pct = Number(a.percentage) || 0;
    const weighted = pct / 100;
    const person = bucket.people.get(emp.id);

    person.weightedWeeks += weighted;
    person.slotCount += 1;
    person.totalPct += pct;
    bucket.weightedWeeks += weighted;
    bucket.slotCount += 1;
  }

  const projects = [...projectMap.values()]
    .map(item => ({
      ...item,
      contribution: +((item.weightedWeeks / TOTAL_FY_WEEKS) * 100).toFixed(2),
      peopleList: [...item.people.values()]
        .map(p => ({
          ...p,
          contribution: +((p.weightedWeeks / TOTAL_FY_WEEKS) * 100).toFixed(2),
          avgPct: p.slotCount ? +(p.totalPct / p.slotCount).toFixed(1) : 0,
        }))
        .sort((a, b) => b.contribution - a.contribution || String(a.employee.name || '').localeCompare(String(b.employee.name || ''))),
    }))
    .filter(item => item.contribution > 0)
    .sort((a, b) => String(a.project.name || '').localeCompare(String(b.project.name || '')));

  const employeeIds = [...new Set(projects.flatMap(item => item.peopleList.map(p => p.employee.id)))]
    .sort((a, b) => String(employeeMap.get(a)?.name || '').localeCompare(String(employeeMap.get(b)?.name || '')));

  return { projects, employees: employeeIds.map(id => employeeMap.get(id)).filter(Boolean), TOTAL_FY_WEEKS };
}

function openProjectWisePeopleModal(projectId) {
  const { projects } = getProjectWisePeopleBreakdown();
  const item = projects.find(p => p.project.id === projectId);
  if (!item) return;

  const project = item.project;
  const rows = item.peopleList.map((p, idx) => {
    const color = PCOLORS[idx % PCOLORS.length];
    return `<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-3">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style="background:${color}">${esc(inits(p.employee.name || ''))}</div>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-gray-900 truncate">${esc(p.employee.name || '—')}</div>
            <div class="text-xs text-gray-500 mt-0.5">${esc(p.employee.dept || '—')}</div>
            <div class="text-xs text-gray-400 mt-1">${p.slotCount} week slot${p.slotCount === 1 ? '' : 's'} · ${p.avgPct}% avg workload</div>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-lg font-bold text-gray-900">${p.contribution}%</div>
          <div class="text-xs text-gray-400">FY contribution</div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${Math.min(p.contribution, 100)}%;background:${color}"></div>
        </div>
        <span class="text-xs font-semibold text-gray-600 w-12 text-right">${p.contribution}%</span>
      </div>
    </div>`;
  }).join('');

  openModal(
    mHdr(
      `${project.code || 'Project'} — ${project.name || 'Project-wise People'}`,
      `${item.peopleList.length} assigned active resource${item.peopleList.length === 1 ? '' : 's'} · Total ${item.contribution.toFixed(2)}% FY contribution`
    )
    + `<div class="px-6 pt-4 pb-2 border-b border-gray-100">
        <div class="text-xs text-gray-500">
          ${esc(project.account_name || project.client || '—')}
          <span class="text-gray-300 mx-1">·</span>
          ${esc(project.product_name || '—')}
          <span class="text-gray-300 mx-1">·</span>
          ${esc(project.stage || '—')}
        </div>
      </div>
      <div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">
        ${rows || '<p class="text-sm text-gray-400 text-center py-8">No assigned active resources found.</p>'}
      </div>
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-3xl'
  );
}

function renderProjectWisePeopleChart() {
  const canvas = document.getElementById('projectPeopleChart');
  if (!canvas) return;

  if (S.charts.projectPeople) {
    S.charts.projectPeople.destroy();
  }

  const info = document.getElementById('projectPeopleInfo');
  const ctx = canvas.getContext('2d');
  const { projects, employees } = getProjectWisePeopleBreakdown();

  if (info) {
    info.textContent = `${projects.length} assigned project${projects.length === 1 ? '' : 's'} · ${employees.length} active resource${employees.length === 1 ? '' : 's'}`;
  }

  const labels = projects.map(item => item.project.name || item.project.code || 'Project');
  const totalByProject = projects.map(item => item.contribution);

  const datasets = employees.map((emp, idx) => {
    const color = PCOLORS[idx % PCOLORS.length];
    return {
      label: emp.name,
      employeeId: emp.id,
      employeeName: emp.name,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: 2,
      barPercentage: 0.72,
      categoryPercentage: 0.78,
      data: projects.map(item => {
        const person = item.peopleList.find(p => p.employee.id === emp.id);
        return person ? person.contribution : 0;
      }),
    };
  });

  S.charts.projectPeople = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;
        const project = projects[elements[0].index]?.project;
        if (project) openProjectWisePeopleModal(project.id);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      interaction: {
        mode: 'nearest',
        intersect: true,
      },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 10 },
            padding: 8,
            generateLabels: chart => {
              const shortText = (txt, max = 30) => {
                const t = String(txt || '').trim();
                return t.length > max ? t.slice(0, max - 1) + '…' : t;
              };
              return chart.data.datasets.map((ds, i) => ({
                text: shortText(ds.employeeName || ds.label),
                fillStyle: ds.backgroundColor,
                strokeStyle: ds.backgroundColor,
                lineWidth: 0,
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i,
              }));
            },
          },
        },
        tooltip: {
          bodyFont: { size: 11 },
          titleFont: { size: 12, weight: '600' },
          padding: 10,
          callbacks: {
            title: items => {
              const item = projects[items[0].dataIndex];
              const total = totalByProject[items[0].dataIndex] || 0;
              return `${item.project.code || ''} · ${item.project.name || 'Project'} · Total ${total}%`;
            },
            label: c => {
              const val = c.parsed.y || 0;
              if (!val) return '';
              return ` ${c.dataset.employeeName}: ${val}%`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            font: { size: 11 },
            color: '#374151',
            maxRotation: 45,
            minRotation: 35,
          },
          grid: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: '#6B7280',
            callback: v => `${v}%`,
          },
          grid: { color: '#F3F4F6' },
          title: {
            display: true,
            text: 'FY workload contribution (%)',
            font: { size: 11 },
            color: '#9CA3AF',
          },
        },
      },
    },
  });
}


function insightRow(e) {
  const u = e.utilization;
  const displayU = Math.round(Number(u) || 0);
  const clr = uc(u), badge = ub(u), label = us(u);
  return `<div class="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer" onclick="openEmployeeDetailModal(${e.id})">
    <div class="relative flex-shrink-0"><div class="w-10 h-10 avatar-grad rounded-full flex items-center justify-center text-sm">${esc(inits(e.name))}</div><div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${u === 0 ? 'bg-emerald-400' : u >= 80 ? 'bg-red-400' : 'bg-amber-400'}"></div></div>
    <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-gray-900 truncate">${esc(e.name)}</div><div class="text-xs text-gray-500">${esc(e.dept || '—')}</div></div>
    <div class="flex items-center gap-2 flex-shrink-0"><span class="${badge} text-xs px-2 py-0.5 rounded-full font-medium">${label}</span><span class="text-sm font-bold ${clr}">${displayU}%</span></div>
  </div>`;
}

/* ── Deal status badge ────────────────────────────────────────── */
function dealStatusBadge(status) {
  if (!status) return '';
  const map = {
    'NEW LOGO': { cls: 'bg-emerald-100 text-emerald-700', icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' },
    'REPEAT': { cls: 'bg-blue-100 text-blue-700', icon: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>' },
    'REACTIVE': { cls: 'bg-amber-100 text-amber-700', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  };
  const s = map[status] || map['NEW LOGO'];
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls} flex-shrink-0"><svg class="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="${status === 'NEW LOGO' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>${status}</span>`;
}

/* ================================================================ PRODUCT CATEGORY FILTER (Deal Acquisition Chart) */

/**
 * Classifies a project into a product bucket based on product_name and product_family.
 * Priority order: PS > Personal Use > Student Use > Subscription > Software > OTHER
 */
function classifyProduct(pn, pf) {
  const n = (pn || '').toUpperCase();
  const f = (pf || '').toUpperCase();
  // PS Only: PS System Support or PS Project Implementation (covers typo variant)
  if (n.includes('PS SYSTEM SUPPORT') || n.includes('PS PROJECT IMPLEMENT')) return 'PS';
  // Personal Use
  if (n.includes('ARCGIS FOR PERSONAL USE ONE YEAR ANNUAL SUBSCRIPTION')) return 'PERSONAL';
  // Student Use
  if (n.includes('ARCGIS FOR STUDENT USE ONE YEAR TIMEOUT LICENSE')) return 'STUDENT';
  // Subscription: has license/renew/subscription keywords but not caught above
  if (n.includes('LICENSE') || n.includes('RENEW') || n.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
  // Software: product_family is Software
  if (f === 'SOFTWARE') return 'SOFTWARE';
  return 'OTHER';
}

/**
 * Returns a filtered copy of a single FY chart entry,
 * keeping only projects matching the given product filter bucket.
 * When prodFilter is 'ALL', returns the entry unchanged.
 */


/* ── Deal breakdown modal ─────────────────────────────────────── */
function openDealModal(fyData) {
  const { label, projects } = fyData;

  const rowHtml = (p) => {
    const name = typeof p === 'string' ? p : (p.name || '');
    const saCode = typeof p === 'object' && p.code ? p.code : '';
    const oppName = typeof p === 'object' && p.opp_name ? p.opp_name : '';
    const prodName = typeof p === 'object' ? (p.product_name || '') : '';
    const prodFam = typeof p === 'object' ? (p.product_family || '') : '';
    const proj = saCode ? S.projects.find(x => x.code === saCode) : null;
    const projId = proj ? proj.id : null;
    const clickable = projId ? 'cursor-pointer deal-modal-row hover:bg-blue-50 hover:border-blue-200' : '';
    const dataAttr = projId ? ('data-proj-id="' + projId + '"') : '';
    const sub = [prodName, prodFam].filter(Boolean).join(' · ');
    return '<div class="py-2 px-3 bg-gray-50 rounded-lg border border-gray-100 transition-colors ' + clickable + '" ' + dataAttr + '>'
      + '<div class="flex items-start justify-between gap-2">'
      + '<div class="min-w-0 flex-1">'
      + '<div class="text-sm font-semibold text-gray-900 leading-snug">' + esc(name) + '</div>'
      + (oppName ? '<div class="text-xs text-gray-600 mt-0.5 truncate">' + esc(oppName) + '</div>' : '')
      + (sub ? '<div class="text-xs text-gray-400 mt-0.5">' + esc(sub) + '</div>' : '')
      + '</div>'
      + (saCode ? '<span class="text-xs font-bold text-blue-600 mono flex-shrink-0 mt-0.5">' + esc(saCode) + '</span>' : '')
      + '</div></div>';
  };

  const section = (status, badgeCls, icon) => {
    const list = projects[status] || [];
    if (!list.length) return '<div class="mb-4"><div class="flex items-center gap-2 mb-1.5">'
      + '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + badgeCls + '">' + icon + ' ' + status + '</span>'
      + '<span class="text-xs text-gray-400">0 accounts</span></div></div>';
    return '<div class="mb-5">'
      + '<div class="flex items-center gap-2 mb-2">'
      + '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + badgeCls + '">' + icon + ' ' + status + '</span>'
      + '<span class="text-xs text-gray-400">' + list.length + ' account' + (list.length === 1 ? '' : 's') + '</span>'
      + '</div>'
      + '<div class="space-y-1.5">' + list.map(rowHtml).join('') + '</div>'
      + '</div>';
  };

  openModal(mHdr(label + ' \u2014 Deal Breakdown', 'Unique accounts \u00b7 click a row to open project details')
    + '<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">'
    + section('NEW LOGO', 'bg-emerald-100 text-emerald-700', '\u2b50')
    + section('REPEAT', 'bg-blue-100 text-blue-700', '\u21ba')
    + section('REACTIVE', 'bg-amber-100 text-amber-700', '\u26a1')
    + '</div>'
    + '<div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">'
    + '<button onclick="closeModal()" class="btn-gray">Close</button>'
    + '</div>', 'max-w-xl');

  // Wire up click-to-open-project
  document.querySelectorAll('#modalRoot .deal-modal-row[data-proj-id]').forEach(el => {
    el.addEventListener('click', () => {
      closeModal();
      openProjectModal({ id: +el.dataset.projId });
    });
  });
}


/* ================================================================ NEW LOGO CHART */
const centerLabelPlugin = {
  id: 'centerLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      chart.getDatasetMeta(i).data.forEach((bar, idx) => {
        const val = ds.data[idx];
        if (!val || val < 1) return;
        const { x, y } = bar.getProps(['x', 'y'], true);
        ctx.save();
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 13px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val, x, y - 4);
        ctx.restore();
      });
    });
  }
};

function renderNewLogoChart(data, filter, prodFilter) {
  if (data) S.newLogoChartData = data;

  const f = filter !== undefined ? filter : S.newLogoFilter;
  S.newLogoFilter = f;
  if (prodFilter !== undefined) S.nlProductFilter = prodFilter instanceof Set ? prodFilter : new Set([prodFilter]);
  const pf = S.nlProductFilter;

  // Merge multi-category data: sum counts per FY across all selected categories
  const allCats = [...pf];
  const isAllMode = allCats.includes('ALL');
  const cats = isAllMode ? ['ALL'] : allCats;

  // Build merged dataset
  const fyMap = {};
  for (const cat of cats) {
    const catData = S.newLogoChartData[cat] || [];
    for (const fy of catData) {
      if (!fyMap[fy.fy]) fyMap[fy.fy] = { fy: fy.fy, label: fy.label, 'NEW LOGO': 0, 'REPEAT': 0, 'REACTIVE': 0, projects: { 'NEW LOGO': [], 'REPEAT': [], 'REACTIVE': [] } };
      const entry = fyMap[fy.fy];
      for (const st of ['NEW LOGO', 'REPEAT', 'REACTIVE']) {
        if (isAllMode || cats.length === 1) {
          entry[st] = fy[st];
          entry.projects[st] = fy.projects[st];
        } else {
          // Multi-category: deduplicate accounts across categories
          const existing = new Set(entry.projects[st].map(p => (p.name || '').toLowerCase()));
          for (const proj of (fy.projects[st] || [])) {
            const key = (proj.name || '').toLowerCase();
            if (!existing.has(key)) { existing.add(key); entry.projects[st].push(proj); }
          }
          entry[st] = entry.projects[st].length;
        }
      }
    }
  }
  const d = Object.values(fyMap).sort((a, b) => a.fy - b.fy);

  // Sync deal-status buttons
  document.querySelectorAll('.nl-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.status === f)
  );

  // Sync category buttons
  document.querySelectorAll('.nl-prod-btn').forEach(b => {
    const isActive = pf.has(b.dataset.prod);
    b.style.background = isActive ? '#1e40af' : 'white';
    b.style.color = isActive ? 'white' : '#374151';
    b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
  });

  if (S.charts.newLogo) S.charts.newLogo.destroy();
  const canvas = document.getElementById('newLogoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const mkGrad = (c1, c2) => {
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  };
  const COLORS = {
    'NEW LOGO': { bg: mkGrad('rgba(20,184,166,0.92)', 'rgba(14,165,233,0.72)'), hover: '#0d9488' },
    'REPEAT': { bg: mkGrad('rgba(59,130,246,0.92)', 'rgba(99,102,241,0.72)'), hover: '#2563eb' },
    'REACTIVE': { bg: mkGrad('rgba(245,158,11,0.92)', 'rgba(249,115,22,0.72)'), hover: '#d97706' },
  };

  let datasets, plugins, showLegend;
  if (f === 'COMBINED') {
    datasets = ['NEW LOGO', 'REPEAT', 'REACTIVE'].map(st => ({
      label: st,
      data: d.map(x => x[st] || 0),
      backgroundColor: COLORS[st].bg,
      hoverBackgroundColor: COLORS[st].hover,
      borderRadius: 5, borderSkipped: false,
      barPercentage: 0.85, categoryPercentage: 0.82,
    }));
    plugins = [centerLabelPlugin]; showLegend = true;
  } else {
    datasets = [{
      label: f,
      data: d.map(x => x[f] || 0),
      backgroundColor: COLORS[f].bg,
      hoverBackgroundColor: COLORS[f].hover,
      borderRadius: 8, borderSkipped: false,
      barPercentage: 0.85, categoryPercentage: 0.65,
    }];
    plugins = [centerLabelPlugin]; showLegend = false;
  }

  S.charts.newLogo = new Chart(ctx, {
    type: 'bar',
    plugins,
    data: { labels: d.map(x => x.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 28, left: 4, right: 4, bottom: 0 } },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const idx2 = elements[0].index;
        if (d[idx2]) openDealModal(d[idx2]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 20,
            font: { size: 12, weight: '600' },
            generateLabels: chart => chart.data.datasets.map((ds, i) => ({
              text: ds.label,
              fillStyle: ['#14b8a6', '#3b82f6', '#f59e0b'][i],
              strokeStyle: 'transparent',
              index: i,
            }))
          }
        },
        tooltip: {
          bodyFont: { size: 12 }, titleFont: { size: 12, weight: '600' }, padding: 10,
          callbacks: { label: c => `  ${c.dataset.label}: ${c.parsed.y} account${c.parsed.y === 1 ? '' : 's'}` },
        },
      },
      scales: {
        x: { ticks: { font: { size: 13, weight: '600' }, color: '#374151' }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 }, color: '#6B7280' }, grid: { color: '#F3F4F6' }, border: { display: false } },
      }
    }
  });
}


/* ── Revenue chart drill-down modal ──────────────────────────── */
function openRevenueModal(d) {
  // Format full number with commas, no K abbreviation
  const fmtFull = v => {
    if (!v && v !== 0) return '$0.00';
    return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const projRow = (p, showFamily) => `
    <div class="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-gray-800 truncate">${esc(p.name)}</div>
        <div class="text-xs text-gray-400 mono">${esc(p.code)}${showFamily && p.product_family ? ` · ${esc(p.product_family)}` : ''}</div>
      </div>
      <span class="text-xs font-bold text-gray-700 mono flex-shrink-0">${fmtFull(p.amount)}</span>
    </div>`;

  const allProjs = d.all_projects || [];
  const psProjs = d.ps_projects || [];
  const totalAmt = d.total_amount || 0;
  const psAmt = d.ps_amount || 0;
  const pct = totalAmt > 0 ? (psAmt / totalAmt * 100) : 0;

  openModal(`${mHdr(d.label + ' — Revenue Breakdown', 'Closed Won · Total Amount and PS Amount both use Product Amount only')}
    <div class="p-6 overflow-y-auto nice-scroll space-y-6" style="max-height:65vh">

      <!-- Total Amount section -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:#0ea5e9"></span>
            <span class="text-sm font-semibold text-gray-800">Total Amount</span>
            <span class="text-xs text-gray-400">${allProjs.length} project${allProjs.length === 1 ? '' : 's'}</span>
          </div>
          <span class="text-sm font-bold text-sky-600 mono">${fmtFull(totalAmt)}</span>
        </div>
        <div class="space-y-1 max-h-48 overflow-y-auto nice-scroll pr-1">
          ${allProjs.map(p => projRow(p, true)).join('') || '<p class="text-xs text-gray-400 px-3">No projects</p>'}
        </div>
      </div>

      <!-- PS Amount section -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:#8b5cf6"></span>
            <span class="text-sm font-semibold text-gray-800">PS Amount</span>
            <span class="text-xs text-gray-400">${psProjs.length} PS project${psProjs.length === 1 ? '' : 's'}</span>
          </div>
          <span class="text-sm font-bold text-violet-600 mono">${fmtFull(psAmt)}</span>
        </div>
        <div class="space-y-1 max-h-48 overflow-y-auto nice-scroll pr-1">
          ${psProjs.map(p => projRow(p, false)).join('') || '<p class="text-xs text-gray-400 px-3">No PS projects this FY</p>'}
        </div>
      </div>

      <!-- PS Share % calculation -->
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:#10b981"></span>
          <span class="text-sm font-semibold text-emerald-800">PS Share % — Calculation</span>
        </div>
        <div class="font-mono text-sm text-emerald-900 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-emerald-700">PS Amount (Product Amount from PS product rows)</span>
            <span class="font-bold">${fmtFull(psAmt)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-emerald-700">Total Amount (sum of Product Amount)</span>
            <span class="font-bold">${fmtFull(totalAmt)}</span>
          </div>
          <div class="border-t border-emerald-200 my-2"></div>
          <div class="flex items-center justify-between text-base">
            <span class="text-emerald-700">${fmtFull(psAmt)} ÷ ${fmtFull(totalAmt)} × 100</span>
            <span class="font-bold text-emerald-800 text-lg">${pct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
      <button onclick="closeModal()" class="btn-gray">Close</button>
    </div>`, 'max-w-xl');
}


/* ================================================================ PS REVENUE CHART */
function renderPsRevenueChart(data, prodFilter) {
  if (data) S.psRevenueData = data;
  if (prodFilter !== undefined) S.nlProductFilter = prodFilter instanceof Set ? prodFilter : new Set([prodFilter]);
  const pf = S.nlProductFilter;

  // Merge multi-category revenue data
  const allCats = [...pf];
  const isAllMode = allCats.includes('ALL');
  const cats = isAllMode ? ['ALL'] : allCats;

  const fyMap = {};
  for (const cat of cats) {
    const catData = S.psRevenueData[cat] || [];
    for (const fy of catData) {
      if (!fyMap[fy.fy]) fyMap[fy.fy] = { ...fy, total_amount: 0, ps_amount: 0, all_projects: [], ps_projects: [] };
      const entry = fyMap[fy.fy];
      if (isAllMode || cats.length === 1) {
        entry.total_amount = fy.total_amount;
        entry.ps_amount = fy.ps_amount;
        entry.pct = fy.pct;
        entry.all_projects = fy.all_projects;
        entry.ps_projects = fy.ps_projects;
      } else {
        // Multi-category: sum amounts, dedup projects by code
        const seenAll = new Set(entry.all_projects.map(p => p.code));
        const seenPS = new Set(entry.ps_projects.map(p => p.code));
        for (const p of (fy.all_projects || [])) { if (!seenAll.has(p.code)) { seenAll.add(p.code); entry.all_projects.push(p); entry.total_amount += p.amount || 0; } }
        for (const p of (fy.ps_projects || [])) { if (!seenPS.has(p.code)) { seenPS.add(p.code); entry.ps_projects.push(p); entry.ps_amount += p.amount || 0; } }
        entry.pct = entry.total_amount > 0 ? +((entry.ps_amount / entry.total_amount) * 100).toFixed(1) : 0;
      }
    }
  }
  const data2 = Object.values(fyMap).sort((a, b) => a.fy - b.fy);

  // Sync category buttons
  document.querySelectorAll('.nl-prod-btn').forEach(b => {
    const isActive = pf.has(b.dataset.prod);
    b.style.background = isActive ? '#1e40af' : 'white';
    b.style.color = isActive ? 'white' : '#374151';
    b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
  });

  if (S.charts.psRevenue) S.charts.psRevenue.destroy();
  if (S.charts.psRevenue) S.charts.psRevenue.destroy();
  const canvas = document.getElementById('psRevenueChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const fmtUsdK = v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(2) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(1) + 'K' : '$' + Number(v).toFixed(0);

  const gradTotal = ctx.createLinearGradient(0, 0, 0, 300);
  gradTotal.addColorStop(0, 'rgba(14,165,233,0.88)'); gradTotal.addColorStop(1, 'rgba(56,189,248,0.55)');
  const gradPS = ctx.createLinearGradient(0, 0, 0, 300);
  gradPS.addColorStop(0, 'rgba(139,92,246,0.88)'); gradPS.addColorStop(1, 'rgba(99,102,241,0.55)');
  const gradPct = ctx.createLinearGradient(0, 0, 0, 300);
  gradPct.addColorStop(0, 'rgba(16,185,129,0.88)'); gradPct.addColorStop(1, 'rgba(52,211,153,0.55)');

  const labelPlugin = {
    id: 'barTopLabel',
    afterDatasetsDraw(chart) {
      const { ctx: c } = chart;
      chart.data.datasets.forEach((ds, dsIdx) => {
        chart.getDatasetMeta(dsIdx).data.forEach((bar, i) => {
          const val = ds.data[i];
          if (!val && val !== 0) return;
          const { x, y } = bar.getProps(['x', 'y'], true);
          c.save(); c.fillStyle = '#1f2937'; c.font = 'bold 11px Inter,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.fillText(dsIdx === 0 ? fmtUsdK(val) : dsIdx === 1 ? fmtUsdK(val) : val.toFixed(1) + '%', x, y - 3);
          c.restore();
        });
      });
    }
  };

  S.charts.psRevenue = new Chart(ctx, {
    type: 'bar',
    plugins: [labelPlugin],
    data: {
      labels: data2.map(d => d.label),
      datasets: [
        { label: 'Total Amount', data: data2.map(d => d.total_amount), backgroundColor: gradTotal, hoverBackgroundColor: '#0ea5e9', borderRadius: 5, borderSkipped: false, yAxisID: 'yAmt', barPercentage: 0.85, categoryPercentage: 0.75 },
        { label: 'PS Amount', data: data2.map(d => d.ps_amount), backgroundColor: gradPS, hoverBackgroundColor: '#7c3aed', borderRadius: 5, borderSkipped: false, yAxisID: 'yAmt', barPercentage: 0.85, categoryPercentage: 0.75 },
        { label: 'PS Share %', data: data2.map(d => d.pct), backgroundColor: gradPct, hoverBackgroundColor: '#059669', borderRadius: 5, borderSkipped: false, yAxisID: 'yPct', barPercentage: 0.85, categoryPercentage: 0.75 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (data2[idx]) openRevenueModal(data2[idx]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      layout: { padding: { top: 28, left: 4, right: 4, bottom: 0 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 18, font: { size: 12, weight: '600' }, generateLabels: () => [
              { text: 'Total Amount', fillStyle: '#0ea5e9', strokeStyle: 'transparent', index: 0 },
              { text: 'PS Amount', fillStyle: '#8b5cf6', strokeStyle: 'transparent', index: 1 },
              { text: 'PS Share %', fillStyle: '#10b981', strokeStyle: 'transparent', index: 2 },
            ]
          }
        },
        tooltip: {
          bodyFont: { size: 12 }, titleFont: { size: 12, weight: '600' }, padding: 12,
          callbacks: {
            title: items => items[0].label,
            label: c => c.datasetIndex === 0 ? `  Total Amount: ${fmtUsdK(c.parsed.y)}` : c.datasetIndex === 1 ? `  PS Amount:    ${fmtUsdK(c.parsed.y)}` : `  PS Share:     ${c.parsed.y.toFixed(1)}%`
          }
        },
      },
      scales: {
        x: { ticks: { font: { size: 13, weight: '600' }, color: '#374151' }, grid: { display: false }, border: { display: false } },
        yAmt: { type: 'linear', position: 'left', beginAtZero: true, ticks: { font: { size: 11 }, color: '#6B7280', callback: v => fmtUsdK(v) }, grid: { color: '#F3F4F6' }, border: { display: false }, title: { display: true, text: 'Amount (USD)', font: { size: 11 }, color: '#9CA3AF' } },
        yPct: { type: 'linear', position: 'right', beginAtZero: true, max: 100, ticks: { font: { size: 11 }, color: '#6B7280', callback: v => v + '%' }, grid: { display: false }, border: { display: false }, title: { display: true, text: 'PS Share %', font: { size: 11 }, color: '#9CA3AF' } }
      }
    }
  });
}

/* ── PS Type chart drill-down modal ──────────────────────────── */
function openPsTypeModal(d) {
  const section = (title, count, color, projects) => {
    const empty = '<p class="text-xs text-gray-400 px-3 py-2">No projects this FY</p>';
    return `<div>
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:${color}"></span>
          <span class="text-sm font-semibold text-gray-800">${esc(title)}</span>
          <span class="text-xs text-gray-400">${count} project${count === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="space-y-1 max-h-60 overflow-y-auto nice-scroll pr-1">
        ${projects.length
        ? projects.map((name, i) => `
            <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
              <span class="text-xs font-medium text-gray-400 w-5 flex-shrink-0">${i + 1}.</span>
              <span class="text-sm text-gray-800">${esc(name)}</span>
            </div>`).join('')
        : empty}
      </div>
    </div>`;
  };

  openModal(`${mHdr(d.label + ' — PS Service Mix', 'Closed Won projects by engagement type')}
    <div class="p-6 overflow-y-auto nice-scroll space-y-6" style="max-height:65vh">
      ${section('PS System Support', d.support, '#3b82f6', d.supportProjects || [])}
      <div class="border-t border-gray-100"></div>
      ${section('PS Project Implementation', d.impl, '#10b981', d.implProjects || [])}
    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
      <button onclick="closeModal()" class="btn-gray">Close</button>
    </div>`, 'max-w-lg');
}

/* ================================================================ PS TYPE CHART (Chart 3) */
function renderPsTypeChart(data) {
  if (S.charts.psType) S.charts.psType.destroy();
  const canvas = document.getElementById('psTypeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const gradSupport = ctx.createLinearGradient(0, 0, 0, 300);
  gradSupport.addColorStop(0, 'rgba(59,130,246,0.90)'); gradSupport.addColorStop(1, 'rgba(99,102,241,0.60)');
  const gradImpl = ctx.createLinearGradient(0, 0, 0, 300);
  gradImpl.addColorStop(0, 'rgba(16,185,129,0.90)'); gradImpl.addColorStop(1, 'rgba(52,211,153,0.60)');

  const labelPlugin = {
    id: 'psTypeLabel',
    afterDatasetsDraw(chart) {
      const { ctx: c } = chart;
      chart.data.datasets.forEach((ds, di) => {
        chart.getDatasetMeta(di).data.forEach((bar, i) => {
          const val = ds.data[i];
          if (!val || val < 1) return;
          const { x, y } = bar.getProps(['x', 'y'], true);
          c.save(); c.fillStyle = '#1f2937'; c.font = 'bold 12px Inter,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.fillText(val, x, y - 3); c.restore();
        });
      });
    }
  };

  S.charts.psType = new Chart(ctx, {
    type: 'bar',
    plugins: [labelPlugin],
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: 'PS System Support', data: data.map(d => d.support), backgroundColor: gradSupport, hoverBackgroundColor: '#2563eb', borderRadius: 5, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.72 },
        { label: 'PS Project Implementation', data: data.map(d => d.impl), backgroundColor: gradImpl, hoverBackgroundColor: '#059669', borderRadius: 5, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.72 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24, left: 4, right: 4, bottom: 0 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (S.psTypeData[idx]) openPsTypeModal(S.psTypeData[idx]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 20, font: { size: 12, weight: '600' }, generateLabels: () => [
              { text: 'PS System Support', fillStyle: '#3b82f6', strokeStyle: 'transparent', index: 0 },
              { text: 'PS Project Implementation', fillStyle: '#10b981', strokeStyle: 'transparent', index: 1 },
            ]
          }
        },
        tooltip: { bodyFont: { size: 12 }, titleFont: { size: 12, weight: '600' }, padding: 10, callbacks: { label: c => `  ${c.dataset.label}: ${c.parsed.y} deal${c.parsed.y === 1 ? '' : 's'}` } },
      },
      scales: {
        x: { ticks: { font: { size: 13, weight: '600' }, color: '#374151' }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 }, color: '#6B7280' }, grid: { color: '#F3F4F6' }, border: { display: false } },
      }
    }
  });
}

/* ── Chart tab switching ──────────────────────────────────────── */
function switchChartTab(tab) {
  document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.chartTab === tab));
  document.querySelectorAll('.chart-tab-content').forEach(c => c.classList.toggle('hidden', !c.id.endsWith('-' + tab)));
  const filters = document.getElementById('dealAcqFilters');
  // Category filter visible on acquisition + revenue; hidden on PS Engagement tab
  if (filters) filters.classList.toggle('hidden', tab === 'tab3');
  // Status filter row (COMBINED / NEW LOGO / REPEAT / REACTIVE) only on acquisition tab
  const statusRow = document.getElementById('dealStatusFilterRow');
  if (statusRow) statusRow.classList.toggle('hidden', tab !== 'acquisition');
  if (tab === 'revenue') renderPsRevenueChart(null, S.nlProductFilter);
  if (tab === 'tab3') renderPsTypeChart(S.psTypeData);
  if (tab === 'acquisition') renderNewLogoChart(null, S.newLogoFilter, S.nlProductFilter);
}

/* ================================================================ RUNNING PROJECTS */
function runningProjectRowHtml(d) {
  const barColor = '#10B981';
  const amount = fmtUsd(d.product_amount || 0);
  const closingDate = d.closing_date || d.project_closing_date || d.end_date;
  const today = new Date();
  const daysVal = closingDate ? Math.round((new Date(closingDate) - today) / 864e5) : null;
  const isPast = daysVal !== null && daysVal < 0;
  const isSoon = daysVal !== null && daysVal >= 0 && daysVal < 14;
  const status = daysVal === null ? '—' : isPast ? 'PS Work Begins' : isSoon ? 'Due Soon' : 'On Track';
  const statC = isPast ? 'text-green-600' : isSoon ? 'text-orange-500' : 'text-green-600';
  const absD = Math.abs(daysVal || 0);
  const daysLabel = daysVal === null ? '' : daysVal === 0 ? 'Today' : isPast ? `${absD} days ago` : `in ${daysVal} days`;
  const daysColor = isPast ? 'text-green-600' : isSoon ? 'text-orange-500' : 'text-gray-500';

  return `<div class="px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer relative" data-action="edit-project" data-project="${d.id}">
    <div class="absolute left-0 top-0 bottom-0 w-1 rounded-r" style="background:${barColor}"></div>
    <div class="ml-2">
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="text-xs font-bold text-blue-600 mono tracking-wide">${esc(d.code)}</span>
        <span class="text-sm font-bold text-gray-800 mono flex-shrink-0">${amount}</span>
      </div>
      <div class="text-sm font-semibold text-gray-900 mb-1 leading-snug">${esc(d.name)}</div>
      ${(d.account_name || d.client) ? `<div class="text-xs text-gray-600 mb-1"><span class="font-medium">${esc(d.account_name || d.client || '—')}</span>${d.product_name ? `<span class="text-gray-400 mx-1">·</span><span class="text-gray-500">${esc(d.product_name)}</span>` : ''}</div>` : ''}
      ${(d.product_family || d.product_name) ? `<div class="mb-1 flex items-center gap-1.5 flex-wrap">${d.product_family ? `<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(d.product_family)}</span>` : ''}${d.product_name ? `<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">${esc(d.product_name)}</span>` : ''}</div>` : ''}
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-green-100 text-green-700">Closed Won</span>
          ${dealStatusBadge(d.deal_status)}
          ${d.opportunity_owner ? `<span class="text-xs text-gray-500 truncate">${esc(d.opportunity_owner)}</span>` : ''}
        </div>
        ${d.end_date ? `<span class="text-xs text-gray-500 flex-shrink-0">Close: <span class="font-medium text-gray-700">${esc(d.end_date)}</span></span>` : ''}
      </div>
      ${closingDate ? `<div class="flex items-center gap-1.5 text-xs mb-2">
        <svg class="w-3 h-3 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span class="text-gray-500">${esc(closingDate)}</span>
        <span class="font-semibold ${daysColor}">${daysLabel}</span>
        <span class="ml-auto font-semibold ${statC}">${status}</span>
      </div>` : '<div class="mb-2"></div>'}
      <div class="flex items-center gap-2">
        <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${d.progress || 0}%;background:${barColor}"></div></div>
        <span class="text-xs font-medium text-gray-600 w-8 text-right">${d.progress || 0}%</span>
      </div>
    </div>
  </div>`;
}

function applyAndRenderRunning() {
  const el = document.getElementById('runningProjectsList');
  if (!el) return;
  const filtered = applyRunningFilters(S.lastRunningData);
  el.innerHTML = filtered.map(runningProjectRowHtml).join('') || '<div class="px-6 py-8 text-center text-sm text-gray-400">No running projects</div>';
}

function renderRunningProjects(data) { S.lastRunningData = data; applyAndRenderRunning(); }

/* ================================================================ SERVICE PIPELINE */
function servicePipelineRowHtml(p) {
  const barColor = STAGE_COLOR[p.stage] || '#6B7280', pillCls = STAGE_PILL[p.stage] || 'bg-gray-100 text-gray-700';
  const amount = fmtUsd(p.product_amount ?? 0);
  let projCloseDateHtml = '<div class="text-xs text-gray-400 mt-0.5">Project Close Date: —</div>';
  if (p.project_closing_date) {
    const today = new Date(), dv = Math.round((new Date(p.project_closing_date) - today) / 864e5);
    const isPast = dv < 0, lbl = dv === 0 ? 'Today' : isPast ? `${Math.abs(dv)} days ago` : `${dv} days left`;
    const lc = isPast ? 'text-green-600' : 'text-red-500';
    projCloseDateHtml = `<div class="text-xs text-gray-500 mt-0.5">Project Close Date: <span class="font-medium text-gray-700">${esc(p.project_closing_date)}</span> <span class="font-semibold ${lc}">${lbl}</span></div>`;
  }
  return `<div class="px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer relative" data-action="edit-project" data-project="${p.id}">
    <div class="absolute left-0 top-0 bottom-0 w-1 rounded-r" style="background:${barColor}"></div>
    <div class="ml-2">
      <div class="flex items-center justify-between gap-2 mb-1"><span class="text-xs font-bold text-blue-600 mono tracking-wide">${esc(p.code)}</span><span class="text-sm font-bold text-gray-800 mono flex-shrink-0">${amount}</span></div>
      <div class="text-sm font-semibold text-gray-900 mb-1 leading-snug">${esc(p.name)}</div>
      <div class="text-xs text-gray-600 mb-1"><span class="font-medium">${esc(p.account_name || p.client || '—')}</span>${p.product_name ? `<span class="text-gray-400 mx-1">·</span><span class="text-gray-500">${esc(p.product_name)}</span>` : ''}</div>
      ${p.product_family ? `<div class="mb-1"><span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(p.product_family)}</span></div>` : ''}
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-1.5 min-w-0 pt-0.5 flex-wrap"><span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${pillCls}">${esc(p.stage)}</span>${dealStatusBadge(p.deal_status)}${p.opportunity_owner ? `<span class="text-xs text-gray-500 truncate">${esc(p.opportunity_owner)}</span>` : ''}</div>
        <div class="text-right flex-shrink-0 ml-3">${p.end_date ? `<div class="text-xs text-gray-500">Close Date: <span class="font-medium text-gray-700">${esc(p.end_date)}</span></div>` : ''}${projCloseDateHtml}</div>
      </div>
      <div class="flex items-center gap-2"><div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${p.progress || 0}%;background:${barColor}"></div></div><span class="text-xs font-medium text-gray-600 w-8 text-right">${p.progress || 0}%</span></div>
    </div>
  </div>`;
}

function applyAndRenderPipeline() {
  const active = S.projects.filter(p => p.stage !== 'Closed Won');
  const filtered = applyPipelineFilters(active);
  document.getElementById('pipelineList').innerHTML = filtered.map(servicePipelineRowHtml).join('') || '<div class="px-6 py-8 text-center text-sm text-gray-400">No projects</div>';
}

function renderServicePipeline(projects) { applyAndRenderPipeline(); }

/* ── Populate Product Family / Product Type dropdowns ───────────────────────── */
function populateProductFamilyDropdowns() {
  const runFamilies = [...new Set((S.lastRunningData || []).map(d => d.product_family).filter(Boolean))].sort();
  const pipeFamilies = [...new Set((S.projects || []).filter(p => p.stage !== 'Closed Won' && p.stage !== 'Closed Lost').map(p => p.product_family).filter(Boolean))].sort();
  const runProductTypes = uniqueNormalizedProductTypes(S.lastRunningData || []);
  const pipeProductTypes = uniqueNormalizedProductTypes((S.projects || []).filter(p => p.stage !== 'Closed Won' && p.stage !== 'Closed Lost'));
  const fillSelect = (id, opts, allLabel, normalize = false) => { const el = document.getElementById(id); if (!el) return; const cur = normalize ? normalizeProductTypeName(el.value) : el.value; el.innerHTML = `<option value="">${allLabel}</option>` + opts.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join(''); el.value = opts.includes(cur) ? cur : ''; };
  fillSelect('runProdFamilyFilt', runFamilies, 'All Families');
  fillSelect('pipeProdFamilyFilt', pipeFamilies, 'All Families');
  fillSelect('runProductTypeFilt', runProductTypes, 'All Product Name', true);
  fillSelect('pipeProductTypeFilt', pipeProductTypes, 'All Product Name', true);
}

/* ================================================================ MODALS */
function openModal(html, width = 'max-w-lg') {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="fixed inset-0 modal-bd flex items-center justify-center z-50 p-4" id="mbd">
    <div class="bg-white rounded-2xl shadow-2xl w-full ${width} modal-enter">${html}</div>
  </div>`;
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

const mHdr = (title, sub) => `<div class="p-6 border-b border-gray-200 flex items-center justify-between"><div><h2 class="text-lg font-semibold text-gray-900">${esc(title)}</h2><p class="text-sm text-gray-500 mt-0.5">${esc(sub)}</p></div><button onclick="closeModal()" class="p-2 hover:bg-gray-100 rounded-lg"><svg class="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12M6 6l12 12"/></svg></button></div>`;
const mFtr = (id, saveFn, delFn) => `<div class="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-2xl"><div>${id ? `<button onclick="${delFn}(${id})" class="btn-red text-sm">Delete</button>` : ''}</div><div class="flex gap-3"><button onclick="closeModal()" class="btn-gray">Cancel</button><button onclick="${saveFn}(${id || 'null'})" class="btn-blue">${id ? 'Save Changes' : 'Create'}</button></div></div>`;

/* ── View All ─────────────────────────────────────────────────── */
function openViewAllModal(type) {
  let title, items, listHtml;
  if (type === 'pipeline') {
    title = 'All Service Pipeline';
    items = applyPipelineFilters(S.projects.filter(p => p.stage !== 'Closed Won'));
    listHtml = items.map(servicePipelineRowHtml).join('');
  } else {
    title = 'All Running Projects';
    items = applyRunningFilters(S.lastRunningData);
    listHtml = items.map(runningProjectRowHtml).join('');
  }
  openModal(`${mHdr(title, `${items.length} item${items.length === 1 ? '' : 's'}`)}<div class="p-4"><div class="overflow-y-auto nice-scroll" style="max-height:70vh">${listHtml || '<div class="text-center text-gray-400 py-12">No items</div>'}</div></div><div class="p-4 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-2xl"><button onclick="closeModal()" class="btn-gray">Close</button></div>`, 'max-w-3xl');
}

/* ── Assignment modal ─────────────────────────────────────────── */
function openAssignmentModal(opts = {}) {
  const editing = !!opts.id, cur = editing ? S.assignments.find(a => a.id === opts.id) : null;
  const selectableEmployees = getActiveEmployees();
  const employeeOptions = selectableEmployees.length ? selectableEmployees : S.employees;
  let empId = opts.employee_id || (cur && cur.employee_id) || (employeeOptions[0] && employeeOptions[0].id);

  if (!employeeOptions.some(e => e.id === empId)) {
    empId = employeeOptions[0] && employeeOptions[0].id;
  }

  const pct = (cur && cur.percentage) || 50;
  const today = new Date();
  let defStart = formatDateInputLocal(today), defEnd = formatDateInputLocal(today);
  if (editing && cur && cur.year && cur.month && cur.week) {
    const dr = weekDateRange(cur.year, cur.month, cur.week);
    defStart = dr.start;
    defEnd = dr.end;
  } else if (!editing && opts.year && opts.month && opts.week) {
    const dr = weekDateRange(opts.year, opts.month, opts.week);
    defStart = dr.start;
    defEnd = dr.end;
  }
  const findProjectById = (id) => {
    if (id === null || id === undefined || id === '') return null;
    return S.projects.find(p => String(p.id) === String(id)) || null;
  };

  const getCustomerName = (proj, fallback = {}) => {
    return (
      proj?.account_name ||
      proj?.client ||
      proj?.customer_name ||
      fallback?.account_name ||
      fallback?.client ||
      fallback?.customer_name ||
      '—'
    );
  };

  const getProductName = (proj, fallback = {}) => {
    return (
      proj?.product_name ||
      fallback?.product_name ||
      '—'
    );
  };

  /* Searchable project combobox markup — shared by add & edit */
  const projCombo = (selectedId) => {
    const selProj = findProjectById(selectedId);
    const displayVal = selProj ? `${selProj.code} — ${selProj.name}` : '';
    return `
      <div class="proj-combo-wrap" style="position:relative">
        <input id="fa_proj_search" type="text" class="field-input" autocomplete="off"
          placeholder="Type SA code or project name…"
          value="${esc(displayVal)}"
          style="padding-right:2rem">
        <input type="hidden" id="fa_proj" value="${selectedId || ''}">
        <div id="fa_proj_dropdown"
          class="nice-scroll"
          style="display:none;position:absolute;z-index:9999;left:0;right:0;top:100%;
                 background:#fff;border:1px solid #e5e7eb;border-radius:0.5rem;
                 box-shadow:0 4px 16px rgba(0,0,0,0.10);max-height:220px;overflow-y:auto;margin-top:2px">
        </div>
      </div>`;
  };

  /* Customer Name / Product Name info block — shared by add & edit, auto-filled from the selected project */
  const projInfoBlock = (selectedId, fallback = {}) => {
    const proj = findProjectById(selectedId);
    const custVal = getCustomerName(proj, fallback);
    const prodVal = getProductName(proj, fallback);

    return `
      <div class="grid grid-cols-2 gap-4 -mt-2">
        <div>
          <label class="field-label">Customer Name</label>
          <input id="fa_customer_name" type="text" class="field-input bg-gray-50 text-gray-700 font-semibold cursor-default" value="${esc(custVal)}" readonly title="${esc(custVal)}">
        </div>
        <div>
          <label class="field-label">Product Name</label>
          <input id="fa_product_name" type="text" class="field-input bg-gray-50 text-gray-700 font-semibold cursor-default" value="${esc(prodVal)}" readonly title="${esc(prodVal)}">
        </div>
      </div>`;
  };

  const pctScaleHtml = () => `
    <div class="relative text-xs text-gray-400 mt-2 h-4">
      <span style="position:absolute;left:0%;transform:translateX(0);">0%</span>
      <span style="position:absolute;left:20%;transform:translateX(-50%);">20%</span>
      <span style="position:absolute;left:40%;transform:translateX(-50%);">40%</span>
      <span style="position:absolute;left:50%;transform:translateX(-50%);">50%</span>
      <span style="position:absolute;left:60%;transform:translateX(-50%);">60%</span>
      <span style="position:absolute;left:80%;transform:translateX(-50%);">80%</span>
      <span style="position:absolute;left:100%;transform:translateX(-100%);">100%</span>
    </div>`;

  if (editing) {
    openModal(`${mHdr('Edit Assignment', 'Update workload allocation')}
      <div class="p-6 space-y-4">
        <div><label class="field-label">Resource</label>
          <select id="fa_emp" class="field-input">${employeeOptions.map(e => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}</select>
        </div>
        <div><label class="field-label">Project</label>${projCombo(cur?.project_id)}</div>
        ${projInfoBlock(cur?.project_id, cur)}
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">Start Date</label>
            <input id="fa_start" type="date" class="field-input" value="${defStart}"></div>
          <div><label class="field-label">End Date</label>
            <input id="fa_end" type="date" class="field-input" value="${defEnd}"></div>
        </div>
        <div>
          <label class="field-label flex justify-between"><span>Workload Allocation</span>
            <span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span>
          </label>
          <div class="flex gap-2 mb-2">
            <button type="button" onclick="setPct(50)"  class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">½ Day (50%)</button>
            <button type="button" onclick="setPct(100)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Full Day (100%)</button>
            <button type="button" onclick="setPct(0)"   class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Off (0%)</button>
          </div>
          <input id="fa_pct" type="range" min="0" max="100" step="1" value="${pct}" class="w-full accent-blue-600"
            oninput="syncPctLabel(this.value)">
          ${pctScaleHtml()}
        </div>
      </div>
      ${mFtr(opts.id, 'saveAssignment', 'deleteAssignment')}`);
  } else {
    openModal(`${mHdr('Add Assignment', 'Assign a resource to a project across a date range')}
      <div class="p-6 space-y-4">
        <div><label class="field-label">Resource</label>
          <select id="fa_emp" class="field-input">${employeeOptions.map(e => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}</select>
        </div>
        <div><label class="field-label">Project</label>${projCombo(opts.project_id || null)}</div>
        ${projInfoBlock(opts.project_id || null, {})}
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">Start Date</label>
            <input id="fa_start" type="date" class="field-input" value="${defStart}" oninput="updateSlotPreview()"></div>
          <div><label class="field-label">End Date</label>
            <input id="fa_end" type="date" class="field-input" value="${defEnd}" oninput="updateSlotPreview()"></div>
        </div>
        <div><label class="field-label">Quick Presets</label>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-preset" onclick="setDateRange('week')">This Week</button>
            <button type="button" class="btn-preset" onclick="setDateRange('month')">This Month</button>
            <button type="button" class="btn-preset" onclick="setDateRange('3months')">Next 3 Months</button>
            <button type="button" class="btn-preset" onclick="setDateRange('fiscalyear')">Full Fiscal Year</button>
          </div>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800" id="slotPreview">
          Will create <span class="font-semibold">0</span> weekly assignments
        </div>
        <div>
          <label class="field-label flex justify-between"><span>Workload per Week</span>
            <span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span>
          </label>
          <div class="flex gap-2 mb-2">
            <button type="button" onclick="setPct(50)"  class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">½ Day (50%)</button>
            <button type="button" onclick="setPct(100)" class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Full Day (100%)</button>
            <button type="button" onclick="setPct(0)"   class="pct-preset-btn flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all">Off (0%)</button>
          </div>
          <input id="fa_pct" type="range" min="0" max="100" step="1" value="${pct}" class="w-full accent-blue-600"
            oninput="syncPctLabel(this.value)">
          ${pctScaleHtml()}
        </div>
      </div>
      ${mFtr(null, 'saveAssignment', 'deleteAssignment')}`);
    updateSlotPreview();
  }

  /* ── Wire up percentage preset buttons ── */
  window.setPct = function (val) {
    const slider = document.getElementById('fa_pct');
    if (slider) { slider.value = val; syncPctLabel(val); }
  };
  window.syncPctLabel = function (val) {
    const lbl = document.getElementById('pctLbl');
    if (lbl) lbl.textContent = val + '%';
    // Highlight active preset button
    document.querySelectorAll('.pct-preset-btn').forEach(b => {
      const m = b.getAttribute('onclick'); const bVal = m && m.match(/setPct.(\d+)/)?.[1];
      const isActive = bVal && +bVal === +val;
      b.style.background = isActive ? '#1e40af' : 'white';
      b.style.color = isActive ? 'white' : '#374151';
      b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
    });
  };
  // Sync on open
  syncPctLabel(document.getElementById('fa_pct')?.value || 100);

  /* ── Wire up searchable project combobox ── */
  const searchInput = document.getElementById('fa_proj_search');
  const hiddenInput = document.getElementById('fa_proj');
  const dropdown = document.getElementById('fa_proj_dropdown');
  if (!searchInput || !dropdown) return;

  /* Distinct projects by id */
  const projList = S.projects.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

  /* Update Customer Name / Product Name info block to reflect the currently selected project */
  function syncProjInfo(projId) {
    const proj = findProjectById(projId);
    const custVal = getCustomerName(proj, {});
    const prodVal = getProductName(proj, {});

    const custEl = document.getElementById('fa_customer_name');
    const prodEl = document.getElementById('fa_product_name');

    if (custEl) {
      custEl.value = custVal;
      custEl.title = custVal;
    }

    if (prodEl) {
      prodEl.value = prodVal;
      prodEl.title = prodVal;
    }
  }

  function renderDropdown(q) {
    const lq = q.toLowerCase().trim();
    const matches = lq
      ? projList.filter(p =>
        (p.code || '').toLowerCase().includes(lq) ||
        (p.name || '').toLowerCase().includes(lq) ||
        (p.product_name || '').toLowerCase().includes(lq))
      : projList;

    if (!matches.length) {
      dropdown.innerHTML = `<div class="px-4 py-3 text-sm text-gray-400">No projects found</div>`;
    } else {
      dropdown.innerHTML = matches.slice(0, 80).map(p => `
        <div class="proj-opt px-3 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 last:border-0"
             data-id="${p.id}" data-label="${esc(p.code + ' — ' + p.name)}"
             style="display:flex;flex-direction:column;gap:1px">
          <span style="font-size:12px;font-weight:700;color:#2563eb;font-family:monospace">${esc(p.code)}</span>
          <span style="font-size:13px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
          ${p.product_name ? `<span style="font-size:11px;color:#9ca3af">${esc(p.product_name)}</span>` : ''}
        </div>`).join('');
    }
    dropdown.style.display = 'block';
  }

  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => {
    hiddenInput.value = ''; // clear selection when typing
    syncProjInfo('');
    renderDropdown(searchInput.value);
  });

  dropdown.addEventListener('mousedown', e => {
    const opt = e.target.closest('.proj-opt');
    if (!opt) return;
    e.preventDefault();
    hiddenInput.value = opt.dataset.id;
    searchInput.value = opt.dataset.label;
    syncProjInfo(opt.dataset.id);
    dropdown.style.display = 'none';
  });

  document.addEventListener('mousedown', function outsideClick(e) {
    if (!e.target.closest('.proj-combo-wrap')) {
      dropdown.style.display = 'none';
      if (!hiddenInput.value) { searchInput.value = ''; syncProjInfo(''); }
      document.removeEventListener('mousedown', outsideClick);
    }
  }, true);
}

function setDateRange(preset) {
  const t = new Date();
  let s, e;

  if (preset === 'week') {
    s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    e = addDaysLocal(s, 6);
  } else if (preset === 'month') {
    s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    e = new Date(t.getFullYear(), t.getMonth() + 1, t.getDate());
  } else if (preset === '3months') {
    s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    e = new Date(t.getFullYear(), t.getMonth() + 3, t.getDate());
  } else {
    s = new Date(S.fiscalYear, 3, 1);
    e = new Date(S.fiscalYear + 1, 2, 31);
  }

  document.getElementById('fa_start').value = formatDateInputLocal(s);
  document.getElementById('fa_end').value = formatDateInputLocal(e);
  updateSlotPreview();
}

function updateSlotPreview() { const s = document.getElementById('fa_start'), e = document.getElementById('fa_end'), pv = document.getElementById('slotPreview'); if (!s || !e || !pv) return; const slots = expandDateRange(s.value, e.value); pv.innerHTML = `Will create <span class="font-semibold">${slots.length}</span> weekly assignment${slots.length === 1 ? '' : 's'}`; pv.className = slots.length > 0 ? 'bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800' : 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800'; }

async function saveAssignment(id) {
  const projId = document.getElementById('fa_proj')?.value;
  if (!projId) { toast('Please select a project', 'error'); return; }
  const slots = expandDateRange(document.getElementById('fa_start').value, document.getElementById('fa_end').value);
  if (!slots.length) { toast('Invalid date range', 'error'); return; }
  const payload = { employee_id: +document.getElementById('fa_emp').value, project_id: +projId, percentage: +document.getElementById('fa_pct').value, slots };
  try {
    if (id) {
      const r = await api('POST', `/api/assignments/${id}/reschedule`, payload);
      closeModal(); toast(`Assignment updated across ${r.created} week slot${r.created === 1 ? '' : 's'}`); await loadAll(); return;
    }
    const r = await api('POST', '/api/assignments/bulk', payload);
    closeModal(); toast(`Created ${r.created} assignment${r.created === 1 ? '' : 's'}`); await loadAll();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAssignment(id) { if (!confirm('Delete this assignment?')) return; try { await api('DELETE', `/api/assignments/${id}`); closeModal(); toast('Assignment deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

/* ── Resource (Employee) modal ────────────────────────────────── */
function openEmployeeModal(opts = {}) {
  const editing = !!opts.id, e = editing ? S.employees.find(x => x.id === opts.id) : null;
  const name = e ? e.name : '', dept = e ? e.dept : 'Professional Services', email = e ? e.email || '' : '', code = e ? e.employee_code || '' : '';
  const depts = ['Solution', 'Professional Services', 'Finance', 'Sales', 'Operations', 'Management'];
  openModal(`${mHdr(editing ? 'Edit Resource' : 'Add Resource', editing ? 'Update resource details' : 'Add a new team resource')}<div class="p-6 space-y-4"><div><label class="field-label">Full Name</label><input id="fe_name" type="text" class="field-input" value="${esc(name)}" placeholder="e.g. Nusrath Jahan Nisha"></div><div><label class="field-label">Resource ID (Employee ID)</label><input id="fe_code" type="text" class="field-input mono" value="${esc(code)}" placeholder="e.g. SGESA00055"></div><div><label class="field-label">Email</label><input id="fe_email" type="email" class="field-input" value="${esc(email)}"></div><div><label class="field-label">Department</label><select id="fe_dept" class="field-input">${depts.map(d => `<option ${d === dept ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>${mFtr(editing ? opts.id : null, 'saveEmployee', 'deleteEmployee')}`);
}

async function saveEmployee(id) {
  const code = document.getElementById('fe_code').value.trim();
  const name = document.getElementById('fe_name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  try { const p = { employee_code: code, name, dept: document.getElementById('fe_dept').value, email: document.getElementById('fe_email').value.trim() }; if (id) await api('PUT', `/api/employees/${id}`, p); else await api('POST', '/api/employees', p); closeModal(); toast(`Resource ${id ? 'updated' : 'added'}`); await loadAll(); } catch (e) { toast(e.message, 'error'); }
}

async function deleteEmployee(id) { if (!confirm('Delete this resource? All their assignments will also be removed.')) return; try { await api('DELETE', `/api/employees/${id}`); closeModal(); toast('Resource deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

/* ── Project modal ────────────────────────────────────────────── */
function openProjectModal(opts = {}) {
  const editing = !!opts.id, p = editing ? S.projects.find(x => x.id === opts.id) : null, v = (k, fb) => p ? (p[k] ?? fb) : fb;
  const OWNER_OPTS = ['Abdullah Al Baki', 'Basher Muhammad Raquibul Raquibul', 'Zobayer Ahmed', 'Most Iffat Ara Ila', 'Md Naiemul Haque Chowdhury', 'Mohammad A. Hadi'];
  const todayStr = new Date().toISOString().slice(0, 10);
  openModal(`${mHdr(editing ? 'Edit Project' : 'Add Project', editing ? 'Update project details' : 'Register a new project')}<div class="p-6 space-y-4 max-h-[55vh] overflow-y-auto nice-scroll">
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Opportunity Number</label><input id="fp_code" type="text" class="field-input mono" value="${esc(v('code', ''))}" placeholder="e.g. SA136664"></div><div><label class="field-label">Priority</label><select id="fp_pri" class="field-input">${PRIORITIES.map(x => `<option ${x === v('priority', 'Medium') ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div><label class="field-label">Project Name</label><input id="fp_name" type="text" class="field-input" value="${esc(v('name', ''))}" placeholder="e.g. Desktop SW for IWM 2026"></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Account Name</label><input id="fp_account" type="text" class="field-input" value="${esc(v('account_name', v('client', '')))}"></div><div><label class="field-label">Product Name</label><input id="fp_product_name" type="text" class="field-input" value="${esc(v('product_name', ''))}"></div></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Product Family</label><input id="fp_product_family" type="text" class="field-input" value="${esc(v('product_family', ''))}" placeholder="e.g. Professional Service, Software…"></div><div><label class="field-label">Opportunity Owner</label><input id="fp_owner" type="text" class="field-input" list="ownerList" value="${esc(v('opportunity_owner', ''))}"><datalist id="ownerList">${OWNER_OPTS.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div></div>
    <div><label class="field-label">Stage</label><select id="fp_stage" class="field-input">${STAGES.map(x => `<option ${x === v('stage', 'Prospect') ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Product Amount (USD)</label><input id="fp_product_amount" type="number" class="field-input" value="${v('product_amount', 0)}" min="0" step="0.01"></div><div><label class="field-label">Probability (%)</label><input id="fp_probability" type="number" class="field-input" value="${v('probability', 0)}" min="0" max="100" step="5"></div></div>
    <div class="grid grid-cols-3 gap-3"><div><label class="field-label">Created Date</label><input id="fp_created" type="date" class="field-input" value="${esc(v('created_date', todayStr))}"></div><div><label class="field-label">Closed Won Date</label><input id="fp_end" type="date" class="field-input" value="${esc(v('end_date', ''))}"></div><div><label class="field-label">Project Closing Date</label><input id="fp_closing" type="date" class="field-input" value="${esc(v('project_closing_date', ''))}"></div></div>
    <div><label class="field-label">Amount (USD)</label><input id="fp_opp_amount" type="number" class="field-input" value="${v('opp_amount', 0)}" min="0" step="0.01"></div>
    <div><label class="field-label">Progress (internal) <span class="text-xs text-gray-400 font-normal ml-1">0 – 100</span></label><input id="fp_prog" type="number" min="0" max="100" step="1" value="${v('progress', 0)}" class="field-input" placeholder="0"></div>
    <div><label class="field-label">Color</label><div class="flex flex-wrap gap-2" id="cpkr">${PCOLORS.map(c => `<button type="button" data-c="${c}" class="w-8 h-8 rounded-lg ${c === v('color', '#8B5CF6') ? 'ring-2 ring-offset-2 ring-gray-900' : ''}" style="background:${c}"></button>`).join('')}</div><input type="hidden" id="fp_color" value="${v('color', '#8B5CF6')}"></div>
  </div>${mFtr(editing ? opts.id : null, 'saveProject', 'deleteProject')}`);
  document.querySelectorAll('#cpkr button').forEach(b => b.addEventListener('click', () => { document.getElementById('fp_color').value = b.dataset.c; document.querySelectorAll('#cpkr button').forEach(x => x.classList.remove('ring-2', 'ring-offset-2', 'ring-gray-900')); b.classList.add('ring-2', 'ring-offset-2', 'ring-gray-900'); }));
}

async function saveProject(id) {
  const code = document.getElementById('fp_code').value.trim().toUpperCase();
  const name = document.getElementById('fp_name').value.trim();
  if (!code || !name) { toast('Opportunity Number and Project Name are required', 'error'); return; }
  const amount = +document.getElementById('fp_opp_amount').value;
  const payload = { code, name, account_name: document.getElementById('fp_account').value.trim(), client: document.getElementById('fp_account').value.trim(), product_name: document.getElementById('fp_product_name').value.trim(), product_family: document.getElementById('fp_product_family').value.trim(), opportunity_owner: document.getElementById('fp_owner').value.trim(), stage: document.getElementById('fp_stage').value, priority: document.getElementById('fp_pri').value, product_amount: +document.getElementById('fp_product_amount').value, probability: +document.getElementById('fp_probability').value, created_date: document.getElementById('fp_created').value, end_date: document.getElementById('fp_end').value, project_closing_date: document.getElementById('fp_closing').value, opp_amount: amount, budget: amount, progress: +document.getElementById('fp_prog').value, color: document.getElementById('fp_color').value };
  try { if (id) await api('PUT', `/api/projects/${id}`, payload); else await api('POST', '/api/projects', payload); closeModal(); toast(`Project ${id ? 'updated' : 'created'}`); await loadAll(); } catch (e) { toast(e.message, 'error'); }
}

async function deleteProject(id) { if (!confirm('Delete this project? All its assignments will also be removed.')) return; try { await api('DELETE', `/api/projects/${id}`); closeModal(); toast('Project deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

/* ── Active Resources drill-down ─────────────────────────────── */
function openEmployeesModal() {
  const rows = S.employees.map((e, i) => `
    <div class="flex items-center gap-4 py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer last:border-0" data-action="edit-emp-side" data-emp="${e.id}">
      <span class="text-xs font-semibold text-gray-400 w-5 flex-shrink-0">${i + 1}</span>
      <div class="w-9 h-9 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(e.name))}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-gray-900">${esc(e.name)}</div>
        <div class="text-xs text-gray-500 mono">${esc(e.employee_code || '—')}</div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-xs text-gray-500">${esc(e.dept)}</div>
        <div class="text-xs text-gray-400 truncate max-w-[160px]">${esc(e.email || '—')}</div>
      </div>
      <div class="flex-shrink-0">
        ${(() => { const u = S.employeeUtil.get(e.id) || 0; return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${ub(u)}">${Math.round(u)}%</span>`; })()}
      </div>
    </div>`).join('');

  const tableHtml = (emps) => emps.length
    ? `<table class="w-full text-left border-collapse">
        <thead><tr class="border-b border-gray-200">
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Code</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Name</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Dept</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Util</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Status</th>
        </tr></thead>
        <tbody>${emps.map(e => '').join('')}</tbody>
      </table>`
    : '<p class="text-sm text-gray-400 py-4 px-4">None</p>';

  // (Note: full Active Resources modal is implemented in openResourceModal below)
}

/* ================================================================ EVENTS */
function initEvents() {
  const addBtn = document.getElementById('addMenuBtn'), addMenu = document.getElementById('addMenu');
  addBtn.addEventListener('click', e => { e.stopPropagation(); addMenu.classList.toggle('hidden'); });
  document.addEventListener('click', () => addMenu.classList.add('hidden'));
  addMenu.querySelectorAll('button[data-add]').forEach(b => b.addEventListener('click', () => {
    addMenu.classList.add('hidden');
    if (b.dataset.add === 'resource') openEmployeeModal();
    if (b.dataset.add === 'project') openProjectModal();
    if (b.dataset.add === 'assignment') openAssignmentModal();
    if (b.dataset.add === 'project-excel') document.getElementById('projectExcelUpload')?.click();
  }));

  document.getElementById('searchBox').addEventListener('input', e => { S.searchQuery = e.target.value; renderMatrix(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* Matrix filter listeners */
  const mfBind = (id, key) => { const el = document.getElementById(id); if (el) el.addEventListener('change', e => { S[key] = e.target.value || null; renderMatrix(); }); };
  mfBind('matrixProjectFilter', 'matrixProjectFilter');
  mfBind('matrixResourceFilter', 'matrixResourceFilter');
  document.getElementById('matrixMonthFilter')?.addEventListener('change', e => { S.matrixMonthFilter = e.target.value; renderMatrix(); });
  document.getElementById('matrixStageFilter')?.addEventListener('change', e => { S.matrixStageFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixAmountFilter')?.addEventListener('change', e => { S.matrixAmountFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixCloseDateFilter')?.addEventListener('change', e => { S.matrixCloseDateFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixProjCloseFilter')?.addEventListener('change', e => { S.matrixProjCloseFilt = e.target.value; renderMatrix(); });

  function bindSortBtn(id, activeKey, clearKeys) {
    const btn = document.getElementById(id); if (!btn) return;
    btn.addEventListener('click', () => {
      S[activeKey] = !S[activeKey];
      if (S[activeKey]) clearKeys.forEach(k => S[k] = false);
      btn.classList.toggle('active', S[activeKey]);
      clearKeys.forEach(k => { const el = document.getElementById({ 'matrixSortHigh': 'matrixSortHighBtn', 'matrixSortLow': 'matrixSortLowBtn', 'matrixSortAssigned': 'matrixSortAssignedBtn' }[k]); if (el) el.classList.remove('active'); });
      renderMatrix();
    });
  }
  bindSortBtn('matrixSortHighBtn', 'matrixSortHigh', ['matrixSortLow', 'matrixSortAssigned']);
  bindSortBtn('matrixSortLowBtn', 'matrixSortLow', ['matrixSortHigh', 'matrixSortAssigned']);
  bindSortBtn('matrixSortAssignedBtn', 'matrixSortAssigned', ['matrixSortHigh', 'matrixSortLow']);

  /* Pipeline filter listeners */
  document.getElementById('pipeStageFilt')?.addEventListener('change', e => { S.pipelineStageFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeDealStatusFilt')?.addEventListener('change', e => { S.pipelineDealStatusFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeAmountFilt')?.addEventListener('change', e => { S.pipelineAmountFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeCloseFilt')?.addEventListener('change', e => { S.pipelineCloseFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProjCloseFilt')?.addEventListener('change', e => { S.pipelineProjCloseFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProdFamilyFilt')?.addEventListener('change', e => { S.pipelineProdFamilyFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProductTypeFilt')?.addEventListener('change', e => { S.pipelineProductTypeFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeSearch')?.addEventListener('input', e => { S.pipelineSearch = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeSortAssignedBtn')?.addEventListener('click', () => { S.pipelineSortAssigned = !S.pipelineSortAssigned; document.getElementById('pipeSortAssignedBtn').classList.toggle('active', S.pipelineSortAssigned); applyAndRenderPipeline(); });

  /* Running filter listeners */
  document.getElementById('runAmountFilt')?.addEventListener('change', e => { S.runAmountFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runCloseFilt')?.addEventListener('change', e => { S.runCloseFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProjCloseFilt')?.addEventListener('change', e => { S.runProjCloseFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProdFamilyFilt')?.addEventListener('change', e => { S.runProdFamilyFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProductTypeFilt')?.addEventListener('change', e => { S.runProductTypeFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runSearch')?.addEventListener('input', e => { S.runSearch = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runSortAssignedBtn')?.addEventListener('click', () => { S.runSortAssigned = !S.runSortAssigned; document.getElementById('runSortAssignedBtn').classList.toggle('active', S.runSortAssigned); applyAndRenderRunning(); });

  /* Matrix table click */
  document.getElementById('matrixTable').addEventListener('click', e => {
    const del = e.target.closest('[data-action="delete-assign"]'); if (del) { e.stopPropagation(); deleteAssignment(+del.dataset.id); return; }
    const chip = e.target.closest('[data-action="edit-assign"]'); if (chip) { e.stopPropagation(); openAssignmentModal({ id: +chip.dataset.id }); return; }
    const emp = e.target.closest('[data-action="edit-emp"]'); if (emp) { e.stopPropagation(); openEmployeeModal({ id: +emp.dataset.emp }); return; }
    const cell = e.target.closest('td.cell'); if (cell) openAssignmentModal({ employee_id: +cell.dataset.emp, year: +cell.dataset.year, month: +cell.dataset.month, week: +cell.dataset.week });
  });

  /* Body delegation */
  document.body.addEventListener('click', e => {
    const ep = e.target.closest('[data-action="edit-emp-side"]'); if (ep) openEmployeeModal({ id: +ep.dataset.emp });
    const pr = e.target.closest('[data-action="edit-project"]'); if (pr) openProjectModal({ id: +pr.dataset.project });
    const va = e.target.closest('[data-view-all]'); if (va) openViewAllModal(va.dataset.viewAll);
    const sa = e.target.closest('[data-stat-action]');
    if (sa) {
      if (sa.dataset.statAction === 'view-employees') openResourceModal();
      if (sa.dataset.statAction === 'view-projects') openProjectsModal();
    }
  });

  /* Chart section tab buttons */
  document.querySelectorAll('.chart-tab-btn').forEach(b => b.addEventListener('click', () => switchChartTab(b.dataset.chartTab)));

  /* New Logo deal-status filter buttons (COMBINED / NEW LOGO / REPEAT / REACTIVE) */
  document.querySelectorAll('.nl-filter-btn').forEach(b =>
    b.addEventListener('click', () => renderNewLogoChart(null, b.dataset.status, S.nlProductFilter))
  );

  /* Category filter buttons — multi-select, shared across Deal Acquisition + Revenue tabs */
  document.querySelectorAll('.nl-prod-btn').forEach(b =>
    b.addEventListener('click', () => {
      const prod = b.dataset.prod;
      const pf = S.nlProductFilter;

      if (prod === 'ALL') {
        // ALL clears everything and selects only ALL
        S.nlProductFilter = new Set(['ALL']);
      } else {
        // Remove ALL when selecting specific categories
        pf.delete('ALL');
        if (pf.has(prod)) {
          pf.delete(prod);
          // If nothing left, fall back to ALL
          if (pf.size === 0) S.nlProductFilter = new Set(['ALL']);
        } else {
          pf.add(prod);
        }
      }

      // Sync button visuals
      document.querySelectorAll('.nl-prod-btn').forEach(btn => {
        const active = S.nlProductFilter.has(btn.dataset.prod);
        btn.style.background = active ? '#1e40af' : 'white';
        btn.style.color = active ? 'white' : '#374151';
        btn.style.borderColor = active ? '#1e40af' : '#e5e7eb';
      });

      const activeTab = document.querySelector('.chart-tab-btn.active')?.dataset?.chartTab;
      if (activeTab === 'revenue') {
        renderPsRevenueChart(null, S.nlProductFilter);
      } else {
        renderNewLogoChart(null, S.newLogoFilter, S.nlProductFilter);
      }
    })
  );



  /* Resource Assignment Matrix / Yearly Work by Project tabs */
  document.querySelectorAll('.resource-matrix-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchResourceMatrixTab(btn.dataset.resourceMatrixTab));
  });

  /* Work Summary tabs + Time Sheet Excel upload */
  document.querySelectorAll('.work-summary-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchWorkSummaryTab(btn.dataset.workSummaryTab));
  });
  document.getElementById('individualSummaryMonthFilter')?.addEventListener('change', e => {
    S.individualSummaryMonthFilter = e.target.value || '';
    renderIndividualSummaryChart();
  });

  document.getElementById('timesheetUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleTimesheetUpload(file);
    e.target.value = '';
  });

  document.getElementById('projectExcelUpload')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleProjectExcelUpload(file);
    e.target.value = '';
  });

  initColResize(); initSectionDrag();
}

/* ── Column resize ────────────────────────────────────────────── */
function initColResize() { const root = document.documentElement; let ac = null, sx = 0, sw = 0; const gw = col => parseInt(getComputedStyle(root).getPropertyValue(`--${col}-w`), 10) || (col === 'name' ? 220 : 160); document.getElementById('matrixWrap').addEventListener('mousedown', e => { const h = e.target.closest('.col-resizer'); if (!h) return; e.preventDefault(); ac = h.dataset.col; sx = e.clientX; sw = gw(ac); h.classList.add('active'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }); document.addEventListener('mousemove', e => { if (!ac) return; root.style.setProperty(`--${ac}-w`, Math.max(100, sw + (e.clientX - sx)) + 'px'); }); document.addEventListener('mouseup', () => { if (!ac) return; document.querySelectorAll('.col-resizer.active').forEach(el => el.classList.remove('active')); ac = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; }); }

/* ── Section drag ─────────────────────────────────────────────── */
function initSectionDrag() { const canvas = document.getElementById('dashboard-canvas'); let dSrc = null, lTgt = null, lInd = null; let raf = null, py = 0; const EDGE = 130, SPD = 18; function loop() { const vh = window.innerHeight; if (py < EDGE) window.scrollBy(0, -SPD * (1 - py / EDGE)); else if (py > vh - EDGE) window.scrollBy(0, SPD * ((py - (vh - EDGE)) / EDGE)); raf = requestAnimationFrame(loop); } const start = () => { if (!raf) raf = requestAnimationFrame(loop); }; const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } }; document.addEventListener('dragover', e => { if (!dSrc) return; py = e.clientY; start(); }); document.addEventListener('dragend', stop); document.addEventListener('drop', stop); function clrInd() { canvas.querySelectorAll('.ds').forEach(s => s.classList.remove('drop-above', 'drop-below')); } canvas.querySelectorAll('.ds').forEach(sec => { const h = sec.querySelector(':scope > .drag-handle'); if (!h) return; h.addEventListener('mousedown', () => sec.setAttribute('draggable', 'true')); document.addEventListener('mouseup', () => sec.setAttribute('draggable', 'false')); sec.addEventListener('dragstart', e => { dSrc = sec; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'section'); requestAnimationFrame(() => sec.classList.add('is-dragging')); }); sec.addEventListener('dragend', () => { sec.classList.remove('is-dragging'); sec.setAttribute('draggable', 'false'); clrInd(); stop(); dSrc = null; lTgt = null; }); sec.addEventListener('dragover', e => { if (!dSrc) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dSrc === sec) { clrInd(); return; } const rect = sec.getBoundingClientRect(), above = e.clientY < rect.top + rect.height / 2; if (lTgt !== sec || lInd !== (above ? 'above' : 'below')) { clrInd(); sec.classList.add(above ? 'drop-above' : 'drop-below'); lTgt = sec; lInd = above ? 'above' : 'below'; } }); sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget)) { sec.classList.remove('drop-above', 'drop-below'); if (lTgt === sec) lTgt = null; } }); sec.addEventListener('drop', e => { e.preventDefault(); if (!dSrc || dSrc === sec) return; const above = e.clientY < sec.getBoundingClientRect().top + sec.getBoundingClientRect().height / 2; if (above) canvas.insertBefore(dSrc, sec); else sec.after(dSrc); clrInd(); }); }); }

/* ── Card drag ────────────────────────────────────────────────── */
let cDragSrc = null;
function initCardDrag() { document.querySelectorAll('.dc:not([data-drag-init])').forEach(card => { card.setAttribute('data-drag-init', '1'); const h = card.querySelector(':scope > .dc-handle'); if (!h) return; h.addEventListener('mousedown', () => card.setAttribute('draggable', 'true')); document.addEventListener('mouseup', () => card.setAttribute('draggable', 'false')); card.addEventListener('dragstart', e => { e.stopPropagation(); cDragSrc = card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'card'); requestAnimationFrame(() => card.classList.add('is-dragging-card')); }); card.addEventListener('dragend', e => { e.stopPropagation(); card.classList.remove('is-dragging-card'); card.setAttribute('draggable', 'false'); document.querySelectorAll('.dc.drop-target').forEach(el => el.classList.remove('drop-target')); cDragSrc = null; }); card.addEventListener('dragover', e => { if (!cDragSrc || cDragSrc.parentElement !== card.parentElement) return; e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.dc.drop-target').forEach(el => { if (el !== card) el.classList.remove('drop-target'); }); if (card !== cDragSrc) card.classList.add('drop-target'); }); card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('drop-target'); }); card.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (!cDragSrc || cDragSrc === card || cDragSrc.parentElement !== card.parentElement) return; const par = card.parentElement, si = Array.from(par.children).indexOf(cDragSrc), di = Array.from(par.children).indexOf(card); if (si < di) par.insertBefore(cDragSrc, card.nextSibling); else par.insertBefore(cDragSrc, card); card.classList.remove('drop-target'); }); }); }

/* ================================================================ INIT */
async function init() { initEvents(); await loadAll(); }
init();

function openResourceModal() {
  const activeEmps = S.employees.filter(e => e.active !== 0);
  const inactiveEmps = S.employees.filter(e => e.active === 0);

  const empRow = (e) => {
    const isActive = e.active !== 0;
    const util = S.employeeUtil ? (S.employeeUtil.get(e.id) || 0) : 0;
    const clr = uc(util), badge = ub(util);
    return `<tr class="${isActive ? '' : 'opacity-50'} hover:bg-gray-50 transition-colors">
      <td class="py-2.5 px-4 text-sm text-gray-500">${esc(e.employee_code || '')}</td>
      <td class="py-2.5 px-4">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(e.name))}</div>
          <div>
            <div class="text-sm font-semibold text-gray-900">${esc(e.name)}</div>
            <div class="text-xs text-gray-400">${esc(e.email || '')}</div>
          </div>
        </div>
      </td>
      <td class="py-2.5 px-4 text-xs text-gray-500">${esc(e.dept || '—')}</td>
      <td class="py-2.5 px-4">
        <span class="${badge} text-xs px-2 py-0.5 rounded-full font-medium">${util}%</span>
      </td>
      <td class="py-2.5 px-4">
        <button onclick="toggleEmployeeActive(${e.id})"
          class="text-xs font-semibold px-3 py-1 rounded-full border transition-all ${isActive
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'}">
          ${isActive ? '✓ Active' : '✗ Inactive'}
        </button>
      </td>
    </tr>`;
  };

  const tableHtml = (emps) => emps.length
    ? `<table class="w-full text-left border-collapse">
        <thead><tr class="border-b border-gray-200">
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Code</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Name</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Dept</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Util</th>
          <th class="py-2 px-4 text-xs font-semibold text-gray-500">Status</th>
        </tr></thead>
        <tbody>${emps.map(empRow).join('')}</tbody>
      </table>`
    : '<p class="text-sm text-gray-400 py-4 px-4">None</p>';

  openModal(
    mHdr('Team Resources', `${activeEmps.length} active · ${inactiveEmps.length} inactive · productivity calculated on active only`)
    + `<div class="overflow-y-auto nice-scroll" style="max-height:65vh">
        <div class="px-4 pt-4 pb-1 text-xs font-bold text-gray-500 uppercase tracking-wider">Active Members (${activeEmps.length})</div>
        ${tableHtml(activeEmps)}
        ${inactiveEmps.length ? `
        <div class="px-4 pt-4 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Inactive Members (${inactiveEmps.length})</div>
        ${tableHtml(inactiveEmps)}` : ''}
      </div>
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-2xl'
  );
}

async function toggleEmployeeActive(empId) {
  try {
    const updated = await api('PATCH', `/api/employees/${empId}/active`);

    const idx = S.employees.findIndex(e => e.id === empId);
    if (idx >= 0) {
      S.employees[idx] = {
        ...S.employees[idx],
        ...updated,
      };
    }

    if (!updated.active && S.matrixResourceFilter && +S.matrixResourceFilter === empId) {
      S.matrixResourceFilter = null;
    }

    buildMatrix();
    populateMatrixFilter();
    renderMatrix();
    renderYearlyWorkByProjectChart();
    renderProjectWisePeopleChart();
    renderTeamSummaryChart();
    renderIndividualSummaryChart();
    renderInsights();

    openResourceModal();

    const fy = S.fiscalYear;
    api('GET', `/api/dashboard/stats?fiscalYear=${fy}`)
      .then(stats => renderStats(stats))
      .catch(() => { });

    toast(updated.active ? `${updated.name} set to Active` : `${updated.name} set to Inactive`);
  } catch (e) {
    toast('Failed to update status', 'error');
  }
}


function downloadAllProjectsExcel() {
  try {
    if (typeof XLSX === 'undefined') {
      toast('Excel library is not loaded. Please check SheetJS CDN access.', 'error');
      return;
    }

    const projectRows = (S.projects || []).map((p, idx) => {
      const asgs = (S.assignments || []).filter(a => a.project_id === p.id);
      const employeeIds = [...new Set(asgs.map(a => a.employee_id).filter(Boolean))];
      const resourceNames = employeeIds
        .map(id => (S.employees || []).find(e => e.id === id)?.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      const assignedWeightedWeeks = asgs.reduce((sum, a) => sum + ((Number(a.percentage) || 0) / 100), 0);
      const uniqueKey = [p.code || '', p.product_name || '', Number(p.product_amount || 0).toFixed(2)].join(' | ');

      return {
        'SL': idx + 1,
        'Opportunity Number': p.code || '',
        'Project Name': p.name || '',
        'Account Name': p.account_name || '',
        'Client': p.client || '',
        'Product Name': p.product_name || '',
        'Product Family': p.product_family || '',
        'Opportunity Owner': p.opportunity_owner || '',
        'Stage': p.stage || '',
        'Deal Status': p.deal_status || '',
        'Priority': p.priority || '',
        'Probability (%)': Number(p.probability) || 0,
        'Product Amount': Number(p.product_amount) || 0,
        'Amount': Number(p.opp_amount) || 0,
        'Budget': Number(p.budget) || 0,
        'Progress (%)': Number(p.progress) || 0,
        'Created Date': p.created_date || '',
        'Close Won Date': p.end_date || '',
        'Project Closing Date': p.project_closing_date || '',
        'Assignment Slot Count': asgs.length,
        'Assigned Resource Count': employeeIds.length,
        'Assigned Weighted Weeks': +assignedWeightedWeeks.toFixed(2),
        'Assigned Resource Names': resourceNames.join(', '),
        'Composite Import Key': uniqueKey,
      };
    });

    const stageSummary = {};
    for (const p of S.projects || []) {
      const key = p.stage || 'Unknown';
      stageSummary[key] ||= { 'Stage': key, 'Project Count': 0, 'Total Product Amount': 0, 'Total Amount': 0 };
      stageSummary[key]['Project Count'] += 1;
      stageSummary[key]['Total Product Amount'] += Number(p.product_amount) || 0;
      stageSummary[key]['Total Amount'] += Number(p.opp_amount) || 0;
    }

    const summaryRows = [
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() },
      { 'Metric': 'Total Projects', 'Value': (S.projects || []).length },
      { 'Metric': 'Total Assignment Slots', 'Value': (S.assignments || []).length },
      { 'Metric': 'Composite Key Used For Import Matching', 'Value': 'Opportunity Number + Product Name/Product Description + Product Amount' },
    ];

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsCompare = XLSX.utils.json_to_sheet(projectRows);
    const wsStage = XLSX.utils.json_to_sheet(Object.values(stageSummary));

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Export Summary');
    XLSX.utils.book_append_sheet(wb, wsCompare, 'Projects Compare');
    XLSX.utils.book_append_sheet(wb, wsStage, 'Stage Summary');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `allocation_dashboard_projects_${stamp}.xlsx`);
    toast(`Exported ${projectRows.length} projects`);
  } catch (e) {
    console.error(e);
    toast('Failed to download project Excel', 'error');
  }
}

window.downloadAllProjectsExcel = downloadAllProjectsExcel;

/* ================================================================ PROJECTS DRILL-DOWN (All Projects modal) */
function openProjectsModal() {
  const sorted = [...S.projects].sort((a, b) => {
    const so = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won', 'Closed Lost'];
    return so.indexOf(a.stage) - so.indexOf(b.stage);
  });

  const stageCounts = {};
  for (const p of S.projects) stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;

  const STAGE_ORDER = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won', 'Closed Lost'];

  const summaryPills = Object.entries(stageCounts)
    .sort((a, b) => STAGE_ORDER.indexOf(a[0]) - STAGE_ORDER.indexOf(b[0]))
    .map(([stage, count]) => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_PILL[stage] || 'bg-gray-100 text-gray-700'} cursor-pointer hover:opacity-75 transition-opacity" data-stage-pill="${esc(stage)}">${esc(stage)}: ${count}</span>`)
    .join('');

  function buildRows(filterStage, searchQ) {
    const q = (searchQ || '').toLowerCase().trim();
    const filtered = sorted.filter(p => {
      if (filterStage && p.stage !== filterStage) return false;
      if (!q) return true;
      return (p.code || '').toLowerCase().includes(q)
        || (p.name || '').toLowerCase().includes(q)
        || (p.product_name || '').toLowerCase().includes(q);
    });

    const rowsHtml = filtered.map((p, i) => `
      <div class="flex items-start gap-3 py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer last:border-0" data-action="edit-project" data-project="${p.id}">
        <span class="text-xs font-semibold text-gray-400 w-5 flex-shrink-0 pt-0.5">${i + 1}</span>
        <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style="background:${p.color || '#8B5CF6'}"></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-xs font-bold text-blue-600 mono">${esc(p.code)}</span>
            <span class="px-1.5 py-0.5 rounded text-xs font-semibold ${STAGE_PILL[p.stage] || 'bg-gray-100 text-gray-700'}">${esc(p.stage)}</span>
            ${p.product_family ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(p.product_family)}</span>` : ''}
          </div>
          <div class="text-sm font-semibold text-gray-900 truncate">${esc(p.name)}</div>
          <div class="text-xs text-gray-500 truncate">${esc(p.account_name || p.client || '—')}${p.opportunity_owner ? ` · ${esc(p.opportunity_owner)}` : ''}</div>
          ${p.product_name ? `<div class="text-xs text-gray-400 truncate mt-0.5">${esc(p.product_name)}</div>` : ''}
        </div>
        <div class="text-right flex-shrink-0 min-w-[90px]">
          <div class="text-xs font-bold text-gray-800 mono">${(p.product_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} USD</div>
          <div class="text-xs text-gray-400">${p.end_date || '—'}</div>
        </div>
      </div>`).join('');

    return { rowsHtml, count: filtered.length };
  }

  openModal(`${mHdr('All Projects', `${S.projects.length} total`)}
    <div class="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-1.5" id="projStagePills">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700 cursor-pointer hover:opacity-75 transition-opacity" data-stage-pill="">All</span>
      ${summaryPills}
    </div>
    <div class="px-4 py-2.5 border-b border-gray-100 bg-white">
      <input id="projModalSearch" type="text" placeholder="Search by SA code, project name, or product name…"
        class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400">
    </div>
    <div class="overflow-y-auto nice-scroll" id="projModalList" style="max-height:55vh">
      ${buildRows('', '').rowsHtml || '<p class="text-sm text-gray-400 text-center py-8">No projects found</p>'}
    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
      <span class="text-xs text-gray-400" id="projModalCount">${S.projects.length} project${S.projects.length === 1 ? '' : 's'}</span>
      <div class="flex items-center gap-2">
        <button onclick="window.downloadAllProjectsExcel()" class="btn-blue">Download Excel</button>
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>
    </div>`, 'max-w-3xl');

  let activeStage = '';

  function refresh() {
    const q = document.getElementById('projModalSearch')?.value || '';
    const { rowsHtml, count } = buildRows(activeStage, q);
    const list = document.getElementById('projModalList');
    const countEl = document.getElementById('projModalCount');
    if (list) list.innerHTML = rowsHtml || '<p class="text-sm text-gray-400 text-center py-8">No projects found</p>';
    if (countEl) countEl.textContent = `${count} project${count === 1 ? '' : 's'}`;
  }

  document.getElementById('projModalSearch')?.addEventListener('input', refresh);

  document.getElementById('projStagePills')?.addEventListener('click', e => {
    const pill = e.target.closest('[data-stage-pill]');
    if (!pill) return;
    activeStage = pill.dataset.stagePill;
    document.querySelectorAll('#projStagePills [data-stage-pill]').forEach(p => {
      const isActive = p.dataset.stagePill === activeStage;
      p.classList.toggle('ring-2', isActive);
      p.classList.toggle('ring-offset-1', isActive);
      p.classList.toggle('ring-gray-400', isActive);
    });
    refresh();
  });
}