/* Workforce Allocation Dashboard — core/state.js */

/* ================================================================
   Workforce Allocation Dashboard — app.js
   ================================================================ */

/* ================================================================ STATE */
const S = {
  psTypeData: [],
  fiscalYear: 2026,
  employees: [], projects: [], assignments: [], revenueRates: [],
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
const SERVICE_PIPELINE_FISCAL_YEAR = 2027;
const SERVICE_PIPELINE_STAGES = ['Negotiate', 'Presentation - Solve', 'Proposal', 'Prospect', 'Qualify', 'Validate'];
const SERVICE_PIPELINE_STAGE_SET = new Set(SERVICE_PIPELINE_STAGES);
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PCOLORS = [
  '#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1',
  '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308',
  '#22C55E', '#3B82F6', '#D946EF', '#EF4444', '#F97316', '#65A30D',
  '#0891B2', '#7C3AED', '#DB2777', '#0D9488', '#4F46E5', '#CA8A04',
  '#FDE68A', '#FEF3C7', '#FCD34D', '#FBBF24', '#FCA5A5', '#FECACA',
  '#FDBA74', '#FED7AA', '#BBF7D0', '#86EFAC', '#A7F3D0', '#5EEAD4',
  '#BAE6FD', '#7DD3FC', '#C4B5FD', '#DDD6FE', '#FBCFE8', '#F9A8D4',
  '#E9D5FF', '#D8B4FE', '#BFDBFE', '#93C5FD', '#D9F99D', '#BEF264',
  '#E5E7EB', '#CBD5E1', '#94A3B8', '#64748B'
];
const PROJECT_PEOPLE_CHART_DISPLAY_MAX = 150;
const PROJECT_PEOPLE_CHART_MIN_VISIBLE = 2;
const DEPT_COLORS = { 'Solution': '#2563EB', 'Professional Services': '#8B5CF6', 'Finance': '#14B8A6', 'Sales': '#F59E0B', 'Operations': '#10B981', 'Management': '#EC4899' };
const STAGE_COLOR = { 'Prospect': '#6B7280', 'Qualify': '#0EA5E9', 'Validate': '#8B5CF6', 'Presentation - Solve': '#EC4899', 'Proposal': '#F59E0B', 'Negotiate': '#F97316', 'Closed Won': '#10B981', 'Closed Lost': '#DC2626' };
const STAGE_PILL = { 'Prospect': 'bg-gray-100 text-gray-700', 'Qualify': 'bg-sky-100 text-sky-700', 'Validate': 'bg-purple-100 text-purple-700', 'Presentation - Solve': 'bg-pink-100 text-pink-700', 'Proposal': 'bg-amber-100 text-amber-700', 'Negotiate': 'bg-orange-100 text-orange-700', 'Closed Won': 'bg-green-100 text-green-700', 'Closed Lost': 'bg-red-100 text-red-700' };
const PRIORITY_COLOR = { Critical: '#DC2626', High: '#D97706', Medium: '#2563EB', Low: '#6B7280' };
const PRIORITY_PILL = { Critical: 'bg-red-100 text-red-700', High: 'bg-orange-100 text-orange-700', Medium: 'bg-blue-100 text-blue-700', Low: 'bg-gray-100 text-gray-700' };


// Employees/managers listed here are kept in the team master list,
// but excluded from assignment matrix rows, assignment charts, insights,
// and uploaded Time Sheet summary charts.
const NON_ASSIGNABLE_PERSON_KEYS = new Set([
  'debashishbhowmick',
]);

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

function matrixSlotDayCount(year, month, week) {
  const y = Number(year);
  const m = Number(month);
  const w = Number(week);

  if (!y || !m || !w) return 0;

  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const startDay = ((w - 1) * 7) + 1;
  const endDay = w >= 4 ? lastDayOfMonth : Math.min(w * 7, lastDayOfMonth);

  return Math.max(0, endDay - startDay + 1);
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

function getFiscalYearFromFiscalPeriod(period) {
  const match = String(period || '').trim().toUpperCase().match(/^Q[1-4][\s-]*(\d{4})$/);
  return match ? Number(match[1]) : null;
}

function isServicePipelineProject(p) {
  return (
    p &&
    SERVICE_PIPELINE_STAGE_SET.has(String(p.stage || '').trim()) &&
    getFiscalYearFromFiscalPeriod(p.fiscal_period) === SERVICE_PIPELINE_FISCAL_YEAR
  );
}

function getServicePipelineBaseProjects() {
  return (S.projects || []).filter(isServicePipelineProject);
}

function applyPipelineFilters(list) {
  const q = (S.pipelineSearch || '').toLowerCase().trim();
  return list.filter(p => {
    if (!isServicePipelineProject(p)) return false;
    if (S.pipelineDealStatusFilt && p.deal_status !== S.pipelineDealStatusFilt) return false;
    if (S.pipelineStageFilt && p.stage !== S.pipelineStageFilt) return false;
    if (!getAmountOk(p.opp_amount, S.pipelineAmountFilt)) return false;
    if (!matchPipelineCloseDateFilter(p.end_date, S.pipelineCloseFilt)) return false;
    if (!matchDateFilter(p.project_closing_date, S.pipelineProjCloseFilt)) return false;
    if (S.pipelineProdFamilyFilt && p.product_family !== S.pipelineProdFamilyFilt) return false;
    if (S.pipelineProductTypeFilt && !sameProductType(p.product_name, S.pipelineProductTypeFilt)) return false;
    if (q &&
      !(p.name || '').toLowerCase().includes(q) &&
      !(p.code || '').toLowerCase().includes(q) &&
      !(p.account_name || '').toLowerCase().includes(q) &&
      !(p.client || '').toLowerCase().includes(q) &&
      !(p.product_name || '').toLowerCase().includes(q) &&
      !(p.fiscal_period || '').toLowerCase().includes(q)
    ) return false;
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

