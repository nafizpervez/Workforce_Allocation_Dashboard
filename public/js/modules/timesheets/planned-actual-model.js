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
    // Opportunity Numbers are editable. Resolve this historical Time Sheet
    // name to the current project by stable name characteristics instead of
    // pinning the relationship to a mutable project code.
    targetNameTokens: Object.freeze(['esri', 'malaysia', 'intrasourc']),
    fallbackLabel: '2023 JUPEM GDAS3-PR',
  }),
]);

/* Generic planning categories are reconciled with Time Sheet Work Type values.
 * This keeps non-project work such as Pre Sale, General Admin and Training
 * Delivery from being split by the Time Sheet's Project Name column. Named
 * delivery projects still use project-name matching. */
const PLANNED_ACTUAL_WORK_TYPE_BUCKETS = Object.freeze([
  Object.freeze({
    key: 'work-type:pre-sale',
    label: 'Pre-Sale',
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

function plannedActualProjectResolution(project) {
  if (!project) return null;

  const code = normalizePlannedActualText(project.code);
  const name = normalizePlannedActualText(project.name);
  const label = plannedActualProjectLabel(project);

  return {
    project,
    key: `project:${project.id}`,
    code,
    name,
    full: normalizePlannedActualText(label),
    label,
  };
}

function buildPlannedActualProjectResolver(projects) {
  const records = (projects || []).map(plannedActualProjectResolution).filter(Boolean);

  const aliasTargets = PLANNED_ACTUAL_PROJECT_ALIASES.map(alias => {
    const targetNameTokens = (alias.targetNameTokens || [])
      .map(normalizePlannedActualText)
      .filter(Boolean);
    const sourceKeys = new Set((alias.sourceNames || []).map(normalizePlannedActualText));
    const fallbackLabel = String(
      alias.fallbackLabel || alias.sourceNames?.[0] || 'Unspecified project',
    ).trim();
    const fallbackKey = normalizePlannedActualText(alias.sourceNames?.[0] || fallbackLabel);
    const fiscalEnd = Number(S.fiscalYear) + 1;
    const fiscalShort = String(fiscalEnd).slice(-2);
    const candidates = targetNameTokens.length
      ? records.filter(record => targetNameTokens.every(token => (
          record.name.includes(token) || record.full.includes(token)
        )))
      : [];
    const target = candidates.sort((a, b) => {
      const score = record => {
        let value = 0;
        for (const token of targetNameTokens) {
          if (record.name.includes(token)) value += 100;
          else if (record.full.includes(token)) value += 50;
        }
        if (record.full.includes(`fy${fiscalShort}`)) value += 20;
        if (record.full.includes(String(fiscalEnd))) value += 10;
        if (record.full.includes(String(S.fiscalYear))) value += 5;
        value += Math.max(0, Number(record.project?.id) || 0) / 100000;
        return value;
      };
      return score(b) - score(a);
    })[0];

    return {
      alias,
      sourceKeys,
      target: target || {
        project: null,
        key: `alias:${fallbackKey}`,
        code: '',
        name: normalizePlannedActualText(fallbackLabel),
        full: normalizePlannedActualText(fallbackLabel),
        label: fallbackLabel,
      },
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

    const alias = aliasTargets.find(item => item.sourceKeys.has(normalized));
    if (alias) return alias.target;

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

function addPlannedActualMonthAmount(map, year, month, amount) {
  const numericAmount = Number(amount) || 0;
  if (numericAmount <= 0) return;

  const key = plannedActualMonthKey(year, month);
  map.set(key, (map.get(key) || 0) + numericAmount);
}

function getPlannedActualBudgetRateField(projectName, workType = '') {
  const normalizedWorkType = normalizePlannedActualText(
    typeof normalizeTimesheetWorkType === 'function'
      ? normalizeTimesheetWorkType(workType)
      : workType,
  );
  const normalizedProject = normalizePlannedActualText(projectName);
  const classificationText = normalizedWorkType || normalizedProject;

  if (!classificationText) return null;
  if (/general admin|skill development/.test(classificationText)) return null;
  if (/intrasourc/.test(classificationText)) return 'intrasourcing_rate';
  if (/pre sales?|training delivery|local ps|service delivery local/.test(classificationText)) {
    return 'local_rate';
  }

  if (/general admin|skill development/.test(normalizedProject)) return null;
  if (/intrasourc/.test(normalizedProject)) return 'intrasourcing_rate';

  // Named delivery projects that are not Intrasourcing use the shared Local
  // rate, matching the dashboard's existing revenue model.
  return 'local_rate';
}

function getPlannedActualHourlyRate(employee, projectName, workType = '') {
  if (!employee) return null;

  const rateField = getPlannedActualBudgetRateField(projectName, workType);
  if (!rateField) return null;

  const rateRecord = getRevenueRateForDesignation(employee.designation);
  const rate = Number(rateRecord?.[rateField]);
  return Number.isFinite(rate) && rate >= 0 ? rate : null;
}

function calculatePlannedActualBudget(hours, employee, projectName, workType = '') {
  const numericHours = Number(hours) || 0;
  if (numericHours <= 0) return 0;

  const hourlyRate = getPlannedActualHourlyRate(employee, projectName, workType);
  return hourlyRate === null ? 0 : numericHours * hourlyRate;
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
      plannedBudgetByMonth: new Map(),
      actualBudgetByMonth: new Map(),
      preSaleProductNames: new Set(),
      preSaleProductNamesByMonth: new Map(),
      preSaleProductScopes: new Map(),
      plannedHours: 0,
      actualHours: 0,
      plannedBudget: 0,
      actualBudget: 0,
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

function buildPlannedActualScope(
  plannedMap,
  actualMap,
  plannedHours,
  actualHours,
  plannedBudget = 0,
  actualBudget = 0,
) {
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
    plannedBudget: +Number(plannedBudget || 0).toFixed(2),
    actualBudget: +Number(actualBudget || 0).toFixed(2),
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

function getPreSaleProductMasterByName(name) {
  const normalized = normalizePlannedActualText(name);
  if (!normalized) return null;
  return (S.preSaleProducts || []).find(item => (
    normalizePlannedActualText(item.name) === normalized
  )) || null;
}

function getPreSaleProductAmountByName(name) {
  const amount = Number(getPreSaleProductMasterByName(name)?.amount);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function getPreSaleProductPercentByName(name) {
  const percent = Number(getPreSaleProductMasterByName(name)?.percent);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : 0;
}

function addPlannedActualProductName(entry, productName, year, month) {
  const name = String(productName || '').trim();
  if (!name) return;
  entry.preSaleProductNames.add(name);
  const monthKey = plannedActualMonthKey(year, month);
  if (!entry.preSaleProductNamesByMonth.has(monthKey)) {
    entry.preSaleProductNamesByMonth.set(monthKey, new Set());
  }
  entry.preSaleProductNamesByMonth.get(monthKey).add(name);
}

function getOrCreatePlannedActualProductScope(entry, productName) {
  const name = String(productName || '').trim();
  if (!name) return null;
  if (!entry.preSaleProductScopes.has(name)) {
    entry.preSaleProductScopes.set(name, {
      key: name,
      label: name,
      productName: name,
      productAmount: getPreSaleProductAmountByName(name),
      productPercent: getPreSaleProductPercentByName(name),
      plannedByResource: new Map(),
      actualByResource: new Map(),
      plannedResourcesByMonth: new Map(),
      actualResourcesByMonth: new Map(),
      plannedByMonth: new Map(),
      actualByMonth: new Map(),
      plannedBudgetByMonth: new Map(),
      actualBudgetByMonth: new Map(),
      plannedHours: 0,
      actualHours: 0,
      plannedBudget: 0,
      actualBudget: 0,
    });
  }
  return entry.preSaleProductScopes.get(name);
}

function addPlannedActualProductPlanned(scope, assignment, employee, hours, budget) {
  const resourceKey = `employee:${employee.id}`;
  addPlannedActualHours(scope.plannedByResource, resourceKey, employee.name, hours);
  addPlannedActualMonthResourceHours(scope.plannedResourcesByMonth, assignment.year, assignment.month, resourceKey, employee.name, hours);
  addPlannedActualMonthHours(scope.plannedByMonth, assignment.year, assignment.month, hours);
  addPlannedActualMonthAmount(scope.plannedBudgetByMonth, assignment.year, assignment.month, budget);
  scope.plannedHours += hours;
  scope.plannedBudget += budget;
}

function addPlannedActualProductActual(scope, parsedMonth, resourceKey, resourceName, hours, budget) {
  addPlannedActualHours(scope.actualByResource, resourceKey, resourceName, hours);
  addPlannedActualMonthResourceHours(scope.actualResourcesByMonth, parsedMonth.year, parsedMonth.month, resourceKey, resourceName, hours);
  addPlannedActualMonthHours(scope.actualByMonth, parsedMonth.year, parsedMonth.month, hours);
  addPlannedActualMonthAmount(scope.actualBudgetByMonth, parsedMonth.year, parsedMonth.month, budget);
  scope.actualHours += hours;
  scope.actualBudget += budget;
}


const PLANNED_ACTUAL_ALL_PROJECTS_KEY = 'aggregate:all-projects';

function isPlannedActualAllProjectsExcluded(project) {
  const classification = normalizePlannedActualText([
    project?.key,
    project?.label,
    project?.project?.name,
    project?.workType,
  ].filter(Boolean).join(' '));

  return (
    /\bpre sales?\b/.test(classification) ||
    /\bintrasourc/.test(classification) ||
    /\btraining delivery\b/.test(classification) ||
    /\bgeneral admin\b/.test(classification)
  );
}

function mergePlannedActualResourceMap(target, source) {
  for (const resource of (source || new Map()).values()) {
    addPlannedActualHours(
      target,
      resource.key,
      resource.name,
      resource.hours,
    );
  }
}

function buildPlannedActualAllProjects(projects, months) {
  const includedProjects = (projects || []).filter(project => (
    !isPlannedActualAllProjectsExcluded(project)
  ));
  const plannedByResource = new Map();
  const actualByResource = new Map();

  for (const project of includedProjects) {
    mergePlannedActualResourceMap(plannedByResource, project.plannedByResource);
    mergePlannedActualResourceMap(actualByResource, project.actualByResource);
  }

  const plannedHours = includedProjects.reduce(
    (sum, project) => sum + (Number(project.plannedHours) || 0),
    0,
  );
  const actualHours = includedProjects.reduce(
    (sum, project) => sum + (Number(project.actualHours) || 0),
    0,
  );
  const plannedBudget = includedProjects.reduce(
    (sum, project) => sum + (Number(project.plannedBudget) || 0),
    0,
  );
  const actualBudget = includedProjects.reduce(
    (sum, project) => sum + (Number(project.actualBudget) || 0),
    0,
  );

  const annualScope = buildPlannedActualScope(
    plannedByResource,
    actualByResource,
    plannedHours,
    actualHours,
    plannedBudget,
    actualBudget,
  );

  const monthly = (months || []).map(month => {
    const monthPlannedByResource = new Map();
    const monthActualByResource = new Map();
    let monthPlannedHours = 0;
    let monthActualHours = 0;
    let monthPlannedBudget = 0;
    let monthActualBudget = 0;

    for (const project of includedProjects) {
      const projectMonth = (project.monthly || []).find(item => item.key === month.key);
      if (!projectMonth) continue;
      mergePlannedActualResourceMap(monthPlannedByResource, projectMonth.plannedByResource);
      mergePlannedActualResourceMap(monthActualByResource, projectMonth.actualByResource);
      monthPlannedHours += Number(projectMonth.plannedHours) || 0;
      monthActualHours += Number(projectMonth.actualHours) || 0;
      monthPlannedBudget += Number(projectMonth.plannedBudget) || 0;
      monthActualBudget += Number(projectMonth.actualBudget) || 0;
    }

    return {
      ...month,
      ...buildPlannedActualScope(
        monthPlannedByResource,
        monthActualByResource,
        monthPlannedHours,
        monthActualHours,
        monthPlannedBudget,
        monthActualBudget,
      ),
      planned: +monthPlannedHours.toFixed(2),
      actual: +monthActualHours.toFixed(2),
      variance: +(monthActualHours - monthPlannedHours).toFixed(2),
    };
  });

  return {
    key: PLANNED_ACTUAL_ALL_PROJECTS_KEY,
    project: null,
    label: 'All Projects',
    actualMatchMode: 'aggregate-projects',
    workType: '',
    includedProjectCount: includedProjects.length,
    includedProjectKeys: includedProjects.map(project => project.key),
    ...annualScope,
    monthly,
    preSaleProducts: [],
    preSaleProductAmount: 0,
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
  const preSalePlanByEmployeeMonth = new Map();
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
        plannedActualProjectResolution(assignmentProject) ||
        resolveProject(
          assignment.project_name || `${assignment.project_code || ''} ${assignment.project_name || ''}`,
        )
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
    const plannedBudget = calculatePlannedActualBudget(
      hours,
      employee,
      assignmentProjectName,
      resolvedProject.workType,
    );
    addPlannedActualMonthAmount(
      projectEntry.plannedBudgetByMonth,
      assignment.year,
      assignment.month,
      plannedBudget,
    );
    projectEntry.plannedHours += hours;
    projectEntry.plannedBudget += plannedBudget;

    if (resolvedProject.key === 'work-type:pre-sale') {
      const productName = String(assignment.product_name || '').trim();
      if (productName) {
        addPlannedActualProductName(projectEntry, productName, assignment.year, assignment.month);
        const productScope = getOrCreatePlannedActualProductScope(projectEntry, productName);
        addPlannedActualProductPlanned(productScope, assignment, employee, hours, plannedBudget);
        const employeeMonthKey = `${employee.id}|${plannedActualMonthKey(assignment.year, assignment.month)}`;
        if (!preSalePlanByEmployeeMonth.has(employeeMonthKey)) preSalePlanByEmployeeMonth.set(employeeMonthKey, new Map());
        const productHours = preSalePlanByEmployeeMonth.get(employeeMonthKey);
        productHours.set(productName, (productHours.get(productName) || 0) + hours);
      }
    }
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
    const actualBudget = calculatePlannedActualBudget(
      hours,
      matchedEmployee,
      row.projectName || resolvedProject.label,
      row.workType,
    );
    addPlannedActualMonthAmount(
      projectEntry.actualBudgetByMonth,
      parsedMonth.year,
      parsedMonth.month,
      actualBudget,
    );
    projectEntry.actualHours += hours;
    projectEntry.actualBudget += actualBudget;

    if (resolvedProject.key === 'work-type:pre-sale' && matchedEmployee) {
      const employeeMonthKey = `${matchedEmployee.id}|${plannedActualMonthKey(parsedMonth.year, parsedMonth.month)}`;
      const productHours = preSalePlanByEmployeeMonth.get(employeeMonthKey);
      const totalProductPlan = [...(productHours?.values() || [])].reduce((sum, value) => sum + value, 0);
      if (productHours && totalProductPlan > 0) {
        for (const [productName, productPlannedHours] of productHours.entries()) {
          const share = productPlannedHours / totalProductPlan;
          const allocatedHours = hours * share;
          const allocatedBudget = actualBudget * share;
          const productScope = getOrCreatePlannedActualProductScope(projectEntry, productName);
          addPlannedActualProductActual(productScope, parsedMonth, resourceKey, resourceName, allocatedHours, allocatedBudget);
        }
      }
    }
  }

  const projects = [...projectMap.values()].map(entry => {
    const annualScope = buildPlannedActualScope(
      entry.plannedByResource,
      entry.actualByResource,
      entry.plannedHours,
      entry.actualHours,
      entry.plannedBudget,
      entry.actualBudget,
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
          entry.plannedBudgetByMonth.get(key) || 0,
          entry.actualBudgetByMonth.get(key) || 0,
        ),
        planned,
        actual,
        variance: +(actual - planned).toFixed(2),
      };
    });

    const productNames = [...entry.preSaleProductNames];
    const preSaleProductAmount = productNames.reduce(
      (sum, name) => sum + getPreSaleProductAmountByName(name),
      0,
    );
    const preSaleProducts = [...entry.preSaleProductScopes.values()].map(scope => {
      const productAnnualScope = buildPlannedActualScope(
        scope.plannedByResource,
        scope.actualByResource,
        scope.plannedHours,
        scope.actualHours,
        scope.plannedBudget,
        scope.actualBudget,
      );
      const productMonthly = fiscalMonthList.map(({ y, m, label }) => {
        const key = plannedActualMonthKey(y, m);
        const planned = +(scope.plannedByMonth.get(key) || 0).toFixed(2);
        const actual = +(scope.actualByMonth.get(key) || 0).toFixed(2);
        const active = planned > 0 || actual > 0;
        return {
          key,
          label,
          year: y,
          month: m,
          ...buildPlannedActualScope(
            scope.plannedResourcesByMonth.get(key),
            scope.actualResourcesByMonth.get(key),
            planned,
            actual,
            scope.plannedBudgetByMonth.get(key) || 0,
            scope.actualBudgetByMonth.get(key) || 0,
          ),
          planned,
          actual,
          variance: +(actual - planned).toFixed(2),
          preSaleProductAmount: active ? scope.productAmount : 0,
        };
      });
      return {
        ...scope,
        ...productAnnualScope,
        monthly: productMonthly,
        preSaleProductAmount: scope.productAmount,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    const monthlyWithProducts = monthly.map(item => {
      const names = [...(entry.preSaleProductNamesByMonth.get(item.key) || [])];
      return {
        ...item,
        preSaleProductAmount: names.reduce(
          (sum, name) => sum + getPreSaleProductAmountByName(name),
          0,
        ),
      };
    });

    return {
      ...entry,
      ...annualScope,
      monthly: monthlyWithProducts,
      preSaleProducts,
      preSaleProductAmount,
    };
  }).sort((a, b) => (
    Math.max(b.plannedHours, b.actualHours) - Math.max(a.plannedHours, a.actualHours) ||
    Math.abs(b.varianceHours) - Math.abs(a.varianceHours) ||
    a.label.localeCompare(b.label)
  ));

  const months = fiscalMonthList.map(({ y, m, label }) => ({
    key: plannedActualMonthKey(y, m),
    label,
    year: y,
    month: m,
  }));
  const allProjects = buildPlannedActualAllProjects(projects, months);

  return {
    fiscalYear,
    months,
    projects: [allProjects, ...projects],
    plannedHours: +projects.reduce((sum, project) => sum + project.plannedHours, 0).toFixed(2),
    actualHours: +projects.reduce((sum, project) => sum + project.actualHours, 0).toFixed(2),
    plannedBudget: +projects.reduce((sum, project) => sum + project.plannedBudget, 0).toFixed(2),
    actualBudget: +projects.reduce((sum, project) => sum + project.actualBudget, 0).toFixed(2),
  };
}

function formatPlannedActualBudget(value) {
  if (typeof formatRevenueViewValue === 'function') {
    return formatRevenueViewValue(value);
  }

  return `$${Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
}

function formatPlannedActualBudgetExact(value) {
  if (typeof formatExactRevenueValue === 'function') {
    return formatExactRevenueValue(value);
  }

  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
