const express = require('express');
const { getAppDb } = require('../database');
const {
  RUNNING_CLOSED_WON_START_DATE,
  calcDealStatuses,
  isProfessionalServiceRunningProject,
  isPSOnlyProject,
} = require('../services/project-analytics');
const { fiscalMonths, getFiscalYear } = require('../services/fiscal');
const { safeNum } = require('../services/values');
const { withCanonicalDesignation } = require('../services/designations');
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
    SELECT id, employee_code, name, dept, designation, email
    FROM employees
    WHERE COALESCE(active, 1) = 1
    ORDER BY id
  `).all().map(withCanonicalDesignation);
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

function parseProjectDate(dateText) {
  const value = String(dateText || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addUtcMonths(date, monthCount) {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + Number(monthCount || 0));
  return result;
}

function normalizeAllocationProjectName(value) {
  return String(value || '')
    .replace(/[‐‑‒–—−_]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyAllocationProject(projectName) {
  const normalizedName = normalizeAllocationProjectName(projectName);
  if (isUnavailableProjectName(normalizedName)) return 'unavailable';
  if (/intrasource/i.test(normalizedName)) return 'intrasourcing';
  if (/pre[\s-]*sale/i.test(normalizedName)) return 'preSale';
  if (/training[\s-]*delivery/i.test(normalizedName)) return 'training';
  if (/skill[\s-]*development/i.test(normalizedName)) return 'skillDevelopment';
  if (/general[\s-]*admin/i.test(normalizedName)) return 'generalAdmin';
  return 'local';
}

function getFiscalAllocationCategorySummary(rawAssignments, employees, totalWeeks) {
  const unavailableSlots = getUnavailableSlotSet(rawAssignments);
  const effectiveAssignments = filterEffectiveAssignments(rawAssignments);
  const unavailableCountByEmployee = new Map();
  const percentagesByEmployee = new Map();
  const categoryKeys = [
    'intrasourcing',
    'local',
    'preSale',
    'training',
    'skillDevelopment',
    'generalAdmin',
  ];

  for (const slot of unavailableSlots) {
    const employeeId = Number(String(slot).split('|')[0]);
    unavailableCountByEmployee.set(
      employeeId,
      (unavailableCountByEmployee.get(employeeId) || 0) + 1,
    );
  }

  for (const assignment of effectiveAssignments) {
    const employeeId = Number(assignment.employee_id);
    const category = classifyAllocationProject(assignment.project_name);
    if (!categoryKeys.includes(category)) continue;

    if (!percentagesByEmployee.has(employeeId)) {
      percentagesByEmployee.set(
        employeeId,
        Object.fromEntries(categoryKeys.map(key => [key, 0])),
      );
    }

    percentagesByEmployee.get(employeeId)[category] +=
      Number(assignment.percentage) || 0;
  }

  const availableRows = employees.map(employee => {
    const employeeId = Number(employee.id);
    const unavailableWeeks = unavailableCountByEmployee.get(employeeId) || 0;
    const availableWeeks = Math.max(0, totalWeeks - unavailableWeeks);
    const percentageTotals = percentagesByEmployee.get(employeeId) ||
      Object.fromEntries(categoryKeys.map(key => [key, 0]));

    return {
      availableWeeks,
      allocation: Object.fromEntries(categoryKeys.map(key => [
        key,
        availableWeeks ? percentageTotals[key] / availableWeeks : 0,
      ])),
    };
  }).filter(row => row.availableWeeks > 0);

  const averageCategory = category => availableRows.length
    ? availableRows.reduce(
      (total, row) => total + row.allocation[category],
      0,
    ) / availableRows.length
    : 0;

  const intrasourcing = averageCategory('intrasourcing');
  const local = averageCategory('local');
  const preSale = averageCategory('preSale');
  const training = averageCategory('training');
  const billable = intrasourcing + local;
  const project = intrasourcing + local + preSale + training;

  return {
    intrasourcing: +intrasourcing.toFixed(1),
    billable: +billable.toFixed(1),
    project: +project.toFixed(1),
  };
}

function getFiscalAllocationResourceDetails(rawAssignments, employees, totalWeeks) {
  const unavailableSlots = getUnavailableSlotSet(rawAssignments);
  const effectiveAssignments = filterEffectiveAssignments(rawAssignments);
  const unavailableCountByEmployee = new Map();
  const categoryKeys = [
    'intrasourcing',
    'local',
    'preSale',
    'training',
    'skillDevelopment',
    'generalAdmin',
  ];
  const percentagesByEmployee = new Map();

  for (const slot of unavailableSlots) {
    const employeeId = Number(String(slot).split('|')[0]);
    unavailableCountByEmployee.set(
      employeeId,
      (unavailableCountByEmployee.get(employeeId) || 0) + 1,
    );
  }

  for (const assignment of effectiveAssignments) {
    const employeeId = Number(assignment.employee_id);
    const category = classifyAllocationProject(assignment.project_name);
    if (!categoryKeys.includes(category)) continue;

    if (!percentagesByEmployee.has(employeeId)) {
      percentagesByEmployee.set(
        employeeId,
        Object.fromEntries(categoryKeys.map(key => [key, 0])),
      );
    }
    percentagesByEmployee.get(employeeId)[category] +=
      Number(assignment.percentage) || 0;
  }

  return employees.map(employee => {
    const employeeId = Number(employee.id);
    const unavailableWeeks = unavailableCountByEmployee.get(employeeId) || 0;
    const availableWeeks = Math.max(0, totalWeeks - unavailableWeeks);
    const totals = percentagesByEmployee.get(employeeId) ||
      Object.fromEntries(categoryKeys.map(key => [key, 0]));
    const allocation = Object.fromEntries(categoryKeys.map(key => [
      key,
      availableWeeks ? +(totals[key] / availableWeeks).toFixed(2) : 0,
    ]));

    return {
      id: employee.id,
      employee_code: employee.employee_code || '',
      name: employee.name,
      dept: employee.dept || '',
      designation: employee.designation || '',
      email: employee.email || '',
      available_weeks: availableWeeks,
      unavailable_weeks: unavailableWeeks,
      allocation,
      metrics: {
        intrasourcing: allocation.intrasourcing,
        billable: +(allocation.intrasourcing + allocation.local).toFixed(2),
        project: +(allocation.intrasourcing + allocation.local + allocation.preSale + allocation.training).toFixed(2),
      },
    };
  }).filter(row => row.available_weeks > 0);
}

function isOpenProject(project) {
  return String(project?.stage || '').trim().toLowerCase() !== 'closed won';
}

function isProfessionalServicesProductFamily(project) {
  return String(project?.product_family || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase() === 'professional services';
}

function matchesProjectPortfolioMetric(project, metric) {
  if (metric === 'running') return isProfessionalServiceRunningProject(project);
  if (metric === 'weighted') {
    return isOpenProject(project) && Number(project?.probability) >= 75;
  }
  if (metric === 'prospect') {
    return (
      isOpenProject(project) &&
      Number(project?.probability) < 75 &&
      isProfessionalServicesProductFamily(project)
    );
  }
  return false;
}

function getRunningProjectTiming(project, now = new Date()) {
  const closeWonDate = parseProjectDate(project?.end_date);
  if (!closeWonDate) return 'unclassified';

  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const sixMonthDeadline = addUtcMonths(closeWonDate, 6);
  return sixMonthDeadline < today ? 'delayed' : 'on-time';
}

function isRunningProjectInFiscalYear(project, fiscalYear) {
  if (fiscalYear === null || fiscalYear === undefined || fiscalYear === '') return true;
  const startYear = Math.trunc(Number(fiscalYear));
  if (!Number.isInteger(startYear)) return true;
  return getFiscalYear(project?.end_date) === startYear;
}

function isDateInFiscalYear(dateText, fiscalYear) {
  if (fiscalYear === null || fiscalYear === undefined || fiscalYear === '') return false;
  const startYear = Math.trunc(Number(fiscalYear));
  if (!Number.isInteger(startYear)) return false;
  return getFiscalYear(dateText) === startYear;
}

function getProfessionalServicesRevenueSummary(projects, fiscalYear) {
  const psProjects = (projects || []).filter(project => isPSOnlyProject(project));
  const realizationProjects = psProjects.filter(project => (
    Number(project?.progress) === 100 &&
    isDateInFiscalYear(project?.project_closing_date, fiscalYear)
  ));
  const securedProjects = psProjects.filter(project => (
    String(project?.stage || '').trim().toLowerCase() === 'closed won' &&
    isDateInFiscalYear(project?.end_date, fiscalYear)
  ));
  const sumProductAmount = rows => +rows.reduce(
    (total, project) => total + (Number(project?.product_amount) || 0),
    0,
  ).toFixed(2);

  return {
    realizationProjects,
    securedProjects,
    realizationRevenue: sumProductAmount(realizationProjects),
    securedRevenue: sumProductAmount(securedProjects),
  };
}

function getClosedWonProjectSummary(projects, now = new Date(), fiscalYear = null) {
  const runningProjects = projects.filter(project => (
    isProfessionalServiceRunningProject(project) &&
    isRunningProjectInFiscalYear(project, fiscalYear)
  ));
  const delayedProjects = runningProjects.filter(project => (
    getRunningProjectTiming(project, now) === 'delayed'
  )).length;
  const onTimeProjects = runningProjects.filter(project => (
    getRunningProjectTiming(project, now) === 'on-time'
  )).length;

  return {
    count: runningProjects.length,
    delayedProjects,
    onTimeProjects,
    revenue: +runningProjects
      .reduce((total, project) => total + (Number(project.product_amount) || 0), 0)
      .toFixed(2),
  };
}

function getOpenProjectProbabilitySummary(projects) {
  return {
    weightedProspects: projects.filter(project => (
      matchesProjectPortfolioMetric(project, 'weighted')
    )).length,
    prospects: projects.filter(project => (
      matchesProjectPortfolioMetric(project, 'prospect')
    )).length,
  };
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
  const fiscalAllocationSummary = getFiscalAllocationCategorySummary(
    fiscalRaw,
    employees,
    FY_WEEK_COUNT,
  );

  const activeEmployees = employees.length;
  const analyticProjects = db.prepare(`
    SELECT
      id,
      name,
      stage,
      progress,
      probability,
      end_date,
      project_closing_date,
      product_name,
      product_family,
      product_amount,
      opp_amount,
      budget
    FROM projects
  `).all().filter(project => !isUnavailableProjectName(project.name));
  const activeProjects = analyticProjects.filter(project => project.stage !== 'Closed Won').length;
  const runningProjectSummary = getClosedWonProjectSummary(analyticProjects, new Date(), fy);
  const professionalServicesRevenueSummary = getProfessionalServicesRevenueSummary(analyticProjects, fy);
  const openProjectProbabilitySummary = getOpenProjectProbabilitySummary(
    analyticProjects,
  );
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
    running_projects: runningProjectSummary.count,
    delayed_running_projects: runningProjectSummary.delayedProjects,
    on_time_running_projects: runningProjectSummary.onTimeProjects,
    running_project_revenue: runningProjectSummary.revenue,
    revenue_realization: professionalServicesRevenueSummary.realizationRevenue,
    revenue_secured: professionalServicesRevenueSummary.securedRevenue,
    revenue_realization_projects: professionalServicesRevenueSummary.realizationProjects.length,
    revenue_secured_projects: professionalServicesRevenueSummary.securedProjects.length,
    avg_utilization: +avgUtil.toFixed(1),
    avg_intrasourcing_utilization: fiscalAllocationSummary.intrasourcing,
    billable_utilization: fiscalAllocationSummary.billable,
    project_utilization: fiscalAllocationSummary.project,
    assigned_projects: assignedProjects,
    weighted_prospect_projects: openProjectProbabilitySummary.weightedProspects,
    prospect_projects: openProjectProbabilitySummary.prospects,
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

router.get('/api/dashboard/utilization-details', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const metric = String(req.query.metric || 'project').trim();
  const allowedMetrics = new Set(['intrasourcing', 'billable', 'project']);
  if (!allowedMetrics.has(metric)) {
    return res.status(400).json({ error: 'Unknown utilization metric.' });
  }

  const employees = getActiveEmployeeRows();
  const fiscalRaw = getAssignmentRows().filter(assignment => (
    isFiscalAssignment(assignment, fy)
  ));
  const resources = getFiscalAllocationResourceDetails(
    fiscalRaw,
    employees,
    FY_WEEK_COUNT,
  ).sort((a, b) => (
    Number(b.metrics[metric]) - Number(a.metrics[metric]) ||
    String(a.name).localeCompare(String(b.name))
  ));
  const average = resources.length
    ? resources.reduce((total, row) => total + Number(row.metrics[metric]), 0) / resources.length
    : 0;

  return res.json({
    metric,
    fiscal_year: fy,
    average: +average.toFixed(1),
    eligible_resources: resources.length,
    total_available_weeks: resources.reduce(
      (total, row) => total + Number(row.available_weeks),
      0,
    ),
    resources,
  });
});

router.get('/api/dashboard/project-portfolio-metrics', (req, res) => {
  const metric = String(req.query.metric || 'running').trim().toLowerCase();
  const fiscalYear = safeNum(req.query.fiscalYear, null);
  const allowedMetrics = new Set(['running', 'weighted', 'prospect']);
  if (!allowedMetrics.has(metric)) {
    return res.status(400).json({ error: 'Unknown project portfolio metric.' });
  }

  const rows = db.prepare(`
    SELECT
      id, code, name, account_name, client, end_date, project_closing_date,
      fiscal_period, product_name, product_family, progress, probability,
      priority, opp_amount, product_amount, stage, color, opportunity_owner
    FROM projects
  `).all().filter(project => (
    !isUnavailableProjectName(project.name) &&
    matchesProjectPortfolioMetric(project, metric) &&
    (metric !== 'running' || isRunningProjectInFiscalYear(project, fiscalYear))
  ));
  const allProjects = db.prepare(`
    SELECT id, code, name, account_name, client, end_date,
           fiscal_period, stage, product_name
    FROM projects
  `).all();
  const statusMap = calcDealStatuses(allProjects);
  const projects = rows.map(project => ({
    ...project,
    closing_date: project.project_closing_date || null,
    deal_status: statusMap[project.id] || 'NEW LOGO',
  })).sort((a, b) => (
    metric === 'running'
      ? String(b.end_date || '').localeCompare(String(a.end_date || ''))
      : Number(b.probability || 0) - Number(a.probability || 0) || Number(a.id) - Number(b.id)
  ));

  return res.json({ metric, count: projects.length, projects });
});

router.get('/api/dashboard/running-project-metrics', (req, res) => {
  const metric = String(req.query.metric || 'revenue').trim().toLowerCase();
  const fiscalYear = safeNum(req.query.fiscalYear, null);
  const allowedMetrics = new Set(['delayed', 'on-time', 'revenue']);

  if (!allowedMetrics.has(metric)) {
    return res.status(400).json({ error: 'Unknown running-project metric.' });
  }

  const metricRows = db.prepare(`
    SELECT
      id,
      code,
      name,
      account_name,
      client,
      end_date,
      project_closing_date,
      fiscal_period,
      product_name,
      product_family,
      progress,
      priority,
      opp_amount,
      product_amount,
      stage,
      color,
      opportunity_owner
    FROM projects
  `).all().filter(project => !isUnavailableProjectName(project.name));

  const allProjects = db.prepare(`
    SELECT id, code, name, account_name, client, end_date,
           fiscal_period, stage, product_name
    FROM projects
  `).all();
  const statusMap = calcDealStatuses(allProjects);
  const enrich = project => ({
    ...project,
    closing_date: project.project_closing_date || null,
    deal_status: statusMap[project.id] || 'NEW LOGO',
  });

  if (metric === 'revenue') {
    const summary = getProfessionalServicesRevenueSummary(metricRows, fiscalYear);
    const realizationProjects = summary.realizationProjects
      .map(enrich)
      .sort((a, b) => (
        String(b.project_closing_date || '').localeCompare(String(a.project_closing_date || '')) ||
        Number(b.id) - Number(a.id)
      ));
    const securedProjects = summary.securedProjects
      .map(enrich)
      .sort((a, b) => (
        String(b.end_date || '').localeCompare(String(a.end_date || '')) ||
        Number(b.id) - Number(a.id)
      ));

    return res.json({
      metric,
      fiscal_year: fiscalYear,
      revenue_realization_count: realizationProjects.length,
      revenue_realization_total: summary.realizationRevenue,
      revenue_realization_projects: realizationProjects,
      revenue_secured_count: securedProjects.length,
      revenue_secured_total: summary.securedRevenue,
      revenue_secured_projects: securedProjects,
    });
  }

  const rows = metricRows.filter(project => (
    isProfessionalServiceRunningProject(project) &&
    isRunningProjectInFiscalYear(project, fiscalYear)
  ));
  const filtered = rows.filter(project => getRunningProjectTiming(project) === metric);
  const projects = filtered
    .map(project => ({
      ...enrich(project),
      timing: getRunningProjectTiming(project),
    }))
    .sort((a, b) => (
      String(a.project_closing_date || a.end_date || '9999-12-31')
        .localeCompare(String(b.project_closing_date || b.end_date || '9999-12-31')) ||
      Number(a.id) - Number(b.id)
    ));

  return res.json({
    metric,
    count: projects.length,
    total_product_amount: +projects.reduce(
      (total, project) => total + (Number(project.product_amount) || 0),
      0,
    ).toFixed(2),
    projects,
  });
});

/* Running Projects: Closed Won on or after March 1, 2025 */
router.get('/api/dashboard/deadlines', (_, res) => {
  const today = new Date();
  const runningProjectCutoff = RUNNING_CLOSED_WON_START_DATE;

  const rows = db.prepare(`
    SELECT id, code, name, end_date, project_closing_date, product_name, product_family,
           progress, priority, opp_amount, product_amount, account_name, stage, color, opportunity_owner
      FROM projects
     WHERE stage = 'Closed Won'
       AND COALESCE(progress, 0) < 100
       AND end_date >= ?
       AND UPPER(COALESCE(product_name,'')) NOT LIKE '%PERSONAL USE%'
       AND UPPER(COALESCE(product_name,'')) NOT LIKE '%STUDENT USE%'
     ORDER BY CASE
       WHEN project_closing_date IS NOT NULL AND project_closing_date != '' THEN project_closing_date
       ELSE COALESCE(end_date, '9999-12-31')
     END ASC
  `).all(runningProjectCutoff).filter(isProfessionalServiceRunningProject);

  const allProjects = db.prepare('SELECT id, code, name, account_name, client, end_date, fiscal_period, stage, product_name FROM projects').all();
  const statusMap = calcDealStatuses(allProjects);

  const enriched = rows.map(r => {
    const closingDate = r.project_closing_date || null;
    const days = closingDate ? Math.round((new Date(closingDate) - today) / 864e5) : null;
    const status = days === null ? '' : days < 0 ? 'PS Work Begins' : days < 14 ? 'Due Soon' : 'On Track';
    return { ...r, closing_date: closingDate, days, status, deal_status: statusMap[r.id] || 'NEW LOGO' };
  });
  res.json(enriched);
});



module.exports = router;
