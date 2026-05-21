/* ================================================================
   Workforce Allocation Dashboard — app.js
   ================================================================ */

/* ================================================================ STATE */
const S = {
    fiscalYear: 2026,
    employees: [],
    projects: [],
    assignments: [],
    matrix: {},
    employeeUtil: new Map(),
    charts: {},
    searchQuery: '',
};

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STAGES = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PCOLORS = [
    '#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981',
    '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7',
    '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF',
];
const DEPT_COLORS = {
    'Solution': '#2563EB',
    'Professional Services': '#8B5CF6',
    'Finance': '#14B8A6',
    'Sales': '#F59E0B',
    'Operations': '#10B981',
    'Management': '#EC4899',
};

/* ── Helpers ──────────────────────────────────────────────────── */
function fiscalMonths(fy) {
    return [
        { y: fy, m: 4 }, { y: fy, m: 5 }, { y: fy, m: 6 }, { y: fy, m: 7 }, { y: fy, m: 8 }, { y: fy, m: 9 },
        { y: fy, m: 10 }, { y: fy, m: 11 }, { y: fy, m: 12 }, { y: fy + 1, m: 1 }, { y: fy + 1, m: 2 }, { y: fy + 1, m: 3 },
    ].map(x => ({ ...x, label: `${MN[x.m - 1]} ${x.y}` }));
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function uc(u) {
    if (u > 100) return '#DC2626';
    if (u > 85) return '#D97706';
    if (u > 50) return '#2563EB';
    return '#059669';
}

function ub(u) {
    if (u > 100) return 'bg-red-100 text-red-700';
    if (u > 85) return 'bg-orange-100 text-orange-700';
    return 'bg-green-100 text-green-700';
}

function us(u) {
    if (u > 100) return 'Over Capacity';
    if (u > 85) return 'High Load';
    return 'Available';
}

function inits(n) {
    return n.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
}

function fmtBudget(n) {
    if (!n) return '—';
    return '$' + (n / 1000).toFixed(0) + 'K';
}

function daysLeft(dateStr) {
    return Math.max(0, Math.round((new Date(dateStr) - new Date()) / 864e5));
}

/* ================================================================ API */
async function api(method, path, body) {
    const r = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error || `${r.status}`);
    }
    return r.json();
}

/* ================================================================ TOASTS */
function toast(msg, kind = 'success') {
    const root = document.getElementById('toasts');
    const c = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-gray-800' }[kind];
    const el = document.createElement('div');
    el.className = `toast-enter ${c} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 max-w-xs`;
    const ic = kind === 'success'
        ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'
        : '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>';
    el.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ic}</svg><span>${esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => {
        el.classList.remove('toast-enter');
        el.classList.add('toast-exit');
        setTimeout(() => el.remove(), 250);
    }, 2800);
}

/* ================================================================ LOAD */
async function loadAll() {
    try {
        const fy = S.fiscalYear;
        const [emps, projs, asgs, stats, trends, wl, util, pipe, dl] = await Promise.all([
            api('GET', '/api/employees'),
            api('GET', '/api/projects'),
            api('GET', `/api/assignments?fiscalYear=${fy}`),
            api('GET', `/api/dashboard/stats?fiscalYear=${fy}`),
            api('GET', `/api/dashboard/trends?fiscalYear=${fy}`),
            api('GET', `/api/dashboard/workload?fiscalYear=${fy}`),
            api('GET', `/api/dashboard/utilization?fiscalYear=${fy}`),
            api('GET', '/api/dashboard/pipeline'),
            api('GET', '/api/dashboard/deadlines'),
        ]);

        S.employees = emps;
        S.projects = projs;
        S.assignments = asgs;
        buildMatrix();
        S.employeeUtil = new Map(util.all.map(u => [u.id, u.utilization]));

        renderStats(stats);
        renderMatrix();
        renderTrends(trends);
        renderWorkload(wl);
        renderAllocation(wl);
        renderInsights(util);
        renderPipeline(projs);
        renderDeadlines(dl);
    } catch (e) {
        toast(e.message, 'error');
        console.error(e);
    }
}

function buildMatrix() {
    S.matrix = {};
    for (const a of S.assignments) {
        const k = `${a.year}-${a.month}-${a.week}`;
        S.matrix[a.employee_id] ||= {};
        (S.matrix[a.employee_id][k] ||= []).push(a);
    }
}

/* ================================================================ STATS */
function renderStats(s) {
    const t = s.trends || {};
    const cards = [
        { v: s.active_employees.toLocaleString(), label: 'Active Employees', tk: 'employees', bg: 'bg-blue-100', fg: 'text-blue-600', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' },
        { v: s.active_projects.toLocaleString(), label: 'Active Projects', tk: 'projects', bg: 'bg-purple-100', fg: 'text-purple-600', icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
        { v: s.avg_utilization + '%', label: 'Avg Utilization', tk: 'utilization', bg: 'bg-teal-100', fg: 'text-teal-600', icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
        { v: s.total_assignments.toLocaleString(), label: 'Total Assignments', tk: 'assignments', bg: 'bg-orange-100', fg: 'text-orange-600', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
        { v: s.productivity + '/10', label: 'Productivity Score', tk: 'productivity', bg: 'bg-green-100', fg: 'text-green-600', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
        { v: s.on_time_pct + '%', label: 'On-Time Completion', tk: 'on_time', bg: 'bg-emerald-100', fg: 'text-emerald-600', icon: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
    ];

    document.getElementById('statsRow').innerHTML = cards.map(c => {
        const td = t[c.tk] || { value: '—', up: true };
        const up = td.up;
        return `
      <div class="bg-white rounded-xl border border-gray-200 p-5" style="box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div class="w-12 h-12 ${c.bg} ${c.fg} rounded-xl flex items-center justify-center mb-3">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
        </div>
        <div class="text-2xl font-semibold text-gray-900 mb-0.5">${esc(c.v)}</div>
        <div class="text-sm text-gray-500 mb-2">${esc(c.label)}</div>
        <div class="flex items-center gap-1 text-xs font-medium ${up ? 'text-green-600' : 'text-orange-600'}">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            ${up ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
                : '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'}
          </svg>
          ${esc(td.value)}
        </div>
      </div>`;
    }).join('');
}

/* ================================================================ MATRIX */
function renderMatrix() {
    const t = document.getElementById('matrixTable');
    const months = fiscalMonths(S.fiscalYear);

    /* THEAD */
    let th = '<tr class="months">';
    th += `<th class="sticky-sn col-sn border-b-2 border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2">SN</th>`;
    th += `<th class="sticky-empid col-empid border-b-2 border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2">Emp ID</th>`;
    th += `<th class="sticky-name col-name border-b-2 border-gray-300 px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2"><div style="position:relative;display:flex;align-items:center;height:100%">Employee<div class="col-resizer" data-col="name" title="Drag to resize"></div></div></th>`;
    th += `<th class="sticky-dept col-dept border-b-2 border-gray-300 px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200" rowspan="2"><div style="position:relative;display:flex;align-items:center;height:100%">Department<div class="col-resizer" data-col="dept" title="Drag to resize"></div></div></th>`;

    for (let i = 0; i < months.length; i++) {
        const m = months[i];
        th += `<th colspan="4" class="border-b border-gray-200 px-2 py-3 text-center text-xs font-semibold text-gray-700 bg-gray-50 ${i < months.length - 1 ? 'border-r border-gray-200' : ''}">${esc(m.label)}</th>`;
    }
    th += '</tr><tr class="weeks">';
    for (let i = 0; i < months.length; i++) {
        for (let w = 1; w <= 4; w++) {
            th += `<th class="border-b border-gray-200 px-2 py-2 text-center text-xs text-gray-500 font-medium bg-gray-50 col-week ${w === 4 ? 'border-r border-gray-200' : 'border-r border-dotted border-gray-200'}" style="min-width:110px">W${w}</th>`;
        }
    }
    th += '</tr>';
    t.querySelector('thead').innerHTML = th;

    /* TBODY */
    const q = S.searchQuery.toLowerCase();
    const emps = S.employees.filter(e =>
        !q || e.name.toLowerCase().includes(q) || e.dept.toLowerCase().includes(q)
    );

    const rows = [];
    emps.forEach((emp, idx) => {
        const rowBg = idx % 2 === 0 ? 'row-even' : 'row-odd';
        const util = S.employeeUtil.get(emp.id) || 0;
        const uClr = uc(util);
        const deptPill = 'pill-' + emp.dept.replace(/\s+/g, '-');

        let r = `<tr class="matrix-row ${rowBg} border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer" data-emp="${emp.id}">`;
        r += `<td class="sticky-sn col-sn border-r border-gray-200 px-3 py-3 text-center text-xs font-semibold text-gray-500">${idx + 1}</td>`;
        r += `<td class="sticky-empid col-empid border-r border-gray-200 px-3 py-3"><span class="text-xs font-medium text-gray-600 mono">${esc(emp.employee_code || '')}</span></td>`;
        r += `<td class="sticky-name col-name border-r border-gray-200 px-4 py-3">
      <button class="flex items-center gap-3 w-full text-left" data-action="edit-emp" data-emp="${emp.id}">
        <div class="w-9 h-9 avatar-grad rounded-full flex items-center justify-center text-xs flex-shrink-0">${esc(inits(emp.name))}</div>
        <div class="min-w-0">
          <div class="text-sm font-medium text-gray-900 truncate">${esc(emp.name)}</div>
          <div class="text-xs text-gray-500 truncate">${esc(emp.email || '')}</div>
        </div>
      </button>
    </td>`;
        r += `<td class="sticky-dept col-dept border-r border-gray-200 px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <span class="inline-block pill ${deptPill}">${esc(emp.dept)}</span>
        <span class="text-xs font-semibold" style="color:${uClr}">${Math.round(util)}%</span>
      </div>
    </td>`;

        for (let mi = 0; mi < months.length; mi++) {
            const m = months[mi];
            for (let w = 1; w <= 4; w++) {
                const key = `${m.y}-${m.m}-${w}`;
                const asgs = (S.matrix[emp.id] && S.matrix[emp.id][key]) || [];
                r += `<td class="cell col-week ${w === 4 ? 'month-end' : ''}" data-emp="${emp.id}" data-year="${m.y}" data-month="${m.m}" data-week="${w}">`;
                for (const a of asgs) {
                    r += `<div class="chip" data-action="edit-assign" data-id="${a.id}" style="background:${a.project_color}20;border-left:3px solid ${a.project_color};">
            <div class="flex justify-between items-center w-full gap-1">
              <span class="chip-code" style="color:${a.project_color}">${esc(a.project_code)}</span>
              <span class="chip-pct text-gray-500">${a.percentage}%</span>
            </div>
            <span class="chip-del" data-action="delete-assign" data-id="${a.id}">×</span>
          </div>`;
                }
                r += `<span class="cell-add">+</span></td>`;
            }
        }
        r += '</tr>';
        rows.push(r);
    });

    t.querySelector('tbody').innerHTML = rows.join('') ||
        `<tr><td colspan="${4 + 48}" class="p-8 text-center text-sm text-gray-400">No employees found.</td></tr>`;
}

/* ================================================================ CHARTS */
function renderTrends(data) {
    if (S.charts.trends) S.charts.trends.destroy();
    const ctx = document.getElementById('trendsChart').getContext('2d');
    S.charts.trends = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.label),
            datasets: [
                { label: 'Assignments', data: data.map(d => d.assignments), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.06)', tension: 0.4, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#2563EB', fill: true, yAxisID: 'y' },
                { label: 'Utilization %', data: data.map(d => d.utilization), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.04)', tension: 0.4, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#059669', yAxisID: 'y1' },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } },
                tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, padding: 8 },
            },
            scales: {
                x: { ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } },
                y: { position: 'left', ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } },
                y1: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } },
            },
        },
    });
}

function renderWorkload(data) {
    if (S.charts.workload) S.charts.workload.destroy();
    const ctx = document.getElementById('workloadChart').getContext('2d');
    const depts = data.map(d => d.dept);
    const colors = depts.map(d => DEPT_COLORS[d] || '#8B5CF6');
    S.charts.workload = new Chart(ctx, {
        type: 'bar',
        data: { labels: depts, datasets: [{ data: data.map(d => d.assignment_count), backgroundColor: colors, borderRadius: 4, borderSkipped: false }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 } } },
            scales: {
                x: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } },
                y: { ticks: { font: { size: 12 }, color: '#374151' }, grid: { display: false } },
            },
        },
    });
}

function renderAllocation(data) {
    if (S.charts.allocation) S.charts.allocation.destroy();
    const ctx = document.getElementById('allocationChart').getContext('2d');
    const depts = data.map(d => d.dept);
    const colors = depts.map(d => DEPT_COLORS[d] || '#8B5CF6');
    S.charts.allocation = new Chart(ctx, {
        type: 'pie',
        data: { labels: depts, datasets: [{ data: data.map(d => d.assignment_count), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 10 } },
                tooltip: {
                    bodyFont: { size: 11 }, titleFont: { size: 11 },
                    callbacks: {
                        label: ctx => {
                            const tot = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            return ` ${ctx.label}: ${ctx.parsed} (${((ctx.parsed / tot) * 100).toFixed(0)}%)`;
                        }
                    },
                },
            },
        },
    });
}

/* ================================================================ INSIGHTS */
function renderInsights(util) {
    const row = e => {
        const u = e.utilization;
        const clr = uc(u), badge = ub(u), label = us(u);
        return `
      <div class="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer" data-action="edit-emp-side" data-emp="${e.id}">
        <div class="relative flex-shrink-0">
          <div class="w-10 h-10 avatar-grad rounded-full flex items-center justify-center text-sm">${esc(inits(e.name))}</div>
          <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style="background:${clr}"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-900 truncate">${esc(e.name)}</div>
          <div class="text-xs text-gray-500">${esc(e.dept)}</div>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-medium ${badge} flex-shrink-0">${esc(label)}</span>
        <div class="text-right flex-shrink-0">
          <div class="text-base font-semibold" style="color:${clr}">${u.toFixed(0)}%</div>
          <div class="w-16 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
            <div class="h-full rounded-full" style="width:${Math.min(100, u)}%;background:${clr}"></div>
          </div>
        </div>
      </div>`;
    };
    document.getElementById('topAvailableList').innerHTML =
        util.top_available.map(row).join('') || '<p class="text-sm text-gray-400 text-center py-4">No data</p>';
    document.getElementById('highWorkloadList').innerHTML =
        util.high_workload.map(row).join('') || '<p class="text-sm text-gray-400 text-center py-4">No data</p>';
}

/* ================================================================ PIPELINE */
function renderPipeline(projects) {
    const projFTE = {};
    for (const a of S.assignments) {
        (projFTE[a.project_id] ||= new Set()).add(a.employee_id);
    }
    const STAGE_COLOR = {
        'Prospect': '#6B7280',
        'Qualify': '#0EA5E9',
        'Validate': '#8B5CF6',
        'Presentation - Solve': '#EC4899',
        'Proposal': '#F59E0B',
        'Negotiate': '#F97316',
        'Closed Won': '#10B981',
    };
    const stagePillClass = {
        'Prospect': 'bg-gray-100 text-gray-700',
        'Qualify': 'bg-sky-100 text-sky-700',
        'Validate': 'bg-purple-100 text-purple-700',
        'Presentation - Solve': 'bg-pink-100 text-pink-700',
        'Proposal': 'bg-amber-100 text-amber-700',
        'Negotiate': 'bg-orange-100 text-orange-700',
        'Closed Won': 'bg-green-100 text-green-700',
    };

    document.getElementById('pipelineList').innerHTML = projects.map(p => {
        const days = p.end_date ? daysLeft(p.end_date) : null;
        const fte = projFTE[p.id] ? projFTE[p.id].size : 0;
        const barColor = STAGE_COLOR[p.stage] || '#6B7280';
        const pillCls = stagePillClass[p.stage] || 'bg-gray-100 text-gray-700';
        const status = (days !== null && days < 14 && (p.progress || 0) < 50) ? 'Delayed'
            : (days !== null && days < 45 && (p.progress || 0) < 65) ? 'At Risk' : 'On Track';
        const statC = status === 'Delayed' ? 'text-red-600' : status === 'At Risk' ? 'text-orange-500' : 'text-green-600';
        const urgent = days !== null && days < 14;
        return `
      <div class="px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer relative" data-action="edit-project" data-project="${p.id}">
        <div class="absolute left-0 top-0 bottom-0 w-1 rounded-r" style="background:${barColor}"></div>
        <div class="ml-2">
          <div class="flex items-start justify-between gap-2 mb-1">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-900 truncate">${esc(p.name)}</div>
              <div class="text-xs text-gray-500">${esc(p.client || 'Internal')}</div>
            </div>
            <span class="text-xs font-semibold text-gray-500 flex-shrink-0 mt-0.5">${fte} FTE</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span>${esc(p.end_date || '—')}</span>
            ${days !== null ? `<span class="font-medium ${urgent ? 'text-red-600' : ''}">in ${days} days</span>` : ''}
            <span class="mx-1 text-gray-300">·</span>
            <span>${fmtBudget(p.budget)}</span>
            <span class="text-gray-400">${p.spent_pct || 0}% used</span>
          </div>
          <div class="flex items-center justify-between mb-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-medium ${pillCls}">${esc(p.stage)}</span>
            <span class="text-xs font-semibold ${statC}">${status}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all" style="width:${p.progress || 0}%;background:${barColor}"></div>
            </div>
            <span class="text-xs font-medium text-gray-600 w-8 text-right">${p.progress || 0}%</span>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="px-6 py-8 text-center text-sm text-gray-400">No projects</div>';
}

/* ================================================================ DEADLINES */
function renderDeadlines(data) {
    const PRIORITY_COLOR = { Critical: '#DC2626', High: '#D97706', Medium: '#2563EB', Low: '#6B7280' };
    document.getElementById('deadlinesList').innerHTML = data.map(d => {
        const urgent = d.days < 7;
        const barColor = PRIORITY_COLOR[d.priority] || '#6B7280';
        const priC = { Critical: 'bg-red-100 text-red-700', High: 'bg-orange-100 text-orange-700', Medium: 'bg-blue-100 text-blue-700', Low: 'bg-gray-100 text-gray-700' }[d.priority] || 'bg-gray-100 text-gray-700';
        const statC = { Delayed: 'text-red-600', 'At Risk': 'text-orange-500', 'On Track': 'text-green-600' }[d.status] || 'text-gray-600';
        return `
      <div class="px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer relative" data-action="edit-project" data-project="${d.id}">
        <div class="absolute left-0 top-0 bottom-0 w-1 rounded-r" style="background:${barColor}"></div>
        <div class="ml-2">
          <div class="text-sm font-semibold text-gray-900 mb-1">${esc(d.name)}</div>
          <div class="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span>${esc(d.end_date)}</span>
            <span class="font-medium ${urgent ? 'text-red-600' : ''}">in ${d.days} days</span>
          </div>
          <div class="flex items-center justify-between mb-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-medium ${priC}">${esc(d.priority)}</span>
            <span class="text-xs font-semibold ${statC}">${esc(d.status)}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full rounded-full" style="width:${d.progress}%;background:${barColor}"></div>
            </div>
            <span class="text-xs font-medium text-gray-600 w-8 text-right">${d.progress}%</span>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="px-6 py-8 text-center text-sm text-gray-400">No upcoming deadlines</div>';
}

/* ================================================================ MODALS */
function openModal(html) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="fixed inset-0 modal-bd flex items-center justify-center z-50 p-4" id="mbd">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg modal-enter" onclick="event.stopPropagation()">${html}</div>
  </div>`;
    document.getElementById('mbd').addEventListener('click', closeModal);
}

function closeModal() {
    document.getElementById('modalRoot').innerHTML = '';
}

const mHdr = (title, sub) => `
  <div class="p-6 border-b border-gray-200 flex items-center justify-between">
    <div>
      <h2 class="text-lg font-semibold text-gray-900">${esc(title)}</h2>
      <p class="text-sm text-gray-500 mt-0.5">${esc(sub)}</p>
    </div>
    <button onclick="closeModal()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
      <svg class="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12M6 6l12 12"/></svg>
    </button>
  </div>`;

const mFtr = (id, saveFn, delFn) => `
  <div class="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-2xl">
    <div>${id ? `<button onclick="${delFn}(${id})" class="btn-red text-sm">Delete</button>` : ''}</div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="btn-gray">Cancel</button>
      <button onclick="${saveFn}(${id || 'null'})" class="btn-blue">${id ? 'Save Changes' : 'Create'}</button>
    </div>
  </div>`;

/* ── Assignment modal ─────────────────────────────────────────── */
function openAssignmentModal(opts = {}) {
    const editing = !!opts.id;
    const cur = editing ? S.assignments.find(a => a.id === opts.id) : null;
    const empId2 = opts.employee_id || (cur && cur.employee_id) || (S.employees[0] && S.employees[0].id);
    const projId = (cur && cur.project_id) || (S.projects[0] && S.projects[0].id);
    const yr = opts.year || (cur && cur.year) || S.fiscalYear;
    const mo = opts.month || (cur && cur.month) || 4;
    const wk = opts.week || (cur && cur.week) || 1;
    const pct = (cur && cur.percentage) || 50;
    const moOpts = fiscalMonths(S.fiscalYear).map(m =>
        `<option value="${m.y}-${m.m}" ${m.y === yr && m.m === mo ? 'selected' : ''}>${m.label}</option>`
    ).join('');

    openModal(`
    ${mHdr(editing ? 'Edit Assignment' : 'Add Assignment', editing ? 'Update project allocation' : 'Assign an employee to a project for a specific week')}
    <div class="p-6 space-y-4">
      <div><label class="field-label">Employee</label>
        <select id="fa_emp" class="field-input">
          ${S.employees.map(e => `<option value="${e.id}" ${e.id === empId2 ? 'selected' : ''}>${esc(e.name)} – ${esc(e.dept)}</option>`).join('')}
        </select>
      </div>
      <div><label class="field-label">Project</label>
        <select id="fa_proj" class="field-input">
          ${S.projects.map(p => `<option value="${p.id}" ${p.id === projId ? 'selected' : ''}>${esc(p.code)} — ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="field-label">Month</label><select id="fa_mo" class="field-input">${moOpts}</select></div>
        <div><label class="field-label">Week</label>
          <select id="fa_wk" class="field-input">
            ${[1, 2, 3, 4].map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>Week ${w}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="field-label flex justify-between"><span>Workload Allocation</span><span class="text-blue-600 font-semibold" id="pctLbl">${pct}%</span></label>
        <input id="fa_pct" type="range" min="0" max="150" value="${pct}" class="w-full" oninput="document.getElementById('pctLbl').textContent=this.value+'%'">
        <div class="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>50%</span><span>100%</span><span>150%</span></div>
      </div>
    </div>
    ${mFtr(editing ? opts.id : null, 'saveAssignment', 'deleteAssignment')}`);
}

async function saveAssignment(id) {
    const [y, m] = document.getElementById('fa_mo').value.split('-').map(Number);
    const p = {
        employee_id: +document.getElementById('fa_emp').value,
        project_id: +document.getElementById('fa_proj').value,
        year: y, month: m,
        week: +document.getElementById('fa_wk').value,
        percentage: +document.getElementById('fa_pct').value,
    };
    try {
        if (id) await api('PUT', `/api/assignments/${id}`, p);
        else await api('POST', '/api/assignments', p);
        closeModal(); toast(`Assignment ${id ? 'updated' : 'created'}`); await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteAssignment(id) {
    if (!confirm('Delete this assignment?')) return;
    try { await api('DELETE', `/api/assignments/${id}`); closeModal(); toast('Assignment deleted'); await loadAll(); }
    catch (e) { toast(e.message, 'error'); }
}

/* ── Employee modal ───────────────────────────────────────────── */
function openEmployeeModal(opts = {}) {
    const editing = !!opts.id;
    const e = editing ? S.employees.find(x => x.id === opts.id) : null;
    const name = e ? e.name : '', dept = e ? e.dept : 'Professional Services';
    const email = e ? e.email || '' : '', code = e ? e.employee_code || '' : '';
    const depts = ['Solution', 'Professional Services', 'Finance', 'Sales', 'Operations', 'Management'];

    openModal(`
    ${mHdr(editing ? 'Edit Employee' : 'Add Employee', editing ? 'Update employee details' : 'Add a new team member')}
    <div class="p-6 space-y-4">
      <div><label class="field-label">Full Name</label><input id="fe_name" type="text" class="field-input" value="${esc(name)}" placeholder="e.g. Nusrath Jahan Nisha"></div>
      <div><label class="field-label">Employee ID</label><input id="fe_code" type="text" class="field-input mono" value="${esc(code)}" placeholder="e.g. SGESA00055"></div>
      <div><label class="field-label">Employee Email</label><input id="fe_email" type="email" class="field-input" value="${esc(email)}" placeholder="name@esribd.com"></div>
      <div><label class="field-label">Department</label>
        <select id="fe_dept" class="field-input">${depts.map(d => `<option ${d === dept ? 'selected' : ''}>${d}</option>`).join('')}</select>
      </div>
    </div>
    ${mFtr(editing ? opts.id : null, 'saveEmployee', 'deleteEmployee')}`);
}

async function saveEmployee(id) {
    const payload = {
        employee_code: document.getElementById('fe_code').value.trim(),
        name: document.getElementById('fe_name').value.trim(),
        dept: document.getElementById('fe_dept').value,
        email: document.getElementById('fe_email').value.trim(),
    };
    if (!payload.name) { toast('Name is required', 'error'); return; }
    try {
        if (id) await api('PUT', `/api/employees/${id}`, payload);
        else await api('POST', '/api/employees', payload);
        closeModal(); toast(`Employee ${id ? 'updated' : 'added'}`); await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteEmployee(id) {
    if (!confirm('Delete this employee? All their assignments will also be removed.')) return;
    try { await api('DELETE', `/api/employees/${id}`); closeModal(); toast('Employee deleted'); await loadAll(); }
    catch (e) { toast(e.message, 'error'); }
}

/* ── Project modal ────────────────────────────────────────────── */
function openProjectModal(opts = {}) {
    const editing = !!opts.id;
    const p = editing ? S.projects.find(x => x.id === opts.id) : null;
    const v = (k, fb) => p ? (p[k] ?? fb) : fb;

    const CURRENCIES = ['USD', 'BDT', 'EUR', 'GBP'];
    const curOpts = (sel) => CURRENCIES.map(c => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
    const OWNER_OPTS = ['Abdullah Al Baki', 'Basher Muhammad Raquibul Raquibul', 'Zobayer Ahmed',
        'Most Iffat Ara Ila', 'Md Naiemul Haque Chowdhury', 'Mohammad A. Hadi'];

    openModal(`
    ${mHdr(editing ? 'Edit Project' : 'Add Project', editing ? 'Update project details' : 'Register a new project')}
    <div class="p-6 space-y-4 max-h-[80vh] overflow-y-auto nice-scroll">

      <!-- Row: Opportunity Number + Priority -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Opportunity Number</label>
          <input id="fp_code" type="text" class="field-input mono" value="${esc(v('code', ''))}" placeholder="e.g. SA136664">
        </div>
        <div>
          <label class="field-label">Priority</label>
          <select id="fp_pri" class="field-input">${PRIORITIES.map(x => `<option ${x === v('priority', 'Medium') ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
      </div>

      <!-- Project Name -->
      <div>
        <label class="field-label">Project Name</label>
        <input id="fp_name" type="text" class="field-input" value="${esc(v('name', ''))}" placeholder="e.g. Desktop SW for IWM 2026">
      </div>

      <!-- Account Name + Product Name -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Account Name</label>
          <input id="fp_account" type="text" class="field-input" value="${esc(v('account_name', v('client', '')))}" placeholder="e.g. Institute of Water Modelling">
        </div>
        <div>
          <label class="field-label">Product Name</label>
          <input id="fp_product_name" type="text" class="field-input" value="${esc(v('product_name', ''))}" placeholder="e.g. PS Project Implementation">
        </div>
      </div>

      <!-- Opportunity Owner + Owner Role -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Opportunity Owner</label>
          <input id="fp_owner" type="text" class="field-input" list="ownerList" value="${esc(v('opportunity_owner', ''))}" placeholder="Select or type name">
          <datalist id="ownerList">${OWNER_OPTS.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
        </div>
        <div>
          <label class="field-label">Owner Role</label>
          <input id="fp_owner_role" type="text" class="field-input" value="${esc(v('owner_role', ''))}" placeholder="e.g. Sales Rep">
        </div>
      </div>

      <!-- Product Family + Stage -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Product Family</label>
          <input id="fp_family" type="text" class="field-input" value="${esc(v('product_family', 'Professional Services'))}" placeholder="Professional Services">
        </div>
        <div>
          <label class="field-label">Stage</label>
          <select id="fp_stage" class="field-input">${STAGES.map(x => `<option ${x === v('stage', 'Prospect') ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
      </div>

      <!-- Product Amount + Probability -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Product Amount (USD)</label>
          <input id="fp_product_amount" type="number" class="field-input" value="${v('product_amount', 0)}" min="0" step="0.01">
        </div>
        <div>
          <label class="field-label">Probability (%)</label>
          <input id="fp_probability" type="number" class="field-input" value="${v('probability', 0)}" min="0" max="100" step="5">
        </div>
      </div>

      <!-- Sales Price Currency + Sales Price -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Sales Price Currency</label>
          <select id="fp_sp_cur" class="field-input">${curOpts(v('sales_price_currency', 'USD'))}</select>
        </div>
        <div>
          <label class="field-label">Sales Price</label>
          <input id="fp_sales_price" type="number" class="field-input" value="${v('sales_price', 0)}" min="0" step="0.01">
        </div>
      </div>

      <!-- Amount Currency + Amount -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Amount Currency</label>
          <select id="fp_amt_cur" class="field-input">${curOpts(v('amount_currency', 'USD'))}</select>
        </div>
        <div>
          <label class="field-label">Amount</label>
          <input id="fp_opp_amount" type="number" class="field-input" value="${v('opp_amount', 0)}" min="0" step="0.01">
        </div>
      </div>

      <!-- List Price Currency + List Price -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">List Price Currency</label>
          <select id="fp_lp_cur" class="field-input">${curOpts(v('list_price_currency', 'USD'))}</select>
        </div>
        <div>
          <label class="field-label">List Price</label>
          <input id="fp_list_price" type="number" class="field-input" value="${v('list_price', 0)}" min="0" step="0.01">
        </div>
      </div>

      <!-- Quantity + Vendor Product Code -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Quantity</label>
          <input id="fp_quantity" type="number" class="field-input" value="${v('quantity', 1)}" min="1">
        </div>
        <div>
          <label class="field-label">Vendor Product Code</label>
          <input id="fp_vpc" type="text" class="field-input mono" value="${esc(v('vendor_product_code', ''))}" placeholder="e.g. 700390">
        </div>
      </div>

      <!-- Close Date + Product Date -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Close Date</label>
          <input id="fp_end" type="date" class="field-input" value="${esc(v('end_date', ''))}">
        </div>
        <div>
          <label class="field-label">Product Date</label>
          <input id="fp_product_date" type="date" class="field-input" value="${esc(v('product_date', ''))}">
        </div>
      </div>

      <!-- Product Month + Close Month -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="field-label">Product Month</label>
          <input id="fp_product_month" type="date" class="field-input" value="${esc(v('product_month', ''))}">
        </div>
        <div>
          <label class="field-label">Close Month</label>
          <input id="fp_close_month" type="date" class="field-input" value="${esc(v('close_month', ''))}">
        </div>
      </div>

      <!-- Active Product -->
      <div class="flex items-center gap-3">
        <input id="fp_active" type="checkbox" class="w-4 h-4 accent-blue-600" ${v('active_product', 1) ? 'checked' : ''}>
        <label for="fp_active" class="field-label mb-0 cursor-pointer">Active Product</label>
      </div>

      <!-- Product Description -->
      <div>
        <label class="field-label">Product Description</label>
        <textarea id="fp_desc" rows="2" class="field-input" placeholder="Product description...">${esc(v('product_description', ''))}</textarea>
      </div>

      <!-- Progress (internal tracking) -->
      <div>
        <label class="field-label flex justify-between"><span>Progress (internal)</span><span class="text-blue-600 font-semibold" id="progLbl">${v('progress', 0)}%</span></label>
        <input id="fp_prog" type="range" min="0" max="100" value="${v('progress', 0)}" class="w-full" oninput="document.getElementById('progLbl').textContent=this.value+'%'">
      </div>

      <!-- Color -->
      <div>
        <label class="field-label">Color</label>
        <div class="flex flex-wrap gap-2" id="cpkr">
          ${PCOLORS.map(c => `<button type="button" data-c="${c}" class="w-8 h-8 rounded-lg ${c === v('color', '#8B5CF6') ? 'ring-2 ring-offset-2 ring-gray-900' : ''}" style="background:${c}"></button>`).join('')}
        </div>
        <input type="hidden" id="fp_color" value="${v('color', '#8B5CF6')}">
      </div>

    </div>
    ${mFtr(editing ? opts.id : null, 'saveProject', 'deleteProject')}`);

    document.querySelectorAll('#cpkr button').forEach(b => {
        b.addEventListener('click', () => {
            document.getElementById('fp_color').value = b.dataset.c;
            document.querySelectorAll('#cpkr button').forEach(x => x.classList.remove('ring-2', 'ring-offset-2', 'ring-gray-900'));
            b.classList.add('ring-2', 'ring-offset-2', 'ring-gray-900');
        });
    });
}

async function saveProject(id) {
    const p = {
        code: document.getElementById('fp_code').value.trim().toUpperCase(),
        name: document.getElementById('fp_name').value.trim(),
        account_name: document.getElementById('fp_account').value.trim(),
        client: document.getElementById('fp_account').value.trim(), // keep for compat
        product_name: document.getElementById('fp_product_name').value.trim(),
        opportunity_owner: document.getElementById('fp_owner').value.trim(),
        owner_role: document.getElementById('fp_owner_role').value.trim(),
        product_family: document.getElementById('fp_family').value.trim(),
        stage: document.getElementById('fp_stage').value,
        priority: document.getElementById('fp_pri').value,
        product_amount: +document.getElementById('fp_product_amount').value,
        probability: +document.getElementById('fp_probability').value,
        sales_price_currency: document.getElementById('fp_sp_cur').value,
        sales_price: +document.getElementById('fp_sales_price').value,
        amount_currency: document.getElementById('fp_amt_cur').value,
        opp_amount: +document.getElementById('fp_opp_amount').value,
        list_price_currency: document.getElementById('fp_lp_cur').value,
        list_price: +document.getElementById('fp_list_price').value,
        quantity: +document.getElementById('fp_quantity').value,
        vendor_product_code: document.getElementById('fp_vpc').value.trim(),
        end_date: document.getElementById('fp_end').value,
        product_date: document.getElementById('fp_product_date').value,
        product_month: document.getElementById('fp_product_month').value,
        close_month: document.getElementById('fp_close_month').value,
        active_product: document.getElementById('fp_active').checked ? 1 : 0,
        product_description: document.getElementById('fp_desc').value.trim(),
        progress: +document.getElementById('fp_prog').value,
        color: document.getElementById('fp_color').value,
        budget: +document.getElementById('fp_opp_amount').value, // map amount→budget for compat
    };
    if (!p.code || !p.name) { toast('Opportunity Number and Project Name required', 'error'); return; }
    try {
        if (id) await api('PUT', `/api/projects/${id}`, p);
        else await api('POST', '/api/projects', p);
        closeModal(); toast(`Project ${id ? 'updated' : 'created'}`); await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteProject(id) {
    if (!confirm('Delete this project? All its assignments will also be removed.')) return;
    try { await api('DELETE', `/api/projects/${id}`); closeModal(); toast('Project deleted'); await loadAll(); }
    catch (e) { toast(e.message, 'error'); }
}

/* ================================================================ EVENTS */
function initEvents() {
    /* Add dropdown */
    const addBtn = document.getElementById('addMenuBtn');
    const addMenu = document.getElementById('addMenu');
    addBtn.addEventListener('click', e => { e.stopPropagation(); addMenu.classList.toggle('hidden'); });
    document.addEventListener('click', () => addMenu.classList.add('hidden'));
    addMenu.querySelectorAll('button[data-add]').forEach(b => {
        b.addEventListener('click', () => {
            addMenu.classList.add('hidden');
            if (b.dataset.add === 'employee') openEmployeeModal();
            if (b.dataset.add === 'project') openProjectModal();
            if (b.dataset.add === 'assignment') openAssignmentModal();
        });
    });

    /* Search */
    document.getElementById('searchBox').addEventListener('input', e => {
        S.searchQuery = e.target.value; renderMatrix();
    });

    /* Matrix clicks */
    document.getElementById('matrixTable').addEventListener('click', e => {
        const del = e.target.closest('[data-action="delete-assign"]');
        if (del) { e.stopPropagation(); deleteAssignment(+del.dataset.id); return; }
        const chip = e.target.closest('[data-action="edit-assign"]');
        if (chip) { e.stopPropagation(); openAssignmentModal({ id: +chip.dataset.id }); return; }
        const emp = e.target.closest('[data-action="edit-emp"]');
        if (emp) { e.stopPropagation(); openEmployeeModal({ id: +emp.dataset.emp }); return; }
        const cell = e.target.closest('td.cell');
        if (cell) openAssignmentModal({ employee_id: +cell.dataset.emp, year: +cell.dataset.year, month: +cell.dataset.month, week: +cell.dataset.week });
    });

    /* Body delegation */
    document.body.addEventListener('click', e => {
        const ep = e.target.closest('[data-action="edit-emp-side"]');
        if (ep) openEmployeeModal({ id: +ep.dataset.emp });
        const pr = e.target.closest('[data-action="edit-project"]');
        if (pr) openProjectModal({ id: +pr.dataset.project });
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    initColResize();
    initDragDrop();
}

/* ── Column resize ────────────────────────────────────────────── */
function initColResize() {
    const root = document.documentElement;
    let activeCol = null, startX = 0, startW = 0;
    const MIN_W = 100;

    function getW(col) {
        return parseInt(getComputedStyle(root).getPropertyValue(`--${col}-w`), 10) || (col === 'name' ? 220 : 160);
    }

    document.getElementById('matrixWrap').addEventListener('mousedown', e => {
        const handle = e.target.closest('.col-resizer');
        if (!handle) return;
        e.preventDefault();
        activeCol = handle.dataset.col;
        startX = e.clientX; startW = getW(activeCol);
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!activeCol) return;
        root.style.setProperty(`--${activeCol}-w`, Math.max(MIN_W, startW + (e.clientX - startX)) + 'px');
    });

    document.addEventListener('mouseup', () => {
        if (!activeCol) return;
        document.querySelectorAll('.col-resizer.active').forEach(el => el.classList.remove('active'));
        activeCol = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

/* ── Drag & Drop section reordering ──────────────────────────── */
function initDragDrop() {
    const canvas = document.getElementById('dashboard-canvas');
    let dragSrc = null, lastIndicator = null, lastTarget = null;

    /* Edge auto-scroll */
    let scrollRAF = null, pointerY = 0;
    const EDGE = 130, MAX_SPD = 18;

    function scrollLoop() {
        const vh = window.innerHeight;
        if (pointerY < EDGE) window.scrollBy(0, -MAX_SPD * (1 - pointerY / EDGE));
        else if (pointerY > vh - EDGE) window.scrollBy(0, MAX_SPD * ((pointerY - (vh - EDGE)) / EDGE));
        scrollRAF = requestAnimationFrame(scrollLoop);
    }
    const startScroll = () => { if (!scrollRAF) scrollRAF = requestAnimationFrame(scrollLoop); };
    const stopScroll = () => { if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; } };

    document.addEventListener('dragover', e => { if (!dragSrc) return; pointerY = e.clientY; startScroll(); });
    document.addEventListener('dragend', stopScroll);
    document.addEventListener('drop', stopScroll);

    function clearIndicators() {
        canvas.querySelectorAll('.ds').forEach(s => s.classList.remove('drop-above', 'drop-below'));
    }

    canvas.querySelectorAll('.ds').forEach(section => {
        const handle = section.querySelector('.drag-handle');
        if (!handle) return;

        handle.addEventListener('mousedown', () => section.setAttribute('draggable', 'true'));
        document.addEventListener('mouseup', () => section.setAttribute('draggable', 'false'));

        section.addEventListener('dragstart', e => {
            dragSrc = section;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', section.dataset.section);
            requestAnimationFrame(() => section.classList.add('is-dragging'));
        });

        section.addEventListener('dragend', () => {
            section.classList.remove('is-dragging');
            section.setAttribute('draggable', 'false');
            clearIndicators(); stopScroll();
            dragSrc = null; lastTarget = null;
        });

        section.addEventListener('dragover', e => {
            e.preventDefault(); e.dataTransfer.dropEffect = 'move';
            if (!dragSrc || dragSrc === section) { clearIndicators(); return; }
            const rect = section.getBoundingClientRect();
            const above = e.clientY < rect.top + rect.height / 2;
            if (lastTarget !== section || lastIndicator !== (above ? 'above' : 'below')) {
                clearIndicators();
                section.classList.add(above ? 'drop-above' : 'drop-below');
                lastTarget = section; lastIndicator = above ? 'above' : 'below';
            }
        });

        section.addEventListener('dragleave', e => {
            if (!section.contains(e.relatedTarget)) {
                section.classList.remove('drop-above', 'drop-below');
                if (lastTarget === section) lastTarget = null;
            }
        });

        section.addEventListener('drop', e => {
            e.preventDefault();
            if (!dragSrc || dragSrc === section) return;
            const above = e.clientY < section.getBoundingClientRect().top + section.getBoundingClientRect().height / 2;
            if (above) canvas.insertBefore(dragSrc, section);
            else section.after(dragSrc);
            clearIndicators();
        });
    });
}

/* ================================================================ INIT */
async function init() {
    initEvents();
    await loadAll();
}

init();