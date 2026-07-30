const { canonicalPersonName } = require('./person-identity');
const { cleanText, normalizeImportDate, safeNum } = require('./values');

function normalizeTimesheetPayloadRows(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const month = cleanText(row.month);
    const worker = canonicalPersonName(row.worker);
    const workType = cleanText(row.workType || row.work_type);
    const projectName = cleanText(row.projectName || row.project_name || '(No project name)');
    const quantity = safeNum(row.qty, 0);
    if (!month || !worker || !workType || quantity <= 0) continue;

    const key = [month, worker, workType, projectName].join('\u001F');
    if (!grouped.has(key)) grouped.set(key, { month, worker, workType, projectName, qty: 0 });
    grouped.get(key).qty += quantity;
  }
  return [...grouped.values()].map(row => ({ ...row, qty: +row.qty.toFixed(4) }));
}

function normalizeTimesheetDetailPayloadRows(rows) {
  const normalized = [];

  for (const row of rows || []) {
    const month = cleanText(row.month);
    const workDate = normalizeImportDate(row.workDate || row.work_date || row.date);
    const worker = canonicalPersonName(row.worker);
    const workType = cleanText(row.workType || row.work_type);
    const quantity = safeNum(row.qty, 0);

    if (!month || !workDate || !worker || !workType || quantity <= 0) continue;

    normalized.push({
      month,
      workDate,
      worker,
      workType,
      workerCostCenter: cleanText(row.workerCostCenter || row.worker_cost_center),
      qty: +quantity.toFixed(4),
      status: cleanText(row.status),
      timeEntryCode: cleanText(row.timeEntryCode || row.time_entry_code),
      billable: cleanText(row.billable),
      projectHierarchy: cleanText(row.projectHierarchy || row.project_hierarchy),
      projectId: cleanText(row.projectId || row.project_id),
      externalProjectReference: cleanText(
        row.externalProjectReference || row.external_project_reference,
      ),
      projectName: cleanText(row.projectName || row.project_name),
      customer: cleanText(row.customer),
      projectPhaseName: cleanText(row.projectPhaseName || row.project_phase_name),
      projectTask: cleanText(row.projectTask || row.project_task),
      customTaskName: cleanText(row.customTaskName || row.custom_task_name),
      projectRole: cleanText(row.projectRole || row.project_role),
      comment: cleanText(row.comment),
      sourceRowNo: Math.max(0, Math.trunc(safeNum(row.sourceRowNo || row.source_row_no, 0))),
    });
  }

  return normalized;
}

module.exports = {
  normalizeTimesheetDetailPayloadRows,
  normalizeTimesheetPayloadRows,
};
