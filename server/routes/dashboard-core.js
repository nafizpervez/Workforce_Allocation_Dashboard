const express = require('express');
const { getAppDb } = require('../database');
const { calcDealStatuses } = require('../services/project-analytics');
const { FISCAL_WHERE, fiscalMonths, fiscalParams, getRunningProjectCutoffDate } = require('../services/fiscal');
const { safeNum } = require('../services/values');
const router = express.Router();
const db = getAppDb();

router.get('/api/dashboard/stats', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());

  const activeEmployees = db.prepare('SELECT COUNT(*) AS c FROM employees WHERE COALESCE(active,1)=1').get().c;
  const activeProjects = db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE stage != 'Closed Won'`).get().c;
  const assignedProjects = db.prepare(`SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE ${FISCAL_WHERE}`).get(...fiscalParams(fy)).c;

  // Avg utilization = average across active employees of (their weighted slots / 48 FY weeks * 100)
  const TOTAL_FY_WEEKS = 48;
  const utilRows = db.prepare(`
    SELECT COALESCE(SUM(a.percentage / 100.0), 0) AS weighted_slots
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id = e.id
        AND ((a.year = ? AND a.month >= 4) OR (a.year = ? AND a.month <= 3))
     WHERE COALESCE(e.active,1)=1
     GROUP BY e.id
  `).all(...fiscalParams(fy));
  const activeCount = utilRows.length || 1;
  const avgUtil = utilRows.reduce((s, r) => s + Math.min(r.weighted_slots / TOTAL_FY_WEEKS * 100, 100), 0) / activeCount;

  const psCount = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE dept='Professional Services' AND COALESCE(active,1)=1`).get().c || 1;
  const productivity = psCount > 0 ? +(avgUtil / psCount).toFixed(2) : 0;
  const onTime = db.prepare(`SELECT ROUND(100.0*SUM(CASE WHEN progress>=80 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS v FROM projects`).get().v || 0;

  const now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1;
  const prevM = curM === 1 ? 12 : curM - 1, prevY = curM === 1 ? curY - 1 : curY;
  const curMStr = String(curM).padStart(2, '0');

  const asgCur = db.prepare('SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE year=? AND month=?').get(curY, curM).c;
  const asgPrev = db.prepare('SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE year=? AND month=?').get(prevY, prevM).c;
  const asgDelta = asgCur - asgPrev;

  const utilCur = db.prepare('SELECT AVG(wt) AS u FROM (SELECT SUM(percentage) AS wt FROM assignments WHERE year=? AND month=? GROUP BY employee_id,week)').get(curY, curM).u || 0;
  const utilPrev = db.prepare('SELECT AVG(wt) AS u FROM (SELECT SUM(percentage) AS wt FROM assignments WHERE year=? AND month=? GROUP BY employee_id,week)').get(prevY, prevM).u || 0;
  const utilDelta = +(utilCur - utilPrev).toFixed(1);

  const newEmps = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;
  const newProjs = db.prepare(`SELECT COUNT(*) AS c FROM projects  WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;

  const prodDelta = psCount > 0 ? +(utilDelta / psCount).toFixed(2) : 0;
  const onTimeDelta = +(onTime - (db.prepare('SELECT ROUND(100.0*SUM(CASE WHEN progress>=75 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS v FROM projects').get().v || 0)).toFixed(1);

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
  const months = fiscalMonths(fy);
  const data = months.map(({ year, month }) => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE year=? AND month=?').get(year, month).c;
    const util = db.prepare('SELECT AVG(w) AS u FROM (SELECT SUM(percentage) AS w FROM assignments WHERE year=? AND month=? GROUP BY employee_id,week)').get(year, month).u || 0;
    const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
    return { label, year, month, assignments: count, utilization: +util.toFixed(1) };
  });
  res.json(data);
});

router.get('/api/dashboard/workload', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  res.json(db.prepare(`
    SELECT e.dept, COUNT(a.id) AS assignment_count
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id=e.id
        AND ((a.year=? AND a.month>=4) OR (a.year=? AND a.month<=3))
     WHERE COALESCE(e.active,1)=1 GROUP BY e.dept ORDER BY assignment_count DESC
  `).all(...fiscalParams(fy)));
});

router.get('/api/dashboard/utilization', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  // Utilization = sum(percentage/100 per slot) / TOTAL_FY_WEEKS * 100
  // TOTAL_FY_WEEKS = 48 (12 months × 4 weeks per month)
  const TOTAL_FY_WEEKS = 48;
  const rows = db.prepare(`
    SELECT e.id, e.name, e.dept,
           COALESCE(SUM(a.percentage / 100.0), 0) AS weighted_slots
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id = e.id
        AND ((a.year = ? AND a.month >= 4) OR (a.year = ? AND a.month <= 3))
     WHERE COALESCE(e.active,1)=1
     GROUP BY e.id ORDER BY weighted_slots ASC
  `).all(...fiscalParams(fy));
  const cleaned = rows.map(r => ({
    id: r.id, name: r.name, dept: r.dept,
    utilization: +Math.min((r.weighted_slots / TOTAL_FY_WEEKS * 100), 100).toFixed(1)
  }));
  res.json({ all: cleaned, top_available: cleaned.slice(0, 5), high_workload: [...cleaned].reverse().slice(0, 5) });
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
