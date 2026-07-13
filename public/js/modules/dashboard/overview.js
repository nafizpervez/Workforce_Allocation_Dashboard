/* Workforce Allocation Dashboard — dashboard/overview.js */

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

/* ================================================================ CHARTS */
function renderTrends(data) { if (S.charts.trends) S.charts.trends.destroy(); const ctx = document.getElementById('trendsChart').getContext('2d'); S.charts.trends = new Chart(ctx, { type: 'line', data: { labels: data.map(d => d.label), datasets: [{ label: 'Assignments', data: data.map(d => d.assignments), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.06)', tension: 0.4, borderWidth: 2, pointRadius: 3, fill: true, yAxisID: 'y' }, { label: 'Utilization %', data: data.map(d => d.utilization), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.04)', tension: 0.4, borderWidth: 2, pointRadius: 3, yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 }, padding: 8 } }, scales: { x: { ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y: { position: 'left', ticks: { font: { size: 11 } }, grid: { color: '#F3F4F6' } }, y1: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } } } } }); }

function getAssignmentBurnSeries() {
  const months = fiscalMonths(S.fiscalYear);
  const labels = months.map(m => m.label);
  const activeEmployeeIds = new Set(getActiveEmployees().map(e => e.id));
  const monthIndex = new Map(months.map((m, i) => [`${m.y}-${m.m}`, i]));
  const planned = months.map(() => 0);

  for (const a of S.assignments || []) {
    if (!activeEmployeeIds.has(a.employee_id)) continue;
    const idx = monthIndex.get(`${a.year}-${a.month}`);
    if (idx === undefined) continue;
    planned[idx] += (Number(a.percentage) || 0) / 100;
  }

  const total = planned.reduce((s, v) => s + v, 0);
  let running = 0;
  const cumulative = planned.map(v => {
    running += v;
    return +running.toFixed(2);
  });
  const remaining = cumulative.map(v => +Math.max(total - v, 0).toFixed(2));
  const idealBurn = months.map((_, i) => +Math.max(total - ((total / Math.max(months.length, 1)) * (i + 1)), 0).toFixed(2));
  const idealUp = months.map((_, i) => +Math.min((total / Math.max(months.length, 1)) * (i + 1), total).toFixed(2));

  return {
    labels,
    planned: planned.map(v => +v.toFixed(2)),
    cumulative,
    remaining,
    idealBurn,
    idealUp,
    total: +total.toFixed(2),
  };
}

function burnChartTooltipUnit(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(2)} FTE-week${Math.abs(n - 1) < 0.0001 ? '' : 's'}`;
}

function renderBurndownChart() {
  if (S.charts.burndown) S.charts.burndown.destroy();
  const el = document.getElementById('burndownChart');
  if (!el) return;
  const ctx = el.getContext('2d');
  const s = getAssignmentBurnSeries();

  S.charts.burndown = new Chart(ctx, {
    type: 'line',
    data: {
      labels: s.labels,
      datasets: [
        {
          label: 'Remaining workload',
          data: s.remaining,
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
        },
        {
          label: 'Ideal burndown',
          data: s.idealBurn,
          borderColor: '#94A3B8',
          borderDash: [5, 5],
          fill: false,
          tension: 0.15,
          borderWidth: 1.5,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } },
        tooltip: {
          bodyFont: { size: 11 },
          titleFont: { size: 11 },
          padding: 8,
          callbacks: { label: c => ` ${c.dataset.label}: ${burnChartTooltipUnit(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { font: { size: 11 }, maxRotation: 35, minRotation: 0 }, grid: { color: '#F3F4F6' } },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(s.total, 1),
          ticks: { font: { size: 11 }, callback: v => Number(v).toFixed(0) },
          grid: { color: '#F3F4F6' },
          title: { display: true, text: 'Remaining workload (FTE-weeks)', font: { size: 11 }, color: '#9CA3AF' },
        },
      },
    },
  });
}

function renderBurnupChart() {
  if (S.charts.burnup) S.charts.burnup.destroy();
  const el = document.getElementById('burnupChart');
  if (!el) return;
  const ctx = el.getContext('2d');
  const s = getAssignmentBurnSeries();

  S.charts.burnup = new Chart(ctx, {
    type: 'line',
    data: {
      labels: s.labels,
      datasets: [
        {
          label: 'Cumulative workload',
          data: s.cumulative,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
        },
        {
          label: 'Total planned workload',
          data: s.labels.map(() => s.total),
          borderColor: '#10B981',
          borderDash: [5, 5],
          fill: false,
          tension: 0,
          borderWidth: 1.5,
          pointRadius: 0,
        },
        {
          label: 'Ideal burnup',
          data: s.idealUp,
          borderColor: '#94A3B8',
          borderDash: [3, 4],
          fill: false,
          tension: 0.15,
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
        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 12 } },
        tooltip: {
          bodyFont: { size: 11 },
          titleFont: { size: 11 },
          padding: 8,
          callbacks: { label: c => ` ${c.dataset.label}: ${burnChartTooltipUnit(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { font: { size: 11 }, maxRotation: 35, minRotation: 0 }, grid: { color: '#F3F4F6' } },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(s.total, 1),
          ticks: { font: { size: 11 }, callback: v => Number(v).toFixed(0) },
          grid: { color: '#F3F4F6' },
          title: { display: true, text: 'Cumulative workload (FTE-weeks)', font: { size: 11 }, color: '#9CA3AF' },
        },
      },
    },
  });
}

