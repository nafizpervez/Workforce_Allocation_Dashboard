/* Workforce Allocation Dashboard — core/availability.js */

/*
 * An assignment to an N/A project is an availability marker, not productive
 * work. The employee is excluded from calculations for that exact matrix slot,
 * and every other assignment in the same employee/year/month/week slot is also
 * ignored for analytics. The marker assignment remains in S.matrix so it can
 * still be viewed and edited in the Resource Assignment table.
 */
const UNAVAILABLE_PROJECT_NAME_KEYS = new Set([
  'na',
  'notapplicable',
  'notavailable',
  'notapplication',
]);

function normalizeUnavailableProjectName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isUnavailableProjectName(value) {
  return UNAVAILABLE_PROJECT_NAME_KEYS.has(
    normalizeUnavailableProjectName(value),
  );
}

function getAvailabilityAssignmentProjectName(assignment) {
  if (assignment?.project_name) {
    return String(assignment.project_name).trim();
  }

  const project = (S.projects || []).find(item =>
    Number(item.id) === Number(assignment?.project_id),
  );

  return String(project?.name || '').trim();
}

function isUnavailableAssignment(assignment) {
  return isUnavailableProjectName(
    getAvailabilityAssignmentProjectName(assignment),
  );
}

function availabilitySlotKey(employeeId, year, month, week) {
  return [
    Number(employeeId),
    Number(year),
    Number(month),
    Number(week),
  ].join('|');
}

function getAssignmentAvailabilitySlotKey(assignment) {
  return availabilitySlotKey(
    assignment?.employee_id,
    assignment?.year,
    assignment?.month,
    assignment?.week,
  );
}

function getUnavailableAssignmentSlotSet(assignments = S.assignments) {
  const unavailableSlots = new Set();

  for (const assignment of assignments || []) {
    if (!isUnavailableAssignment(assignment)) continue;
    unavailableSlots.add(getAssignmentAvailabilitySlotKey(assignment));
  }

  return unavailableSlots;
}

function isAssignmentInUnavailableSlot(assignment, unavailableSlots = null) {
  const slots = unavailableSlots || getUnavailableAssignmentSlotSet();
  return slots.has(getAssignmentAvailabilitySlotKey(assignment));
}

function getEffectiveAssignments(assignments = S.assignments) {
  const source = assignments || [];
  const unavailableSlots = getUnavailableAssignmentSlotSet(source);

  return source.filter(assignment =>
    !unavailableSlots.has(getAssignmentAvailabilitySlotKey(assignment)),
  );
}

function getEffectiveFiscalAssignments(fiscalYear = S.fiscalYear, assignments = S.assignments) {
  return getEffectiveAssignments(assignments).filter(assignment => (
    (Number(assignment.year) === Number(fiscalYear) && Number(assignment.month) >= 4) ||
    (Number(assignment.year) === Number(fiscalYear) + 1 && Number(assignment.month) <= 3)
  ));
}

function isEmployeeUnavailableForSlot(employeeId, year, month, week, unavailableSlots = null) {
  const slots = unavailableSlots || getUnavailableAssignmentSlotSet();
  return slots.has(availabilitySlotKey(employeeId, year, month, week));
}

function getEmployeeUnavailableFiscalWeekCount(employeeId, fiscalYear = S.fiscalYear, assignments = S.assignments) {
  const unavailableSlots = getUnavailableAssignmentSlotSet(assignments);
  let count = 0;

  for (const month of fiscalMonths(fiscalYear)) {
    for (let week = 1; week <= 4; week++) {
      if (isEmployeeUnavailableForSlot(
        employeeId,
        month.y,
        month.m,
        week,
        unavailableSlots,
      )) {
        count++;
      }
    }
  }

  return count;
}

function getEmployeeAvailableFiscalWeekCount(employeeId, fiscalYear = S.fiscalYear, assignments = S.assignments) {
  const totalWeeks = fiscalMonths(fiscalYear).length * 4;
  return Math.max(
    0,
    totalWeeks - getEmployeeUnavailableFiscalWeekCount(employeeId, fiscalYear, assignments),
  );
}

function getEmployeeAvailableMonthWeekCount(employeeId, year, month, assignments = S.assignments) {
  const unavailableSlots = getUnavailableAssignmentSlotSet(assignments);
  let availableWeeks = 0;

  for (let week = 1; week <= 4; week++) {
    if (!isEmployeeUnavailableForSlot(
      employeeId,
      year,
      month,
      week,
      unavailableSlots,
    )) {
      availableWeeks++;
    }
  }

  return availableWeeks;
}

function isEmployeeUnavailableForEntireMonth(employeeId, year, month, assignments = S.assignments) {
  return getEmployeeAvailableMonthWeekCount(employeeId, year, month, assignments) === 0;
}

function getAvailableEmployeesForSlot(employees, year, month, week, assignments = S.assignments) {
  const unavailableSlots = getUnavailableAssignmentSlotSet(assignments);

  return (employees || []).filter(employee =>
    !isEmployeeUnavailableForSlot(
      employee.id,
      year,
      month,
      week,
      unavailableSlots,
    ),
  );
}

function normalizeAvailabilityPersonName(value) {
  return personIdentityKey(value);
}

function findAvailabilityEmployeeByName(workerName) {
  const target = normalizeAvailabilityPersonName(workerName);
  if (!target) return null;

  return (S.employees || []).find(employee =>
    normalizeAvailabilityPersonName(employee.name) === target,
  ) || null;
}

/*
 * Work Summary rows are monthly aggregates. They can be safely removed only
 * when the employee is marked unavailable for all four matrix weeks in that
 * month; partial-month N/A markers cannot be separated from a monthly total.
 */
function isTimesheetWorkerUnavailableForMonth(
  workerName,
  year,
  month,
  assignments = S.assignments,
) {
  const employee = findAvailabilityEmployeeByName(workerName);
  return Boolean(employee) && isEmployeeUnavailableForEntireMonth(
    employee.id,
    year,
    month,
    assignments,
  );
}
