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

