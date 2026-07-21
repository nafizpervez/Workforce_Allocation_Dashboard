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

function assignmentSlotKey(assignment) {
  return [
    Number(assignment?.employee_id),
    Number(assignment?.year),
    Number(assignment?.month),
    Number(assignment?.week),
  ].join('|');
}

function getUnavailableSlotSet(assignments) {
  const unavailableSlots = new Set();

  for (const assignment of assignments || []) {
    if (isUnavailableProjectName(assignment.project_name)) {
      unavailableSlots.add(assignmentSlotKey(assignment));
    }
  }

  return unavailableSlots;
}

function filterEffectiveAssignments(assignments) {
  const source = assignments || [];
  const unavailableSlots = getUnavailableSlotSet(source);

  return source.filter(assignment =>
    !unavailableSlots.has(assignmentSlotKey(assignment)),
  );
}

module.exports = {
  assignmentSlotKey,
  filterEffectiveAssignments,
  getUnavailableSlotSet,
  isUnavailableProjectName,
  normalizeUnavailableProjectName,
};
