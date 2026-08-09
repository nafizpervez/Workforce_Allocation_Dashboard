/* Workforce Allocation Dashboard — dashboard/workload.js */

function openYearlyWorkProjectModal(empId) {
  const emp = S.employees.find(e => e.id === empId); if (!emp) return;
  const TOTAL_FY_WEEKS = getEmployeeAvailableFiscalWeekCount(empId, S.matrixFiscalYear, S.matrixAssignments), empAssignments = getEffectiveFiscalAssignments(S.matrixFiscalYear, S.matrixAssignments).filter(a => a.employee_id === empId), projectMap = {};
  for (const a of empAssignments) { const project = S.projects.find(p => p.id === a.project_id); if (!project) continue; if (!projectMap[a.project_id]) projectMap[a.project_id] = { project_id: a.project_id, code: project.code || a.project_code || '', name: project.name || a.project_name || '', account_name: project.account_name || project.client || a.account_name || '—', product_name: project.product_name || a.product_name || '—', product_family: project.product_family || '—', stage: project.stage || '—', color: project.color || a.project_color || '#8B5CF6', weightedWeeks: 0, slotCount: 0, totalPct: 0 }; projectMap[a.project_id].weightedWeeks += (Number(a.percentage) || 0) / 100; projectMap[a.project_id].slotCount += 1; projectMap[a.project_id].totalPct += Number(a.percentage) || 0; }
  const projects = Object.values(projectMap).map(p => ({ ...p, contribution: +((p.weightedWeeks / TOTAL_FY_WEEKS) * 100).toFixed(1), avgPct: p.slotCount ? +(p.totalPct / p.slotCount).toFixed(1) : 0 })).sort((a, b) => b.contribution - a.contribution);
  const totalContribution = projects.reduce((sum, p) => sum + p.contribution, 0);
  const rows = projects.map((p, idx) => `<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-3"><div class="flex items-start justify-between gap-4"><div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1"><span class="w-3 h-3 rounded-sm flex-shrink-0" style="background:${p.color}"></span><span class="text-xs font-bold text-blue-600 mono">${esc(p.code)}</span><span class="text-xs text-gray-400">#${idx + 1}</span></div><div class="text-sm font-semibold text-gray-900 leading-snug">${esc(p.name)}</div><div class="text-xs text-gray-500 mt-1">${esc(p.account_name)}<span class="text-gray-300 mx-1">·</span>${esc(p.product_name)}</div><div class="flex flex-wrap gap-1.5 mt-2"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">${esc(p.product_family)}</span><span class="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">${esc(p.stage)}</span></div></div><div class="text-right flex-shrink-0"><div class="text-lg font-bold text-gray-900">${p.contribution}%</div><div class="text-xs text-gray-400">FY contribution</div><div class="text-xs text-gray-500 mt-1">${p.slotCount} week slot${p.slotCount === 1 ? '' : 's'}</div><div class="text-xs text-gray-500">${p.avgPct}% avg workload</div></div></div><div class="mt-3 flex items-center gap-2"><div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(p.contribution, 100)}%;background:${p.color}"></div></div><span class="text-xs font-semibold text-gray-600 w-12 text-right">${p.contribution}%</span></div></div>`).join('');
  openModal(mHdr(`${emp.name} — Yearly Project Work`, `${fiscalYearDisplayLabel(S.matrixFiscalYear)} · ${projects.length} assigned project${projects.length === 1 ? '' : 's'} · Total ${totalContribution.toFixed(1)}%`) + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">${rows || '<p class="text-sm text-gray-400 text-center py-8">No project assignments found.</p>'}</div><div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl"><button onclick="closeModal()" class="btn-gray">Close</button></div>`, 'max-w-3xl');
}
function renderYearlyWorkByProjectChart() {
  const canvas = document.getElementById('yearlyWorkChart'); if (!canvas) return; if (S.charts.yearlyWork) S.charts.yearlyWork.destroy();
  const ctx = canvas.getContext('2d'), employees = getActiveEmployees(), empProjectMap = {};
  const effectiveAssignments = getEffectiveFiscalAssignments(S.matrixFiscalYear, S.matrixAssignments);
  for (const e of employees) empProjectMap[e.id] = {};
  for (const a of effectiveAssignments) { if (!empProjectMap[a.employee_id]) continue; const project = S.projects.find(p => p.id === a.project_id); if (!project) continue; empProjectMap[a.employee_id][a.project_id] ||= { weightedWeeks: 0 }; empProjectMap[a.employee_id][a.project_id].weightedWeeks += (Number(a.percentage) || 0) / 100; }
  const assignedProjectIds = [...new Set(effectiveAssignments.filter(a => employees.some(e => e.id === a.employee_id)).map(a => a.project_id))];
  const assignedProjects = assignedProjectIds.map(pid => S.projects.find(p => p.id === pid)).filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const labels = employees.map(e => e.name);
  const datasets = assignedProjects.map(project => ({ label: `${project.code || ''} — ${project.name || ''}`, projectCode: project.code || '', projectName: project.name || '', data: employees.map(e => { const item = empProjectMap[e.id]?.[project.id]; const availableWeeks = getEmployeeAvailableFiscalWeekCount(e.id, S.matrixFiscalYear, S.matrixAssignments); return item && availableWeeks ? +((item.weightedWeeks / availableWeeks) * 100).toFixed(2) : 0; }), backgroundColor: project.color || '#8B5CF6', borderWidth: 0, borderRadius: 2, barPercentage: 0.75, categoryPercentage: 0.78 }));
  const totalUtilByEmployee = employees.map(e => { const weightedWeeks = Object.values(empProjectMap[e.id] || {}).reduce((sum, item) => sum + item.weightedWeeks, 0); const availableWeeks = getEmployeeAvailableFiscalWeekCount(e.id, S.matrixFiscalYear, S.matrixAssignments); return availableWeeks ? +((weightedWeeks / availableWeeks) * 100).toFixed(1) : 0; });
  S.charts.yearlyWork = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, onClick: (event, elements) => { if (!elements.length) return; const emp = employees[elements[0].index]; if (emp) openYearlyWorkProjectModal(emp.id); }, onHover: (event, elements) => { const target = event.native?.target; if (target) target.style.cursor = elements.length ? 'pointer' : 'default'; }, interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 }, padding: 8, generateLabels: chart => { const shortText = (txt, max = 32) => { const t = String(txt || '').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; }; return chart.data.datasets.map((ds, i) => ({ text: shortText(ds.projectName || ds.label), fillStyle: ds.backgroundColor, strokeStyle: ds.backgroundColor, lineWidth: 0, hidden: !chart.isDatasetVisible(i), datasetIndex: i })); } } }, tooltip: { bodyFont: { size: 11 }, titleFont: { size: 12, weight: '600' }, padding: 10, callbacks: { title: items => `${employees[items[0].dataIndex].name} · Total ${totalUtilByEmployee[items[0].dataIndex]}%`, label: c => { const val = c.parsed.y || 0; if (!val) return ''; return [` ${c.dataset.projectCode}: ${val}%`, ` ${c.dataset.projectName}`]; } } } }, scales: { x: { stacked: true, ticks: { font: { size: 11 }, color: '#374151', maxRotation: 45, minRotation: 35 }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { font: { size: 11 }, color: '#6B7280', callback: v => `${v}%` }, grid: { color: '#F3F4F6' }, title: { display: true, text: 'FY workload contribution (%)', font: { size: 11 }, color: '#9CA3AF' } } } } });
}


function getProjectWisePeopleBreakdown() {
  const TOTAL_FY_WEEKS = 48;
  const activeEmployees = getActiveEmployees();
  const employeeMap = new Map(activeEmployees.map(e => [e.id, e]));
  const projectMap = new Map();

  for (const a of getEffectiveFiscalAssignments(S.matrixFiscalYear, S.matrixAssignments)) {
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
        assignedDays: 0,
        assignedDaySlots: new Set(),
      });
    }

    const pct = Number(a.percentage) || 0;
    const weighted = pct / 100;
    const person = bucket.people.get(emp.id);

    person.weightedWeeks += weighted;
    person.slotCount += 1;
    person.totalPct += pct;

    const daySlotKey = `${a.year}-${a.month}-${a.week}`;
    if (!person.assignedDaySlots.has(daySlotKey)) {
      person.assignedDaySlots.add(daySlotKey);
      person.assignedDays += matrixSlotDayCount(a.year, a.month, a.week);
    }

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
          contribution: +((p.weightedWeeks / Math.max(getEmployeeAvailableFiscalWeekCount(p.employee.id, S.matrixFiscalYear, S.matrixAssignments), 1)) * 100).toFixed(2),
          avgPct: p.slotCount ? +(p.totalPct / p.slotCount).toFixed(1) : 0,
          assignedDays: p.assignedDays || 0,
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
          <div class="text-xs font-semibold text-gray-500 mt-0.5">${p.assignedDays} day${p.assignedDays === 1 ? '' : 's'} assigned</div>
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
    info.textContent = `${projects.length} assigned project${projects.length === 1 ? '' : 's'} · ${employees.length} active resource${employees.length === 1 ? '' : 's'} · chart capped at ${PROJECT_PEOPLE_CHART_DISPLAY_MAX}%`;
  }

  const labels = projects.map(item => item.project.name || item.project.code || 'Project');
  const totalByProject = projects.map(item => item.contribution);
  const highestActualProjectTotal = Math.max(0, ...totalByProject.map(v => Number(v) || 0));

  const datasets = employees.map((emp, idx) => {
    const color = PCOLORS[idx % PCOLORS.length];
    const rawData = projects.map(item => {
      const person = item.peopleList.find(p => p.employee.id === emp.id);
      return person ? person.contribution : 0;
    });
    const displayData = rawData.map((rawValue, projectIndex) => {
      const total = totalByProject[projectIndex] || 0;
      if (!rawValue) return 0;

      let displayValue = rawValue;

      // Visual-only scaling: keep very large project bars capped so smaller projects stay visible.
      // The tooltip and click modal still use exact rawData percentages.
      if (total > PROJECT_PEOPLE_CHART_DISPLAY_MAX) {
        displayValue = (rawValue * PROJECT_PEOPLE_CHART_DISPLAY_MAX) / total;
      }

      // Give very small non-zero assignments a minimum visible height on the chart.
      // This is visual-only and does not change exact calculation values.
      return +Math.max(displayValue, PROJECT_PEOPLE_CHART_MIN_VISIBLE).toFixed(2);
    });

    return {
      label: emp.name,
      employeeId: emp.id,
      employeeName: emp.name,
      rawData,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: 2,
      barPercentage: 0.72,
      categoryPercentage: 0.78,
      data: displayData,
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
              const val = c.dataset.rawData?.[c.dataIndex] ?? c.parsed.y ?? 0;
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
          max: PROJECT_PEOPLE_CHART_DISPLAY_MAX,
          ticks: {
            font: { size: 11 },
            color: '#6B7280',
            callback: v => {
              const value = Number(v);
              if (
                value === PROJECT_PEOPLE_CHART_DISPLAY_MAX &&
                highestActualProjectTotal > PROJECT_PEOPLE_CHART_DISPLAY_MAX
              ) {
                return `${highestActualProjectTotal.toFixed(2)}%`;
              }
              return `${value}%`;
            },
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


