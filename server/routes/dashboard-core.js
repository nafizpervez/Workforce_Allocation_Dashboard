const express = require('express');
const { getAppDb } = require('../database');
const { calcDealStatuses } = require('../services/project-analytics');
const { fiscalMonths, getRunningProjectCutoffDate } = require('../services/fiscal');
const { safeNum } = require('../services/values');
const {
  assignmentSlotKey,
  filterEffectiveAssignments,
  getUnavailableSlotSet,
  isUnavailableProjectName,
} = require('../services/availability');
const router = express.Router();
const db = getAppDb();

const FY_WEEK_COUNT = 48;
const MONTH_WEEK_COUNT = 4;

function getActiveEmployeeRows() {
  return db.prepare(`
    SELECT id, name, dept
    FROM employees
    WHERE COALESCE(active, 1) = 1
    ORDER BY id
  `).all();
}

function getAssignmentRows() {
  return db.prepare(`
    SELECT a.*, p.name AS project_name
    FROM assignments a
    JOIN projects p ON p.id = a.project_id
  `).all();
}

function isFiscalAssignment(assignment, fiscalYear) {
  return (
    (Number(assignment.year) === Number(fiscalYear) && Number(assignment.month) >= 4) ||
    (Number(assignment.year) === Number(fiscalYear) + 1 && Number(assignment.month) <= 3)
  );
}

function periodMetrics(rawAssignments, employees, totalWeeks) {
  const unavailableSlots = getUnavailableSlotSet(rawAssignments);
  const effectiveAssignments = filterEffectiveAssignments(rawAssignments);
  const weightedByEmployee = new Map();
  const unavailableCountByEmployee = new Map();

  for (const slot of unavailableSlots) {
    const employeeId = Number(String(slot).split('|')[0]);
    unavailableCountByEmployee.set(
      employeeId,
      (unavailableCountByEmployee.get(employeeId) || 0) + 1,
    );
  }

  for (const assignment of effectiveAssignments) {
    const employeeId = Number(assignment.employee_id);
    weightedByEmployee.set(
      employeeId,
      (weightedByEmployee.get(employeeId) || 0) +
        ((Number(assignment.percentage) || 0) / 100),
    );
  }

  const utilizationRows = employees.map(employee => {
    const unavailableWeeks = unavailableCountByEmployee.get(Number(employee.id)) || 0;
    const availableWeeks = Math.max(0, totalWeeks - unavailableWeeks);
    const weightedSlots = weightedByEmployee.get(Number(employee.id)) || 0;

    return {
      ...employee,
      availableWeeks,
      utilization: availableWeeks
        ? +Math.min((weightedSlots / availableWeeks) * 100, 100).toFixed(1)
        : null,
    };
  });

  const availableRows = utilizationRows.filter(row => row.availableWeeks > 0);
  const avgUtilization = availableRows.length
    ? availableRows.reduce((sum, row) => sum + row.utilization, 0) / availableRows.length
    : 0;

  return {
    unavailableSlots,
    effectiveAssignments,
    utilizationRows,
    availableRows,
    avgUtilization,
  };
}

router.get('/api/dashboard/stats', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const employees = getActiveEmployeeRows();
  const assignments = getAssignmentRows();
  const fiscalRaw = assignments.filter(assignment => isFiscalAssignment(assignment, fy));
  const fiscalMetrics = periodMetrics(fiscalRaw, employees, FY_WEEK_COUNT);

  const activeEmployees = employees.length;
  const analyticProjects = db.prepare(`SELECT id, name, stage, progress FROM projects`).all()
    .filter(project => !isUnavailableProjectName(project.name));
  const activeProjects = analyticProjects.filter(project => project.stage !== 'Closed Won').length;
  const assignedProjects = new Set(
    fiscalMetrics.effectiveAssignments.map(assignment => Number(assignment.project_id)),
  ).size;
  const avgUtil = fiscalMetrics.avgUtilization;

  const psRows = fiscalMetrics.availableRows.filter(row => row.dept === 'Professional Services');
  const psCount = psRows.length || 1;
  const productivity = psCount > 0 ? +(avgUtil / psCount).toFixed(2) : 0;
  const onTime = analyticProjects.length
    ? +(100 * analyticProjects.filter(project => Number(project.progress) >= 80).length / analyticProjects.length).toFixed(1)
    : 0;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const prevM = curM === 1 ? 12 : curM - 1;
  const prevY = curM === 1 ? curY - 1 : curY;
  const curMStr = String(curM).padStart(2, '0');

  const currentRaw = assignments.filter(a => Number(a.year) === curY && Number(a.month) === curM);
  const previousRaw = assignments.filter(a => Number(a.year) === prevY && Number(a.month) === prevM);
  const currentMetrics = periodMetrics(currentRaw, employees, MONTH_WEEK_COUNT);
  const previousMetrics = periodMetrics(previousRaw, employees, MONTH_WEEK_COUNT);

  const asgCur = new Set(currentMetrics.effectiveAssignments.map(a => Number(a.project_id))).size;
  const asgPrev = new Set(previousMetrics.effectiveAssignments.map(a => Number(a.project_id))).size;
  const asgDelta = asgCur - asgPrev;
  const utilDelta = +(currentMetrics.avgUtilization - previousMetrics.avgUtilization).toFixed(1);

  const newEmps = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;
  const newProjs = db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;
  const prodDelta = psCount > 0 ? +(utilDelta / psCount).toFixed(2) : 0;
  const priorOnTime = analyticProjects.length
    ? +(100 * analyticProjects.filter(project => Number(project.progress) >= 75).length / analyticProjects.length).toFixed(1)
    : 0;
  const onTimeDelta = +(onTime - priorOnTime).toFixed(1);

  const sign = n => n >= 0 ? `+${n}` : `${n}`;
  const signF = n => n >= 0 ? `+${n}%` : `${n}%`;

  res.json({
    active_employees: activeEmployees,
    active_projects: activeProjects,
    avg_utilization: +avgUtil.toFixed(1),
    assigned_projects: assignedProjects,
    productivity,
    ps_count: psCount,
    on_time_pct: onTime,
    trends: {
      employees: { value: newEmps > 0 ? `+${newEmps} this month` : 'No change', up: newEmps >= 0 },
      projects: { value: newProjs > 0 ? `+${newProjs} new` : 'No new this month', up: newProjs >= 0 },
      utilization: { value: `${signF(utilDelta)} vs last month`, up: utilDelta >= 0 },
      assigned_projects: { value: `${sign(asgDelta)} vs last month`, up: asgDelta >= 0 },
      productivity: { value: `${sign(prodDelta)} vs last month`, up: prodDelta >= 0 },
      on_time: { value: `${signF(onTimeDelta)} vs last month`, up: onTimeDelta >= 0 },
    },
  });
});

router.get('/api/dashboard/trends', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const employees = getActiveEmployeeRows();
  const assignments = getAssignmentRows();
  const data = fiscalMonths(fy).map(({ year, month }) => {
    const raw = assignments.filter(assignment =>
      Number(assignment.year) === Number(year) &&
      Number(assignment.month) === Number(month),
    );
    const metrics = periodMetrics(raw, employees, MONTH_WEEK_COUNT);
    const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });

    return {
      label,
      year,
      month,
      assignments: metrics.effectiveAssignments.length,
      utilization: +metrics.avgUtilization.toFixed(1),
    };
  });

  res.json(data);
});

router.get('/api/dashboard/workload', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const employees = getActiveEmployeeRows();
  const employeeById = new Map(employees.map(employee => [Number(employee.id), employee]));
  const fiscalRaw = getAssignmentRows().filter(assignment => isFiscalAssignment(assignment, fy));
  const effectiveAssignments = filterEffectiveAssignments(fiscalRaw);
  const counts = new Map();

  for (const assignment of effectiveAssignments) {
    const employee = employeeById.get(Number(assignment.employee_id));
    if (!employee) continue;
    counts.set(employee.dept, (counts.get(employee.dept) || 0) + 1);
  }

  const departments = [...new Set(employees.map(employee => employee.dept))];
  res.json(departments
    .map(dept => ({ dept, assignment_count: counts.get(dept) || 0 }))
    .sort((a, b) => b.assignment_count - a.assignment_count));
});

router.get('/api/dashboard/utilization', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const employees = getActiveEmployeeRows();
  const fiscalRaw = getAssignmentRows().filter(assignment => isFiscalAssignment(assignment, fy));
  const metrics = periodMetrics(fiscalRaw, employees, FY_WEEK_COUNT);
  const cleaned = metrics.availableRows
    .map(row => ({
      id: row.id,
      name: row.name,
      dept: row.dept,
      utilization: row.utilization,
    }))
    .sort((a, b) => a.utilization - b.utilization);

  res.json({
    all: cleaned,
    top_available: cleaned.slice(0, 5),
    high_workload: [...cleaned].reverse().slice(0, 5),
  });
});

router.get('/api/dashboard/pipeline', (_, res) => {
  const rows = db.prepare(`SELECT stage,COUNT(*) AS count,SUM(budget) AS total_budget,AVG(progress) AS avg_progress FROM projects GROUP BY stage`).all();
  const order = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won'];
  rows.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  res.json(rows);
});

/* Running Projects: All Closed Won projects from Jan 1 two years before current year */
router.get('/api/dashboard/deadlines', (_, res) => {
  const today = new Date();
  const runningProjectCutoff = getRunningProjectCutoffDate();

  const rows = db.prepare(`
    SELECT id, code, name, end_date, project_closing_date, product_name, product_family,
           progress, priority, opp_amount, product_amount, account_name, stage, color, opportunity_owner
      FROM projects
     WHERE stage = 'Closed Won'
       AND end_date >= ?
       AND UPPER(COALESCE(product_name,'')) NOT LIKE '%PERSONAL USE%'
       AND UPPER(COALESCE(product_name,'')) NOT LIKE '%STUDENT USE%'
     ORDER BY CASE
       WHEN project_closing_date IS NOT NULL AND project_closing_date != '' THEN project_closing_date
       ELSE COALESCE(end_date, '9999-12-31')
     END ASC
  `).all(runningProjectCutoff);

  const allProjects = db.prepare('SELECT id, code, name, account_name, client, end_date, fiscal_period, stage, product_name FROM projects').all();
  const statusMap = calcDealStatuses(allProjects);

  const enriched = rows.map(r => {
    const closingDate = r.project_closing_date || r.end_date;
    const days = closingDate ? Math.round((new Date(closingDate) - today) / 864e5) : null;
    const status = days === null ? '—' : days < 0 ? 'Overdue' : days < 14 ? 'Due Soon' : 'On Track';
    return { ...r, closing_date: closingDate, days, status, deal_status: statusMap[r.id] || 'NEW LOGO' };
  });
  res.json(enriched);
});



module.exports = router;
