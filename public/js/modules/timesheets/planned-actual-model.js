/* Workforce Allocation Dashboard — timesheets/planned-actual-model.js */

const PLANNED_ACTUAL_RESOURCE_COLORS = [
  '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2',
  '#DC2626', '#4F46E5', '#65A30D', '#C2410C', '#0F766E', '#9333EA',
  '#0369A1', '#BE123C', '#A16207', '#15803D', '#6D28D9', '#0E7490',
];

/* Time Sheet project aliases are presentation/resolution rules only. They do
 * not edit projects, assignments, or stored Time Sheet rows. */
const PLANNED_ACTUAL_PROJECT_ALIASES = Object.freeze([
  Object.freeze({
    sourceNames: Object.freeze(['2023 JUPEM GDAS3-PR']),
    targetCode: 'SA123456',
    targetName: 'Esri Malaysia Intrasourcing',
    fallbackTokens: Object.freeze(['jupem', 'intrasource']),
  }),
]);

/* Generic planning categories are reconciled with Time Sheet Work Type values.
 * This keeps non-project work such as Pre Sale, General Admin and Training
 * Delivery from being split by the Time Sheet's Project Name column. Named
 * delivery projects still use project-name matching. */
const PLANNED_ACTUAL_WORK_TYPE_BUCKETS = Object.freeze([
  Object.freeze({
    key: 'work-type:pre-sale',
    label: 'Pre Sale',
    workType: 'Pre - Sales',
    alwaysAggregate: true,
  }),
  Object.freeze({
    key: 'work-type:general-admin',
    label: 'General Admin',
    workType: 'General Admin',
    alwaysAggregate: true,
  }),
  Object.freeze({
    key: 'work-type:training-delivery',
    label: 'Training Delivery',
    workType: 'Training Delivery',
    alwaysAggregate: true,
  }),
  Object.freeze({
    key: 'work-type:skill-development',
    label: 'Skill Development',
    workType: 'Skill Development',
    alwaysAggregate: true,
  }),
  Object.freeze({
    key: 'work-type:service-delivery-intrasourcing',
    label: 'Service Delivery - Intrasourcing',
    workType: 'Service Delivery - Intrasourcing',
    alwaysAggregate: false,
  }),
  Object.freeze({
    key: 'work-type:service-delivery-local-ps',
    label: 'Service Delivery - Local PS',
    workType: 'Service Delivery - Local PS',
    alwaysAggregate: false,
  }),
]);

const PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE = new Map(
  PLANNED_ACTUAL_WORK_TYPE_BUCKETS.map(bucket => [bucket.workType, bucket]),
);

function normalizePlannedActualText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plannedActualWorkTypeBucketForProject(projectName) {
  const normalized = normalizePlannedActualText(projectName);
  if (!normalized) return null;

  if (/\bpre sales?\b/.test(normalized)) {
    return PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get('Pre - Sales');
  }

  if (/\bgeneral admin\b/.test(normalized)) {
    return PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get('General Admin');
  }

  if (/\btraining delivery\b/.test(normalized)) {
    return PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get('Training Delivery');
  }

  if (/\bskill development\b/.test(normalized)) {
    return PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get('Skill Development');
  }

  // Only generic service-delivery labels are Work Type buckets. A named
  // project such as "Esri Malaysia Intrasourcing" remains project-specific.
  if (/^(?:service delivery )?intrasourc(?:e|ing)$/.test(normalized)) {
    return PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get('Service Delivery - Intrasourcing');
  }

  if (/^(?:service delivery )?local(?: ps)?$/.test(normalized)) {
    return PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get('Service Delivery - Local PS');
  }

  return null;
}

function plannedActualWorkTypeBucketForTimesheetRow(row, activeBucketKeys) {
  const normalizedWorkType = typeof normalizeTimesheetWorkType === 'function'
    ? normalizeTimesheetWorkType(row?.workType ?? row?.work_type)
    : String(row?.workType ?? row?.work_type ?? '').trim();
  const bucket = PLANNED_ACTUAL_WORK_TYPE_BUCKET_BY_TYPE.get(normalizedWorkType);

  if (!bucket) return null;
  if (bucket.alwaysAggregate || activeBucketKeys.has(bucket.key)) return bucket;
  return null;
}

function plannedActualWorkTypeResolution(bucket) {
  return {
    project: null,
    key: bucket.key,
    code: '',
    name: bucket.label,
    full: normalizePlannedActualText(bucket.label),
    label: bucket.label,
    actualMatchMode: 'work-type',
    workType: bucket.workType,
  };
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

  const aliasTargets = PLANNED_ACTUAL_PROJECT_ALIASES.map(alias => {
    const targetCode = normalizePlannedActualText(alias.targetCode);
    const targetName = normalizePlannedActualText(alias.targetName);
    const canonicalLabel = `${alias.targetCode} — ${alias.targetName}`;
    const exactTarget = records.find(record => (
      (targetCode && record.code === targetCode) ||
      (targetName && record.name === targetName)
    ));
    const fallbackCandidates = records.filter(record =>
      alias.fallbackTokens.every(token => record.full.includes(normalizePlannedActualText(token))),
    );
    const fiscalEnd = Number(S.fiscalYear) + 1;
    const fiscalShort = String(fiscalEnd).slice(-2);
    const fallbackTarget = exactTarget || fallbackCandidates.sort((a, b) => {
      const score = record => {
        let value = 0;
        if (record.full.includes(`fy${fiscalShort}`)) value += 1000;
        if (record.full.includes(String(fiscalEnd))) value += 500;
        if (record.full.includes(String(S.fiscalYear))) value += 250;
        value += Math.max(0, Number(record.project?.id) || 0) / 100000;
        return value;
      };
      return score(b) - score(a);
    })[0];

    return {
      alias,
      sourceKeys: new Set(alias.sourceNames.map(normalizePlannedActualText)),
      canonicalLabel,
      target: fallbackTarget || {
        project: null,
        key: `alias:${targetCode || targetName}`,
        code: targetCode,
        name: targetName,
        full: normalizePlannedActualText(canonicalLabel),
        label: canonicalLabel,
      },
    };
  });

  function canonicalizeRecord(record) {
    const aliasTarget = aliasTargets.find(item => item.target.key === record.key);
    return aliasTarget ? { ...record, label: aliasTarget.canonicalLabel } : record;
  }

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

    const alias = aliasTargets.find(item => item.sourceKeys.has(normalized));
    if (alias) return { ...alias.target, label: alias.canonicalLabel };

    if (exact.has(normalized)) return canonicalizeRecord(exact.get(normalized));

    const codeMatch = records.find(record => (
      record.code &&
      record.code.length >= 4 &&
      (` ${normalized} `).includes(` ${record.code} `)
    ));
    if (codeMatch) return canonicalizeRecord(codeMatch);

    const nameMatch = records.find(record => (
      record.name &&
      record.name.length >= 6 &&
      (normalized.includes(record.name) || record.name.includes(normalized))
    ));
    if (nameMatch) return canonicalizeRecord(nameMatch);

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

function addPlannedActualMonthResourceHours(map, year, month, resourceKey, resourceName, hours) {
  const monthKey = plannedActualMonthKey(year, month);
  if (!map.has(monthKey)) map.set(monthKey, new Map());
  addPlannedActualHours(map.get(monthKey), resourceKey, resourceName, hours);
}

function getOrCreatePlannedActualProject(
  projectMap,
  key,
  label,
  project = null,
  metadata = {},
) {
  if (!projectMap.has(key)) {
    projectMap.set(key, {
      key,
      project,
      label: label || 'Unnamed project',
      actualMatchMode: metadata.actualMatchMode || 'project-name',
      workType: metadata.workType || '',
      plannedByResource: new Map(),
      actualByResource: new Map(),
      plannedResourcesByMonth: new Map(),
      actualResourcesByMonth: new Map(),
      plannedByMonth: new Map(),
      actualByMonth: new Map(),
      plannedHours: 0,
      actualHours: 0,
    });
  } else {
    const entry = projectMap.get(key);
    if (label && entry.label !== label) entry.label = label;
    if (metadata.actualMatchMode) entry.actualMatchMode = metadata.actualMatchMode;
    if (metadata.workType) entry.workType = metadata.workType;
    if (!entry.project && project) entry.project = project;
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

function finalizePlannedActualResources(resourceMap) {
  return [...(resourceMap || new Map()).values()]
    .map(resource => ({ ...resource, hours: +resource.hours.toFixed(2) }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

function buildPlannedActualScope(plannedMap, actualMap, plannedHours, actualHours) {
  const plannedResources = finalizePlannedActualResources(plannedMap);
  const actualResources = finalizePlannedActualResources(actualMap);
  const normalizedPlannedHours = +Number(plannedHours || 0).toFixed(2);
  const normalizedActualHours = +Number(actualHours || 0).toFixed(2);
  const varianceHours = +(normalizedActualHours - normalizedPlannedHours).toFixed(2);
  const variancePct = normalizedPlannedHours > 0
    ? +((varianceHours / normalizedPlannedHours) * 100).toFixed(1)
    : (normalizedActualHours > 0 ? null : 0);
  const plannedKeys = new Set(plannedResources.map(resource => resource.key));
  const actualKeys = new Set(actualResources.map(resource => resource.key));
  const retainedKeys = [...plannedKeys].filter(key => actualKeys.has(key));
  const unionSize = new Set([...plannedKeys, ...actualKeys]).size;

  return {
    plannedByResource: new Map(plannedResources.map(resource => [resource.key, resource])),
    actualByResource: new Map(actualResources.map(resource => [resource.key, resource])),
    plannedResources,
    actualResources,
    plannedHours: normalizedPlannedHours,
    actualHours: normalizedActualHours,
    varianceHours,
    variancePct,
    addedResources: actualResources.filter(resource => !plannedKeys.has(resource.key)),
    removedResources: plannedResources.filter(resource => !actualKeys.has(resource.key)),
    retainedResources: actualResources.filter(resource => plannedKeys.has(resource.key)),
    teamOverlapPct: unionSize > 0 ? +((retainedKeys.length / unionSize) * 100).toFixed(1) : 0,
    resourceChanges: buildPlannedActualResourceChanges(plannedResources, actualResources),
    totalHours: +(normalizedPlannedHours + normalizedActualHours).toFixed(2),
  };
}

function buildPlannedActualEffortData() {
  // Plan-to-Execution remains on the dashboard's established FY27 scope.
  const fiscalYear = S.fiscalYear;
  const fiscalMonthList = fiscalMonths(fiscalYear);
  const employeesById = new Map((S.employees || []).map(employee => [Number(employee.id), employee]));
  const employeeByName = new Map();
  const projectMap = new Map();
  const activeWorkTypeBucketKeys = new Set();
  const resolveProject = buildPlannedActualProjectResolver(S.projects || []);

  for (const employee of S.employees || []) {
    const key = normalizePersonName(employee.name);
    if (key && !employeeByName.has(key)) employeeByName.set(key, employee);
  }

  for (const assignment of getEffectiveFiscalAssignments(fiscalYear, S.assignments)) {
    const employee = employeesById.get(Number(assignment.employee_id));
    if (!employee || employee.active === 0 || isNonAssignablePerson(employee.name)) continue;

    const assignmentProject = (S.projects || []).find(project =>
      Number(project.id) === Number(assignment.project_id),
    );
    const assignmentProjectName = String(
      assignment.project_name || assignmentProject?.name || '',
    ).trim();
    const workTypeBucket = plannedActualWorkTypeBucketForProject(assignmentProjectName);
    const resolvedProject = workTypeBucket
      ? plannedActualWorkTypeResolution(workTypeBucket)
      : (
        resolveProject(
          assignment.project_name || `${assignment.project_code || ''} ${assignment.project_name || ''}`,
        ) || resolveProject(plannedActualProjectLabel(assignmentProject))
      );
    if (!resolvedProject) continue;
    if (workTypeBucket) activeWorkTypeBucketKeys.add(workTypeBucket.key);

    const percentage = Math.max(0, Number(assignment.percentage) || 0);
    const hours = WORK_HOURS_PER_WEEK * (percentage / 100);
    if (hours <= 0) continue;

    const projectEntry = getOrCreatePlannedActualProject(
      projectMap,
      resolvedProject.key,
      resolvedProject.label,
      resolvedProject.project,
      {
        actualMatchMode: resolvedProject.actualMatchMode,
        workType: resolvedProject.workType,
      },
    );
    const resourceKey = `employee:${employee.id}`;

    addPlannedActualHours(projectEntry.plannedByResource, resourceKey, employee.name, hours);
    addPlannedActualMonthResourceHours(
      projectEntry.plannedResourcesByMonth,
      assignment.year,
      assignment.month,
      resourceKey,
      employee.name,
      hours,
    );
    addPlannedActualMonthHours(projectEntry.plannedByMonth, assignment.year, assignment.month, hours);
    projectEntry.plannedHours += hours;
  }

  for (const row of getVisibleTimesheetRows()) {
    const parsedMonth = parseTimesheetFiscalMonth(row.month, fiscalYear);
    if (!parsedMonth || !isPlannedActualFiscalMonth(row.month, fiscalYear)) continue;
    if (isUnavailableProjectName(row.projectName)) continue;
    if (isTimesheetWorkerUnavailableForMonth(row.worker, parsedMonth.year, parsedMonth.month)) continue;

    const hours = Math.max(0, Number(row.qty) || 0);
    if (hours <= 0) continue;

    const workTypeBucket = plannedActualWorkTypeBucketForTimesheetRow(
      row,
      activeWorkTypeBucketKeys,
    );
    const resolvedProject = workTypeBucket
      ? plannedActualWorkTypeResolution(workTypeBucket)
      : resolveProject(row.projectName || '(No project name)');
    if (!resolvedProject) continue;

    const projectEntry = getOrCreatePlannedActualProject(
      projectMap,
      resolvedProject.key,
      resolvedProject.label,
      resolvedProject.project,
      {
        actualMatchMode: resolvedProject.actualMatchMode,
        workType: resolvedProject.workType,
      },
    );
    const normalizedWorker = normalizePersonName(row.worker);
    const matchedEmployee = employeeByName.get(normalizedWorker);
    const resourceKey = matchedEmployee
      ? `employee:${matchedEmployee.id}`
      : `timesheet-worker:${normalizedWorker || 'unknown'}`;
    const resourceName = matchedEmployee?.name || row.worker || 'Unknown resource';

    addPlannedActualHours(projectEntry.actualByResource, resourceKey, resourceName, hours);
    addPlannedActualMonthResourceHours(
      projectEntry.actualResourcesByMonth,
      parsedMonth.year,
      parsedMonth.month,
      resourceKey,
      resourceName,
      hours,
    );
    addPlannedActualMonthHours(projectEntry.actualByMonth, parsedMonth.year, parsedMonth.month, hours);
    projectEntry.actualHours += hours;
  }

  const projects = [...projectMap.values()].map(entry => {
    const annualScope = buildPlannedActualScope(
      entry.plannedByResource,
      entry.actualByResource,
      entry.plannedHours,
      entry.actualHours,
    );
    const monthly = fiscalMonthList.map(({ y, m, label }) => {
      const key = plannedActualMonthKey(y, m);
      const planned = +(entry.plannedByMonth.get(key) || 0).toFixed(2);
      const actual = +(entry.actualByMonth.get(key) || 0).toFixed(2);
      return {
        key,
        label,
        year: y,
        month: m,
        ...buildPlannedActualScope(
          entry.plannedResourcesByMonth.get(key),
          entry.actualResourcesByMonth.get(key),
          planned,
          actual,
        ),
        planned,
        actual,
        variance: +(actual - planned).toFixed(2),
      };
    });

    return {
      ...entry,
      ...annualScope,
      monthly,
    };
  }).sort((a, b) => (
    Math.max(b.plannedHours, b.actualHours) - Math.max(a.plannedHours, a.actualHours) ||
    Math.abs(b.varianceHours) - Math.abs(a.varianceHours) ||
    a.label.localeCompare(b.label)
  ));

  return {
    fiscalYear,
    months: fiscalMonthList.map(({ y, m, label }) => ({
      key: plannedActualMonthKey(y, m),
      label,
      year: y,
      month: m,
    })),
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
