const { cleanText, safeNum } = require('./values');

function normalizeTimesheetPayloadRows(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const month = cleanText(row.month);
    const worker = cleanText(row.worker);
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

module.exports = { normalizeTimesheetPayloadRows };
