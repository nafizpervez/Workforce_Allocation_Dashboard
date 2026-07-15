/* Workforce Allocation Dashboard — timesheets/planned-actual-model.js */

const PLANNED_ACTUAL_RESOURCE_COLORS = [
  '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2',
  '#DC2626', '#4F46E5', '#65A30D', '#C2410C', '#0F766E', '#9333EA',
  '#0369A1', '#BE123C', '#A16207', '#15803D', '#6D28D9', '#0E7490',
];

function normalizePlannedActualText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plannedActualResourceColor(resourceKey) {
  const text = String(resourceKey || 'unassigned');
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  return PLANNED_ACTUAL_RESOURCE_COLORS[
    Math.abs(hash) % PLANNED_ACTUAL_RESOURCE_COLORS.length
  ];
}

function plannedActualColorWithAlpha(hex, alpha) {
  const value = String(hex || '').replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map(ch => ch + ch).join('')
    : value.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(normalized, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseTimesheetFiscalMonth(label, fiscalYear = S.fiscalYear) {
  const value = String(label || '').trim();
  const match = value.match(/^([A-Za-z]{3,9})[\s\-/]*(\d{2,4})?/);

  if (!match) return null;

  const monthName = match[1].slice(0, 3).toLowerCase();
  const month = MN.findIndex(item => item.toLowerCase() === monthName) + 1;

  if (!month) return null;

  let year = match[2] ? Number(match[2]) : null;
  if (year !== null && year < 100) year += 2000;
  if (year === null) year = month >= 4 ? fiscalYear : fiscalYear + 1;

  return { year, month };
}

function isPlannedActualFiscalMonth(label, fiscalYear = S.fiscalYear) {
  const parsed = parseTimesheetFiscalMonth(label, fiscalYear);
  if (!parsed) return false;

  return (
    (parsed.year === fiscalYear && parsed.month >= 4) ||
    (parsed.year === fiscalYear + 1 && parsed.month <= 3)
  );
}

function assignmentIsInFiscalYear(assignment, fiscalYear = S.fiscalYear) {
  const year = Number(assignment?.year);
  const month = Number(assignment?.month);

  return (
    (year === fiscalYear && month >= 4) ||
    (year === fiscalYear + 1 && month <= 3)
  );
}

function plannedActualMonthKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function plannedActualProjectLabel(project) {
  const code = String(project?.code || '').trim();
  const name = String(project?.name || '').trim();
  return code && name ? `${code} — ${name}` : (name || code || 'Unnamed project');
}

function buildPlannedActualProjectResolver(projects) {
  const records = (projects || []).map(project => {
    const code = normalizePlannedActualText(project.code);
    const name = normalizePlannedActualText(project.name);
    const full = normalizePlannedActualText(plannedActualProjectLabel(project));

    return {
      project,
      key: `project:${project.id}`,
      code,
      name,
      full,
      label: plannedActualProjectLabel(project),
    };
  });

  const exact = new Map();
  for (const record of records) {
    for (const key of [record.code, record.name, record.full]) {
      if (key && !exact.has(key)) exact.set(key, record);
    }
  }

  return value => {
    const raw = String(value || '').trim();
    const normalized = normalizePlannedActualText(raw);

    if (!normalized) return null;
    if (exact.has(normalized)) return exact.get(normalized);

    const codeMatch = records.find(record => (
      record.code &&
      record.code.length >= 4 &&
      (` ${normalized} `).includes(` ${record.code} `)
    ));
    if (codeMatch) return codeMatch;

    const nameMatch = records.find(record => (
      record.name &&
      record.name.length >= 6 &&
      (normalized.includes(record.name) || record.name.includes(normalized))
    ));
    if (nameMatch) return nameMatch;

    return {
      project: null,
      key: `timesheet:${normalized}`,
      code: '',
      name: normalized,
      full: normalized,
      label: raw || 'Unspecified project',
    };
  };
}

function addPlannedActualHours(map, resourceKey, resourceName, hours) {
  const numericHours = Number(hours) || 0;
  if (!resourceKey || numericHours <= 0) return;

  if (!map.has(resourceKey)) {
    map.set(resourceKey, {
      key: resourceKey,
      name: resourceName || 'Unknown resource',
      hours: 0,
    });
  }

  map.get(resourceKey).hours += numericHours;
}

function addPlannedActualMonthHours(map, year, month, hours) {
  const numericHours = Number(hours) || 0;
  if (numericHours <= 0) return;

  const key = plannedActualMonthKey(year, month);
  map.set(key, (map.get(key) || 0) + numericHours);
}

function getOrCreatePlannedActualProject(projectMap, key, label, project = null) {
  if (!projectMap.has(key)) {
    projectMap.set(key, {
      key,
      project,
      label: label || 'Unnamed project',
      plannedByResource: new Map(),
      actualByResource: new Map(),
      plannedByMonth: new Map(),
      actualByMonth: new Map(),
      plannedHours: 0,
      actualHours: 0,
    });
  }

  return projectMap.get(key);
}

function buildPlannedActualResourceChanges(plannedResources, actualResources) {
  const plannedByKey = new Map(plannedResources.map(item => [item.key, item]));
  const actualByKey = new Map(actualResources.map(item => [item.key, item]));
  const keys = new Set([...plannedByKey.keys(), ...actualByKey.keys()]);

  return [...keys].map(key => {
    const planned = plannedByKey.get(key);
    const actual = actualByKey.get(key);
    const plannedHours = planned?.hours || 0;
    const actualHours = actual?.hours || 0;

    return {
      key,
      name: planned?.name || actual?.name || 'Unknown resource',
      plannedHours,
      actualHours,
      varianceHours: +(actualHours - plannedHours).toFixed(2),
      status: planned && actual ? 'retained' : planned ? 'removed' : 'added',
    };
  }).sort((a, b) => (
    Math.max(b.plannedHours, b.actualHours) - Math.max(a.plannedHours, a.actualHours) ||
    a.name.localeCompare(b.name)
  ));
}

function buildPlannedActualEffortData() {
  const fiscalYear = S.fiscalYear;
  const fiscalMonthList = fiscalMonths(fiscalYear);
  const projectsById = new Map((S.projects || []).map(project => [Number(project.id), project]));
  const employeesById = new Map((S.employees || []).map(employee => [Number(employee.id), employee]));
  const employeeByName = new Map();
  const projectMap = new Map();
  const resolveProject = buildPlannedActualProjectResolver(S.projects || []);

  for (const employee of S.employees || []) {
    const key = normalizePersonName(employee.name);
    if (key && !employeeByName.has(key)) employeeByName.set(key, employee);
  }

  for (const assignment of S.assignments || []) {
    if (!assignmentIsInFiscalYear(assignment, fiscalYear)) continue;

    const project = projectsById.get(Number(assignment.project_id));
    const employee = employeesById.get(Number(assignment.employee_id));
    if (!project || !employee || employee.active === 0 || isNonAssignablePerson(employee.name)) continue;

    const percentage = Math.max(0, Number(assignment.percentage) || 0);
    const hours = 40 * (percentage / 100);
    if (hours <= 0) continue;

    const projectKey = `project:${project.id}`;
    const projectEntry = getOrCreatePlannedActualProject(
      projectMap,
      projectKey,
      plannedActualProjectLabel(project),
      project
    );
    const resourceKey = `employee:${employee.id}`;

    addPlannedActualHours(projectEntry.plannedByResource, resourceKey, employee.name, hours);
    addPlannedActualMonthHours(
      projectEntry.plannedByMonth,
      assignment.year,
      assignment.month,
      hours
    );
    projectEntry.plannedHours += hours;
  }

  for (const row of getVisibleTimesheetRows()) {
    const parsedMonth = parseTimesheetFiscalMonth(row.month, fiscalYear);
    if (!parsedMonth || !isPlannedActualFiscalMonth(row.month, fiscalYear)) continue;

    const hours = Math.max(0, Number(row.qty) || 0);
    if (hours <= 0) continue;

    const resolvedProject = resolveProject(row.projectName || '(No project name)');
    if (!resolvedProject) continue;

    const projectEntry = getOrCreatePlannedActualProject(
      projectMap,
      resolvedProject.key,
      resolvedProject.label,
      resolvedProject.project
    );
    const normalizedWorker = normalizePersonName(row.worker);
    const matchedEmployee = employeeByName.get(normalizedWorker);
    const resourceKey = matchedEmployee
      ? `employee:${matchedEmployee.id}`
      : `timesheet-worker:${normalizedWorker || 'unknown'}`;
    const resourceName = matchedEmployee?.name || row.worker || 'Unknown resource';

    addPlannedActualHours(projectEntry.actualByResource, resourceKey, resourceName, hours);
    addPlannedActualMonthHours(
      projectEntry.actualByMonth,
      parsedMonth.year,
      parsedMonth.month,
      hours
    );
    projectEntry.actualHours += hours;
  }

  const projects = [...projectMap.values()].map(entry => {
    const plannedResources = [...entry.plannedByResource.values()]
      .map(resource => ({ ...resource, hours: +resource.hours.toFixed(2) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
    const actualResources = [...entry.actualByResource.values()]
      .map(resource => ({ ...resource, hours: +resource.hours.toFixed(2) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
    const plannedHours = +entry.plannedHours.toFixed(2);
    const actualHours = +entry.actualHours.toFixed(2);
    const varianceHours = +(actualHours - plannedHours).toFixed(2);
    const variancePct = plannedHours > 0
      ? +((varianceHours / plannedHours) * 100).toFixed(1)
      : (actualHours > 0 ? null : 0);
    const plannedKeys = new Set(plannedResources.map(resource => resource.key));
    const actualKeys = new Set(actualResources.map(resource => resource.key));
    const retainedKeys = [...plannedKeys].filter(key => actualKeys.has(key));
    const addedResources = actualResources.filter(resource => !plannedKeys.has(resource.key));
    const removedResources = plannedResources.filter(resource => !actualKeys.has(resource.key));
    const unionSize = new Set([...plannedKeys, ...actualKeys]).size;
    const teamOverlapPct = unionSize > 0
      ? +((retainedKeys.length / unionSize) * 100).toFixed(1)
      : 0;
    const monthly = fiscalMonthList.map(({ y, m, label }) => {
      const monthKey = plannedActualMonthKey(y, m);
      const planned = +(entry.plannedByMonth.get(monthKey) || 0).toFixed(2);
      const actual = +(entry.actualByMonth.get(monthKey) || 0).toFixed(2);

      return {
        key: monthKey,
        label,
        planned,
        actual,
        variance: +(actual - planned).toFixed(2),
      };
    });

    return {
      ...entry,
      plannedResources,
      actualResources,
      plannedHours,
      actualHours,
      varianceHours,
      variancePct,
      addedResources,
      removedResources,
      retainedResources: actualResources.filter(resource => plannedKeys.has(resource.key)),
      teamOverlapPct,
      resourceChanges: buildPlannedActualResourceChanges(plannedResources, actualResources),
      monthly,
      totalHours: +(plannedHours + actualHours).toFixed(2),
    };
  }).sort((a, b) => (
    Math.max(b.plannedHours, b.actualHours) - Math.max(a.plannedHours, a.actualHours) ||
    Math.abs(b.varianceHours) - Math.abs(a.varianceHours) ||
    a.label.localeCompare(b.label)
  ));

  return {
    fiscalYear,
    projects,
    plannedHours: +projects.reduce((sum, project) => sum + project.plannedHours, 0).toFixed(2),
    actualHours: +projects.reduce((sum, project) => sum + project.actualHours, 0).toFixed(2),
  };
}

function formatPlannedActualHours(value) {
  const number = Number(value) || 0;
  return `${number.toLocaleString('en-US', { maximumFractionDigits: 1 })}h`;
}

function formatPlannedActualVariance(hours, percentage) {
  const numericHours = Number(hours) || 0;
  const sign = numericHours > 0 ? '+' : '';
  const pctText = percentage === null
    ? 'new actual effort'
    : `${percentage > 0 ? '+' : ''}${Number(percentage || 0).toFixed(1)}%`;

  return `${sign}${formatPlannedActualHours(numericHours)} (${pctText})`;
}

function plannedActualStatus(project) {
  if (project.plannedHours <= 0 && project.actualHours > 0) return 'Unplanned work';
  if (project.actualHours > project.plannedHours) return 'Over plan';
  if (project.actualHours < project.plannedHours) return 'Under plan';
  return 'On plan';
}
