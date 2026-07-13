/* Workforce Allocation Dashboard — timesheets/summary.js */

/* ================================================================ WORK SUMMARY: PROJECT / TEAM / INDIVIDUAL */
const TIMESHEET_WORK_TYPE_ORDER = [
  'Training Delivery',
  'Skill Development',
  'Service Delivery - Local PS',
  'Service Delivery - Intrasourcing',
  'Pre - Sales',
  'General Admin',
];

// Chart.js stacks datasets from bottom to top. To show the visual stack as:
// Training Delivery → Skill Development → Service Delivery - Local PS →
// Service Delivery - Intrasourcing → Pre - Sales → General Admin
// from top to bottom, datasets are built in reverse order.
const TIMESHEET_WORK_TYPE_STACK_ORDER = [...TIMESHEET_WORK_TYPE_ORDER].reverse();

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
    generateLabels: chart => {
      const labels = chart.data.datasets.map((ds, i) => ({
        text: ds.label,
        fillStyle: ds.timesheetColor || ds.backgroundColor,
        strokeStyle: ds.timesheetColor || ds.borderColor || ds.backgroundColor,
        lineWidth: 0,
        hidden: !chart.isDatasetVisible(i),
        datasetIndex: i,
      }));

      // Keep legend displayed in the requested top-to-bottom business order,
      // even though datasets are reversed for correct stacked-bar drawing.
      return labels.sort((a, b) => (
        TIMESHEET_WORK_TYPE_ORDER.indexOf(a.text) -
        TIMESHEET_WORK_TYPE_ORDER.indexOf(b.text)
      ));
    },
  };
}

function orderedPresentWorkTypes(rows) {
  const present = new Set((rows || []).map(r => r.workType).filter(Boolean));
  return TIMESHEET_WORK_TYPE_STACK_ORDER.filter(type => present.has(type));
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

function isNonAssignablePerson(value) {
  return NON_ASSIGNABLE_PERSON_KEYS.has(compactPersonKey(value));
}

function getActiveEmployees() {
  return (S.employees || []).filter(e => e.active !== 0 && !isNonAssignablePerson(e.name));
}

function getActiveEmployeeIdSet() {
  return new Set(getActiveEmployees().map(e => e.id));
}

function getInactiveEmployeeKeySet() {
  const keys = new Set(NON_ASSIGNABLE_PERSON_KEYS);

  for (const e of (S.employees || [])) {
    if (e.active === 0) {
      const key = compactPersonKey(e.name);
      if (key) keys.add(key);
    }
  }

  return keys;
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
