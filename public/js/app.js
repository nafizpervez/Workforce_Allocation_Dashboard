/* ================================================================
   Workforce Allocation Dashboard — app.js
   ================================================================ */

/* ================================================================ STATE */
const S = {
  fiscalYear: 2026,
  employees: [], projects: [], assignments: [],
  matrix: {}, employeeUtil: new Map(), charts: {},
  searchQuery: '',
  insightsPeriodHigh: 'month',
  insightsPeriodLow: 'month',
  /* matrix filters */
  matrixProjectFilter: null, matrixResourceFilter: null,
  matrixMonthFilter: '', matrixStageFilt: '', matrixAmountFilt: '',
  matrixCloseDateFilt: '', matrixProjCloseFilt: '',
  matrixSortHigh: false, matrixSortLow: false, matrixSortAssigned: false,
  /* pipeline filters */
  pipelineStageFilt: '', pipelineAmountFilt: '', pipelineCloseFilt: '', pipelineProjCloseFilt: '', pipelineSortAssigned: false,
  /* running filters */
  runAmountFilt: '', runCloseFilt: '', runProjCloseFilt: '', runSortAssigned: false,
  /* cached data for re-filter */
  lastRunningData: [],
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
function fmtUsd(n) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD'; }

function expandDateRange(start, end) { const out = [], seen = new Set(); if (!start || !end) return out; const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00'); if (isNaN(s) || isNaN(e) || e < s) return out; const cur = new Date(s); while (cur <= e) { const y = cur.getFullYear(), m = cur.getMonth() + 1, d = cur.getDate(), w = d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4, k = `${y}-${m}-${w}`; if (!seen.has(k)) { seen.add(k); out.push({ year: y, month: m, week: w }); } cur.setDate(d + 1); } return out; }

/* ── filter helpers ──────────────────────────────────────────── */
function parseAmountRange(r) { if (!r) return null; if (r.endsWith('+')) return [+r.slice(0, -1), Infinity]; const p = r.split('-'); return [+p[0], +p[1]]; }

function matchDateFilter(dateStr, filter) {
  if (!dateStr || !filter) return true;
  const d = new Date(dateStr), now = new Date();
  if (filter === 'overdue') return d < now;
  if (filter === 'thismonth') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (filter === 'next3months') { const t = new Date(now); t.setMonth(t.getMonth() + 3); return d >= now && d <= t; }
  if (filter === 'thisyear') return d.getFullYear() === now.getFullYear();
  return true;
}

function getAmountOk(opp_amount, filt) { if (!filt) return true; const [min, max] = parseAmountRange(filt); const a = Number(opp_amount) || 0; return a >= min && (max === Infinity || a <= max); }

function getFteCount(projId) { return new Set(S.assignments.filter(a => a.project_id === projId).map(a => a.employee_id)).size; }

function applyPipelineFilters(list) {
  return list.filter(p => {
    if (S.pipelineStageFilt && p.stage !== S.pipelineStageFilt) return false;
    if (!getAmountOk(p.opp_amount, S.pipelineAmountFilt)) return false;
    if (!matchDateFilter(p.end_date, S.pipelineCloseFilt)) return false;
    if (!matchDateFilter(p.project_closing_date, S.pipelineProjCloseFilt)) return false;
    return true;
  }).sort((a, b) => S.pipelineSortAssigned ? (getFteCount(b.id) - getFteCount(a.id)) : 0);
}

function applyRunningFilters(list) {
  return list.filter(d => {
    if (!getAmountOk(d.opp_amount, S.runAmountFilt)) return false;
    const cd = d.closing_date || d.project_closing_date || d.end_date;
    if (S.runCloseFilt && !matchDateFilter(cd, S.runCloseFilt)) return false;
    if (S.runProjCloseFilt && !matchDateFilter(d.project_closing_date, S.runProjCloseFilt)) return false;
    return true;
  }).sort((a, b) => S.runSortAssigned ? (getFteCount(b.id) - getFteCount(a.id)) : 0);
}

/* ── local utilization (for period selector) ─────────────────── */
function calcLocalUtil(period) {
  const now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate();
  const curW = curD <= 7 ? 1 : curD <= 14 ? 2 : curD <= 21 ? 3 : 4;
  let rel;
  if (period === 'week') rel = S.assignments.filter(a => a.year === curY && a.month === curM && a.week === curW);
  else if (period === 'month') rel = S.assignments.filter(a => a.year === curY && a.month === curM);
  else rel = S.assignments;
  const wMap = {};
  for (const a of rel) { const k = `${a.employee_id}|${a.year}|${a.month}|${a.week}`; wMap[k] = (wMap[k] || 0) + a.percentage; }
  const emp = {};
  for (const [k, v] of Object.entries(wMap)) { const id = +k.split('|')[0]; (emp[id] || (emp[id] = [])).push(v); }
  const all = S.employees.map(e => ({ id: e.id, name: e.name, dept: e.dept, utilization: emp[e.id] ? +(emp[e.id].reduce((a, b) => a + b, 0) / emp[e.id].length).toFixed(1) : 0 })).sort((a, b) => a.utilization - b.utilization);
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

/* ================================================================ API */
async function api(method, path, body) { const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.status); } return r.json(); }

/* ================================================================ TOASTS */
function toast(msg, kind = 'success') { const root = document.getElementById('toasts'), c = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-gray-800' }[kind]; const el = document.createElement('div'); el.className = `toast-enter ${c} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 max-w-xs`; const ic = kind === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>' : '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'; el.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ic}</svg><span>${esc(msg)}</span>`; root.appendChild(el); setTimeout(() => { el.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => el.remove(), 250); }, 2800); }

/* ================================================================ LOAD */
async function loadAll() {
  try {
    const fy = S.fiscalYear;
    const [emps, projs, asgs, stats, trends, wl, util, pipe, dl] = await Promise.all([
      api('GET', '/api/employees'), api('GET', '/api/projects'),
      api('GET', `/api/assignments?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/stats?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/trends?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/workload?fiscalYear=${fy}`),
      api('GET', `/api/dashboard/utilization?fiscalYear=${fy}`),
      api('GET', '/api/dashboard/pipeline'),
      api('GET', '/api/dashboard/deadlines'),
    ]);
    S.employees = emps; S.projects = projs; S.assignments = asgs;
    buildMatrix();
    S.employeeUtil = new Map(util.all.map(u => [u.id, u.utilization]));
    renderStats(stats);
    renderMatrix();
    renderTrends(trends); renderWorkload(wl); renderAllocation(wl);
    renderInsights();
    S.lastRunningData = dl;
    applyAndRenderRunning();
    renderServicePipeline(projs);
    populateMatrixFilter();
    populatePipelineStageFilter();
    initCardDrag();
  } catch (e) { toast(e.message, 'error'); console.error(e); }
}

function buildMatrix() { S.matrix = {}; for (const a of S.assignments) { const k = `${a.year}-${a.month}-${a.week}`; S.matrix[a.employee_id] ||= {}; (S.matrix[a.employee_id][k] ||= []).push(a); } }

/* ================================================================ FILTER POPULATION */
function populateMatrixFilter() {
  /* Project */
  const ps = document.getElementById('matrixProjectFilter');
  if (ps) { const pids = new Set(S.assignments.map(a => a.project_id)); ps.innerHTML = '<option value="">All Projects</option>' + S.projects.filter(p => pids.has(p.id)).map(p => `<option value="${p.id}">${esc(p.code)} — ${esc(p.name)}</option>`).join(''); ps.value = String(S.matrixProjectFilter || ''); }
  /* Resource */
  const rs = document.getElementById('matrixResourceFilter');
  if (rs) { rs.innerHTML = '<option value="">All Resources</option>' + S.employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join(''); rs.value = String(S.matrixResourceFilter || ''); }
  /* Month */
  const ms = document.getElementById('matrixMonthFilter');
  if (ms && ms.options.length <= 1) { ms.innerHTML = '<option value="">All Months</option>' + fiscalMonths(S.fiscalYear).map(m => `<option value="${m.y}-${m.m}">${esc(m.label)}</option>`).join(''); }
  /* Stage */
  const ss = document.getElementById('matrixStageFilter');
  if (ss && ss.options.length <= 1) { ss.innerHTML = '<option value="">All Stages</option>' + STAGES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join(''); }
}

function populatePipelineStageFilter() {
  const sel = document.getElementById('pipeStageFilt');
  if (sel && sel.options.length <= 1) { sel.innerHTML = '<option value="">All Stages</option>' + STAGES.filter(s => s !== 'Closed Won').map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join(''); }
}

/* ================================================================ STATS */
function renderStats(s) {
  const t = s.trends || {};
  const n = s.active_employees || 1;
  const cards = [
    { v: s.active_employees.toLocaleString(), label: 'Active Resources', tk: 'employees', bg: 'bg-blue-100', fg: 'text-blue-600', formula: `Count of all resources registered in the system`, icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { v: s.active_projects.toLocaleString(), label: 'Active Projects', tk: 'projects', bg: 'bg-purple-100', fg: 'text-purple-600', formula: `Count of all projects registered in the system`, icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
    { v: s.avg_utilization + '%', label: 'Avg Utilization', tk: 'utilization', bg: 'bg-teal-100', fg: 'text-teal-600', formula: `Sum of all weekly allocation % ÷ Total assignment slots`, icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
    { v: s.assigned_projects.toLocaleString(), label: 'Assigned Projects', tk: 'assigned_projects', bg: 'bg-orange-100', fg: 'text-orange-600', formula: `Distinct projects with ≥ 1 weekly assignment in FY${S.fiscalYear}`, icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { v: `${s.productivity}/${s.ps_count}`, label: 'Productivity Score', tk: 'productivity', bg: 'bg-amber-100', fg: 'text-amber-600', formula: `Avg Utilization (${s.avg_utilization}%) ÷ ${s.ps_count} PS Resources = ${s.productivity}`, icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
    { v: s.on_time_pct + '%', label: 'On-Time Completion', tk: 'on_time', bg: 'bg-emerald-100', fg: 'text-emerald-600', formula: `On-track projects ÷ Total projects × 100`, icon: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
  ];
  document.getElementById('statsRow').innerHTML = cards.map(c => {
    const td = t[c.tk] || { value: '—', up: true }, up = td.up;
    return `<div class="dc dc-stat"><div class="dc-handle" title="Drag card"><svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg></div>
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
  for (let i = 0; i < months.length; i++)for (let w = 1; w <= 4; w++)th += `<th class="border-b border-gray-200 px-2 py-2 text-center text-xs text-gray-500 font-medium bg-gray-50 col-week ${w === 4 ? 'border-r border-gray-200' : 'border-r border-dotted border-gray-200'}" style="min-width:110px">W${w}</th>`;
  th += '</tr>';
  t.querySelector('thead').innerHTML = th;

  const q = S.searchQuery.toLowerCase();
  let emps = S.employees.filter(e => !q || e.name.toLowerCase().includes(q) || e.dept.toLowerCase().includes(q));

  /* ── apply all matrix filters ── */
  if (S.matrixProjectFilter) { const pid = +S.matrixProjectFilter; emps = emps.filter(e => S.assignments.some(a => a.employee_id === e.id && a.project_id === pid)); }
  if (S.matrixResourceFilter) { emps = emps.filter(e => e.id === +S.matrixResourceFilter); }
  if (S.matrixMonthFilter) { const [fy, fm] = S.matrixMonthFilter.split('-').map(Number); emps = emps.filter(e => S.assignments.some(a => a.employee_id === e.id && a.year === fy && a.month === fm)); }

  /* filters based on project properties */
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

  /* ── sort ── */
  if (S.matrixSortAssigned) { emps = [...emps].sort((a, b) => S.assignments.filter(x => x.employee_id === b.id).length - S.assignments.filter(x => x.employee_id === a.id).length); }
  else if (S.matrixSortHigh) { emps = [...emps].sort((a, b) => (S.employeeUtil.get(b.id) || 0) - (S.employeeUtil.get(a.id) || 0)); }
  else if (S.matrixSortLow) { emps = [...emps].sort((a, b) => (S.employeeUtil.get(a.id) || 0) - (S.employeeUtil.get(b.id) || 0)); }

  const info = document.getElementById('matrixFilterInfo');
  if (info) info.textContent = emps.length < S.employees.length ? `Showing ${emps.length} resource${emps.length === 1 ? '' : 's'}` : '';

  const rows = [];
  emps.forEach((emp, idx) => {
    const rowBg = idx % 2 === 0 ? 'row-even' : 'row-odd', util = S.employeeUtil.get(emp.id) || 0, uClr = uc(util), deptPill = 'pill-' + emp.dept.replace(/\s+/g, '-');
    let r = `<tr class="matrix-row ${rowBg} border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer" data-emp="${emp.id}">`;
    r += `<td class="sticky-sn col-sn border-r border-gray-200 px-3 py-3 text-center text-xs font-semibold text-gray-500">${idx + 1}</td>`;
    r += `<td class="sticky-empid col-empid border-r border-gray-200 px-3 py-3"><span class="text-xs font-medium text-gray-600 mono">${esc(emp.employee_code || '')}</span></td>`;
    r += `<td class="sticky-name col-name border-r border-gray-200 px-4 py-3"><button class="flex items-center gap-3 w-full text-left" data-action="edit-emp" data-emp="${emp.id}"><div class="w-9 h-9 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(emp.name))}</div><div class="min-w-0"><div class="text-sm font-medium text-gray-900 truncate">${esc(emp.name)}</div><div class="text-xs text-gray-500 truncate">${esc(emp.email || '')}</div></div></button></td>`;
    r += `<td class="sticky-dept col-dept border-r border-gray-200 px-4 py-3"><div class="flex items-center justify-between gap-2"><span class="inline-block pill ${deptPill}">${esc(emp.dept)}</span><span class="text-xs font-semibold" style="color:${uClr}">${Math.round(util)}%</span></div></td>`;
    for (let mi = 0; mi < months.length; mi++) { const m = months[mi]; for (let w = 1; w <= 4; w++) { const key = `${m.y}-${m.m}-${w}`, asgs = (S.matrix[emp.id] && S.matrix[emp.id][key]) || []; r += `<td class="cell col-week ${w === 4 ? 'month-end' : ''}" data-emp="${emp.id}" data-year="${m.y}" data-month="${m.m}" data-week="${w}">`; for (const a of asgs) { r += `<div class="chip" data-action="edit-assign" data-id="${a.id}" style="background:${a.project_color}20;border-left:3px solid ${a.project_color};"><div class="flex justify-between items-center w-full gap-1"><span class="chip-code" style="color:${a.project_color}">${esc(a.project_code)}</span><span class="chip-pct text-gray-500">${a.percentage}%</span></div><span class="chip-del" data-action="delete-assign" data-id="${a.id}">×</span></div>`; } r += `<span class="cell-add">+</span></td>`; } }
    r += '</tr>'; rows.push(r);
  });
  t.querySelector('tbody').innerHTML = rows.join('') || `<tr><td colspan="${4 + 48}" class="p-8 text-center text-sm text-gray-400">No resources found.</td></tr>`;
}

/* ================================================================ CHARTS */
function renderTrends(data) { if (S.charts.trends) S.charts.trends.destroy(); const ctx = document.getElementById('trendsChart').getContext('2d'); S.charts.trends = new Chart(ctx, { type: 'line', data: { labels: data.map(d => d.label), datasets: [{ label: 'Assignments', data: data.map(d => d.assignments), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.06)', tension: 0.4, borderWidth: 2, pointRadius: 3, fill: true, yAxisID: 'y' }, { label: 'Utilization %', data: data.map(d => d.utilization), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.04)', tension: 0.4, borderWidth: 2, pointRadius: 3, yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, padding: 8 } }, scales: { x: { ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y: { position: 'left', ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y1: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } } } } }); }

function renderWorkload(data) { if (S.charts.workload) S.charts.workload.destroy(); const ctx = document.getElementById('workloadChart').getContext('2d'); const depts = data.map(d => d.dept), colors = depts.map(d => DEPT_COLORS[d] || '#8B5CF6'); S.charts.workload = new Chart(ctx, { type: 'bar', data: { labels: depts, datasets: [{ data: data.map(d => d.assignment_count), backgroundColor: colors, borderRadius: 4, borderSkipped: false }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 } } }, scales: { x: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y: { ticks: { font: { size: 12 }, color: '#374151' }, grid: { display: false } } } } }); }

function renderAllocation(data) { if (S.charts.allocation) S.charts.allocation.destroy(); const ctx = document.getElementById('allocationChart').getContext('2d'); const depts = data.map(d => d.dept), colors = depts.map(d => DEPT_COLORS[d] || '#8B5CF6'); S.charts.allocation = new Chart(ctx, { type: 'pie', data: { labels: depts, datasets: [{ data: data.map(d => d.assignment_count), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 10 } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, callbacks: { label: c => { const tot = c.dataset.data.reduce((a, b) => a + b, 0); return ` ${c.label}: ${c.parsed} (${((c.parsed / tot) * 100).toFixed(0)}%)`; } } } } } }) }

function insightRow(e) { const u = e.utilization, clr = uc(u), badge = ub(u), label = us(u); return `<div class="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer" data-action="edit-emp-side" data-emp="${e.id}"><div class="relative flex-shrink-0"><div class="w-10 h-10 avatar-grad rounded-full flex items-center justify-center text-sm">${esc(inits(e.name))}</div><div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style="background:${clr}"></div></div><div class="flex-1 min-w-0"><div class="text-sm font-medium text-gray-900 truncate">${esc(e.name)}</div><div class="text-xs text-gray-500">${esc(e.dept)}</div></div><span class="px-3 py-1 rounded-full text-xs font-medium ${badge} flex-shrink-0">${esc(label)}</span><div class="text-right flex-shrink-0"><div class="text-base font-semibold" style="color:${clr}">${u.toFixed(0)}%</div><div class="w-16 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(100, u)}%;background:${clr}"></div></div></div></div>`; }

/* ================================================================ INSIGHTS */
function renderInsights() {
  const empty = '<p class="text-sm text-gray-400 text-center py-4">No data</p>';
  document.getElementById('highWorkloadList').innerHTML = calcLocalUtil(S.insightsPeriodHigh).high_workload.map(insightRow).join('') || empty;
  document.getElementById('topAvailableList').innerHTML = calcLocalUtil(S.insightsPeriodLow).top_available.map(insightRow).join('') || empty;
}

/* ================================================================ RUNNING PROJECTS — rich layout */
function runningProjectRowHtml(d) {
  const barColor = '#10B981';
  const amount = fmtUsd(d.opp_amount || d.budget || 0);
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
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-green-100 text-green-700">Closed Won</span>
          ${d.opportunity_owner ? `<span class="text-xs text-gray-500 truncate">${esc(d.opportunity_owner)}</span>` : ''}
        </div>
        ${d.end_date ? `<span class="text-xs text-gray-500 flex-shrink-0">Close: <span class="font-medium text-gray-700">${esc(d.end_date)}</span></span>` : ''}
      </div>
      ${closingDate ? `<div class="flex items-center gap-1.5 text-xs mb-2">
        <svg class="w-3 h-3 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span class="text-gray-500">${esc(closingDate)}</span>
        <span class="font-semibold ${daysColor}">${daysLabel}</span>
        <span class="ml-auto font-semibold ${statC}">${status}</span>
      </div>`: '<div class="mb-2"></div>'}
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

/* ================================================================ SERVICE PIPELINE — rich layout + proj closing date */
function servicePipelineRowHtml(p) {
  const barColor = STAGE_COLOR[p.stage] || '#6B7280', pillCls = STAGE_PILL[p.stage] || 'bg-gray-100 text-gray-700';
  const amount = fmtUsd(p.opp_amount ?? p.budget ?? 0);
  /* Project Closing Date line */
  /* Project Close Date — right-aligned, under Close Date, days in red */
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
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-1.5 min-w-0 pt-0.5"><span class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${pillCls}">${esc(p.stage)}</span>${p.opportunity_owner ? `<span class="text-xs text-gray-500 truncate">${esc(p.opportunity_owner)}</span>` : ''}</div>
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

/* ================================================================ MODALS — NO outside-click close */
function openModal(html, width = 'max-w-lg') {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="fixed inset-0 modal-bd flex items-center justify-center z-50 p-4" id="mbd">
    <div class="bg-white rounded-2xl shadow-2xl w-full ${width} modal-enter">${html}</div>
  </div>`;
  /* INTENTIONALLY no backdrop click listener — only X button closes */
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
    const today = new Date();
    items = applyRunningFilters(S.lastRunningData);
    listHtml = items.map(runningProjectRowHtml).join('');
  }
  openModal(`${mHdr(title, `${items.length} item${items.length === 1 ? '' : 's'}`)}<div class="p-4"><div class="overflow-y-auto nice-scroll" style="max-height:70vh">${listHtml || '<div class="text-center text-gray-400 py-12">No items</div>'}</div></div><div class="p-4 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-2xl"><button onclick="closeModal()" class="btn-gray">Close</button></div>`, 'max-w-3xl');
}

/* ── Assignment modal ─────────────────────────────────────────── */
function openAssignmentModal(opts = {}) {
  const editing = !!opts.id, cur = editing ? S.assignments.find(a => a.id === opts.id) : null;
  const empId = (opts.employee_id || (cur && cur.employee_id) || (S.employees[0] && S.employees[0].id));
  const projId = ((cur && cur.project_id) || (S.projects[0] && S.projects[0].id));
  const pct = (cur && cur.percentage) || 50;
  const today = new Date();
  let defStart = today.toISOString().slice(0, 10), defEnd = today.toISOString().slice(0, 10);
  if (!editing && opts.year && opts.month && opts.week) { defStart = new Date(opts.year, opts.month - 1, { 1: 1, 2: 8, 3: 15, 4: 22 }[opts.week]).toISOString().slice(0, 10); defEnd = new Date(opts.year, opts.month - 1, { 1: 7, 2: 14, 3: 21, 4: 28 }[opts.week]).toISOString().slice(0, 10); }
  if (editing) { openModal(`${mHdr('Edit Assignment', 'Update workload allocation')}<div class="p-6 space-y-4"><div><label class="field-label">Resource</label><select id="fa_emp" class="field-input">${S.employees.map(e => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}</select></div><div><label class="field-label">Project</label><select id="fa_proj" class="field-input">${S.projects.map(p => `<option value="${p.id}" ${p.id === projId ? 'selected' : ''}>${esc(p.code)} — ${esc(p.name)}</option>`).join('')}</select></div><div><label class="field-label">Period</label><div class="field-input bg-gray-50 text-gray-700">${MN[cur.month - 1]} ${cur.year} · Week ${cur.week}</div></div><div><label class="field-label flex justify-between"><span>Workload Allocation</span><span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span></label><input id="fa_pct" type="range" min="0" max="150" value="${pct}" class="w-full" oninput="document.getElementById('pctLbl').textContent=this.value+'%'"><div class="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>50%</span><span>100%</span><span>150%</span></div></div></div>${mFtr(opts.id, 'saveAssignment', 'deleteAssignment')}`); return; }
  openModal(`${mHdr('Add Assignment', 'Assign a resource to a project across a date range')}<div class="p-6 space-y-4"><div><label class="field-label">Resource</label><select id="fa_emp" class="field-input">${S.employees.map(e => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}</select></div><div><label class="field-label">Project</label><select id="fa_proj" class="field-input">${S.projects.map(p => `<option value="${p.id}" ${p.id === projId ? 'selected' : ''}>${esc(p.code)} — ${esc(p.name)}</option>`).join('')}</select></div><div class="grid grid-cols-2 gap-4"><div><label class="field-label">Start Date</label><input id="fa_start" type="date" class="field-input" value="${defStart}" oninput="updateSlotPreview()"></div><div><label class="field-label">End Date</label><input id="fa_end" type="date" class="field-input" value="${defEnd}" oninput="updateSlotPreview()"></div></div><div><label class="field-label">Quick Presets</label><div class="flex flex-wrap gap-2"><button type="button" class="btn-preset" onclick="setDateRange('week')">This Week</button><button type="button" class="btn-preset" onclick="setDateRange('month')">This Month</button><button type="button" class="btn-preset" onclick="setDateRange('3months')">Next 3 Months</button><button type="button" class="btn-preset" onclick="setDateRange('fiscalyear')">Full Fiscal Year</button></div></div><div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800" id="slotPreview">Will create <span class="font-semibold">0</span> weekly assignments</div><div><label class="field-label flex justify-between"><span>Workload % per Week</span><span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span></label><input id="fa_pct" type="range" min="0" max="150" value="${pct}" class="w-full" oninput="document.getElementById('pctLbl').textContent=this.value+'%'"><div class="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>50%</span><span>100%</span><span>150%</span></div></div></div>${mFtr(null, 'saveAssignment', 'deleteAssignment')}`);
  updateSlotPreview();
}

function setDateRange(preset) { const fmt = d => d.toISOString().slice(0, 10), t = new Date(); let s, e; if (preset === 'week') { s = new Date(t); e = new Date(t); e.setDate(e.getDate() + 6); } else if (preset === 'month') { s = new Date(t); e = new Date(t); e.setMonth(e.getMonth() + 1); } else if (preset === '3months') { s = new Date(t); e = new Date(t); e.setMonth(e.getMonth() + 3); } else { s = new Date(S.fiscalYear, 3, 1); e = new Date(S.fiscalYear + 1, 2, 31); } document.getElementById('fa_start').value = fmt(s); document.getElementById('fa_end').value = fmt(e); updateSlotPreview(); }

function updateSlotPreview() { const s = document.getElementById('fa_start'), e = document.getElementById('fa_end'), pv = document.getElementById('slotPreview'); if (!s || !e || !pv) return; const slots = expandDateRange(s.value, e.value); pv.innerHTML = `Will create <span class="font-semibold">${slots.length}</span> weekly assignment${slots.length === 1 ? '' : 's'}`; pv.className = slots.length > 0 ? 'bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800' : 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800'; }

async function saveAssignment(id) {
  if (id) { try { await api('PUT', `/api/assignments/${id}`, { employee_id: +document.getElementById('fa_emp').value, project_id: +document.getElementById('fa_proj').value, percentage: +document.getElementById('fa_pct').value }); closeModal(); toast('Assignment updated'); await loadAll(); } catch (e) { toast(e.message, 'error'); } return; }
  const slots = expandDateRange(document.getElementById('fa_start').value, document.getElementById('fa_end').value);
  if (!slots.length) { toast('Invalid date range', 'error'); return; }
  try { const r = await api('POST', '/api/assignments/bulk', { employee_id: +document.getElementById('fa_emp').value, project_id: +document.getElementById('fa_proj').value, percentage: +document.getElementById('fa_pct').value, slots }); closeModal(); toast(`Created ${r.created} assignment${r.created === 1 ? '' : 's'}`); await loadAll(); } catch (e) { toast(e.message, 'error'); }
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
  /* ── duplicate check ── */
  const dup = S.employees.find(e => { if (id && e.id === id) return false; return (code && e.employee_code === code) || e.name.toLowerCase() === name.toLowerCase(); });
  if (dup) { toast(dup.name.toLowerCase() === name.toLowerCase() ? `A resource named "${name}" already exists` : `A resource with ID "${code}" already exists`, 'error'); return; }
  try { const p = { employee_code: code, name, dept: document.getElementById('fe_dept').value, email: document.getElementById('fe_email').value.trim() }; if (id) await api('PUT', `/api/employees/${id}`, p); else await api('POST', '/api/employees', p); closeModal(); toast(`Resource ${id ? 'updated' : 'added'}`); await loadAll(); } catch (e) { toast(e.message, 'error'); }
}

async function deleteEmployee(id) { if (!confirm('Delete this resource? All their assignments will also be removed.')) return; try { await api('DELETE', `/api/employees/${id}`); closeModal(); toast('Resource deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

/* ── Project modal ────────────────────────────────────────────── */
function openProjectModal(opts = {}) {
  const editing = !!opts.id, p = editing ? S.projects.find(x => x.id === opts.id) : null, v = (k, fb) => p ? (p[k] ?? fb) : fb;
  const OWNER_OPTS = ['Abdullah Al Baki', 'Basher Muhammad Raquibul Raquibul', 'Zobayer Ahmed', 'Most Iffat Ara Ila', 'Md Naiemul Haque Chowdhury', 'Mohammad A. Hadi'];
  const todayStr = new Date().toISOString().slice(0, 10);
  openModal(`${mHdr(editing ? 'Edit Project' : 'Add Project', editing ? 'Update project details' : 'Register a new project')}<div class="p-6 space-y-4 max-h-[80vh] overflow-y-auto nice-scroll">
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Opportunity Number</label><input id="fp_code" type="text" class="field-input mono" value="${esc(v('code', ''))}" placeholder="e.g. SA136664"></div><div><label class="field-label">Priority</label><select id="fp_pri" class="field-input">${PRIORITIES.map(x => `<option ${x === v('priority', 'Medium') ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div><label class="field-label">Project Name</label><input id="fp_name" type="text" class="field-input" value="${esc(v('name', ''))}" placeholder="e.g. Desktop SW for IWM 2026"></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Account Name</label><input id="fp_account" type="text" class="field-input" value="${esc(v('account_name', v('client', '')))}"></div><div><label class="field-label">Product Name</label><input id="fp_product_name" type="text" class="field-input" value="${esc(v('product_name', ''))}"></div></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Opportunity Owner</label><input id="fp_owner" type="text" class="field-input" list="ownerList" value="${esc(v('opportunity_owner', ''))}"><datalist id="ownerList">${OWNER_OPTS.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div><div><label class="field-label">Stage</label><select id="fp_stage" class="field-input">${STAGES.map(x => `<option ${x === v('stage', 'Prospect') ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div class="grid grid-cols-2 gap-4"><div><label class="field-label">Product Amount (USD)</label><input id="fp_product_amount" type="number" class="field-input" value="${v('product_amount', 0)}" min="0" step="0.01"></div><div><label class="field-label">Probability (%)</label><input id="fp_probability" type="number" class="field-input" value="${v('probability', 0)}" min="0" max="100" step="5"></div></div>
    <div class="grid grid-cols-3 gap-3"><div><label class="field-label">Created Date</label><input id="fp_created" type="date" class="field-input" value="${esc(v('created_date', todayStr))}"></div><div><label class="field-label">Closed Won Date</label><input id="fp_end" type="date" class="field-input" value="${esc(v('end_date', ''))}"></div><div><label class="field-label">Project Closing Date</label><input id="fp_closing" type="date" class="field-input" value="${esc(v('project_closing_date', ''))}"></div></div>
    <div><label class="field-label">Amount (USD)</label><input id="fp_opp_amount" type="number" class="field-input" value="${v('opp_amount', 0)}" min="0" step="0.01"></div>
    <div><label class="field-label flex justify-between"><span>Progress (internal)</span><span class="text-blue-600 font-semibold" id="progLbl">${v('progress', 0)}%</span></label><input id="fp_prog" type="range" min="0" max="100" value="${v('progress', 0)}" class="w-full" oninput="document.getElementById('progLbl').textContent=this.value+'%'"></div>
    <div><label class="field-label">Color</label><div class="flex flex-wrap gap-2" id="cpkr">${PCOLORS.map(c => `<button type="button" data-c="${c}" class="w-8 h-8 rounded-lg ${c === v('color', '#8B5CF6') ? 'ring-2 ring-offset-2 ring-gray-900' : ''}" style="background:${c}"></button>`).join('')}</div><input type="hidden" id="fp_color" value="${v('color', '#8B5CF6')}"></div>
  </div>${mFtr(editing ? opts.id : null, 'saveProject', 'deleteProject')}`);
  document.querySelectorAll('#cpkr button').forEach(b => b.addEventListener('click', () => { document.getElementById('fp_color').value = b.dataset.c; document.querySelectorAll('#cpkr button').forEach(x => x.classList.remove('ring-2', 'ring-offset-2', 'ring-gray-900')); b.classList.add('ring-2', 'ring-offset-2', 'ring-gray-900'); }));
}

async function saveProject(id) {
  const code = document.getElementById('fp_code').value.trim().toUpperCase();
  const name = document.getElementById('fp_name').value.trim();
  if (!code || !name) { toast('Opportunity Number and Project Name are required', 'error'); return; }
  /* ── duplicate check: only block same name on a different record ── */
  const dup = S.projects.find(p => { if (id && p.id === id) return false; return p.name.toLowerCase() === name.toLowerCase(); });
  if (dup) { toast(`A project named "${name}" already exists`, 'error'); return; }
  const amount = +document.getElementById('fp_opp_amount').value;
  const payload = { code, name, account_name: document.getElementById('fp_account').value.trim(), client: document.getElementById('fp_account').value.trim(), product_name: document.getElementById('fp_product_name').value.trim(), opportunity_owner: document.getElementById('fp_owner').value.trim(), stage: document.getElementById('fp_stage').value, priority: document.getElementById('fp_pri').value, product_amount: +document.getElementById('fp_product_amount').value, probability: +document.getElementById('fp_probability').value, created_date: document.getElementById('fp_created').value, end_date: document.getElementById('fp_end').value, project_closing_date: document.getElementById('fp_closing').value, opp_amount: amount, budget: amount, progress: +document.getElementById('fp_prog').value, color: document.getElementById('fp_color').value };
  try { if (id) await api('PUT', `/api/projects/${id}`, payload); else await api('POST', '/api/projects', payload); closeModal(); toast(`Project ${id ? 'updated' : 'created'}`); await loadAll(); } catch (e) { toast(e.message, 'error'); }
}

async function deleteProject(id) { if (!confirm('Delete this project? All its assignments will also be removed.')) return; try { await api('DELETE', `/api/projects/${id}`); closeModal(); toast('Project deleted'); await loadAll(); } catch (e) { toast(e.message, 'error'); } }

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
  }));

  document.getElementById('searchBox').addEventListener('input', e => { S.searchQuery = e.target.value; renderMatrix(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ── Matrix filter listeners ── */
  const mfBind = (id, key, cb) => { const el = document.getElementById(id); if (el) el.addEventListener('change', e => { S[key] = e.target.value || null; if (cb) cb(); renderMatrix(); }); };
  mfBind('matrixProjectFilter', 'matrixProjectFilter');
  mfBind('matrixResourceFilter', 'matrixResourceFilter');
  document.getElementById('matrixMonthFilter')?.addEventListener('change', e => { S.matrixMonthFilter = e.target.value; renderMatrix(); });
  document.getElementById('matrixStageFilter')?.addEventListener('change', e => { S.matrixStageFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixAmountFilter')?.addEventListener('change', e => { S.matrixAmountFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixCloseDateFilter')?.addEventListener('change', e => { S.matrixCloseDateFilt = e.target.value; renderMatrix(); });
  document.getElementById('matrixProjCloseFilter')?.addEventListener('change', e => { S.matrixProjCloseFilt = e.target.value; renderMatrix(); });

  /* Sort buttons - mutually exclusive High/Low, independent Assigned */
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

  /* ── Pipeline filter listeners ── */
  document.getElementById('pipeStageFilt')?.addEventListener('change', e => { S.pipelineStageFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeAmountFilt')?.addEventListener('change', e => { S.pipelineAmountFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeCloseFilt')?.addEventListener('change', e => { S.pipelineCloseFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeProjCloseFilt')?.addEventListener('change', e => { S.pipelineProjCloseFilt = e.target.value; applyAndRenderPipeline(); });
  document.getElementById('pipeSortAssignedBtn')?.addEventListener('click', () => { S.pipelineSortAssigned = !S.pipelineSortAssigned; document.getElementById('pipeSortAssignedBtn').classList.toggle('active', S.pipelineSortAssigned); applyAndRenderPipeline(); });

  /* ── Running filter listeners ── */
  document.getElementById('runAmountFilt')?.addEventListener('change', e => { S.runAmountFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runCloseFilt')?.addEventListener('change', e => { S.runCloseFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runProjCloseFilt')?.addEventListener('change', e => { S.runProjCloseFilt = e.target.value; applyAndRenderRunning(); });
  document.getElementById('runSortAssignedBtn')?.addEventListener('click', () => { S.runSortAssigned = !S.runSortAssigned; document.getElementById('runSortAssignedBtn').classList.toggle('active', S.runSortAssigned); applyAndRenderRunning(); });

  /* ── Matrix table click ── */
  document.getElementById('matrixTable').addEventListener('click', e => {
    const del = e.target.closest('[data-action="delete-assign"]'); if (del) { e.stopPropagation(); deleteAssignment(+del.dataset.id); return; }
    const chip = e.target.closest('[data-action="edit-assign"]'); if (chip) { e.stopPropagation(); openAssignmentModal({ id: +chip.dataset.id }); return; }
    const emp = e.target.closest('[data-action="edit-emp"]'); if (emp) { e.stopPropagation(); openEmployeeModal({ id: +emp.dataset.emp }); return; }
    const cell = e.target.closest('td.cell'); if (cell) openAssignmentModal({ employee_id: +cell.dataset.emp, year: +cell.dataset.year, month: +cell.dataset.month, week: +cell.dataset.week });
  });

  /* ── Body delegation ── */
  document.body.addEventListener('click', e => {
    const ep = e.target.closest('[data-action="edit-emp-side"]'); if (ep) openEmployeeModal({ id: +ep.dataset.emp });
    const pr = e.target.closest('[data-action="edit-project"]'); if (pr) openProjectModal({ id: +pr.dataset.project });
    const va = e.target.closest('[data-view-all]'); if (va) openViewAllModal(va.dataset.viewAll);
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