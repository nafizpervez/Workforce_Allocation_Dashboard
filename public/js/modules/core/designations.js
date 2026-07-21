/* Workforce Allocation Dashboard — core/designations.js */

const RESOURCE_DESIGNATIONS = Object.freeze([
  'Team Lead',
  'Senior Consultant',
  'Consultant',
  'Junior Consultant',
  'Analyst',
]);

function normalizeDesignationKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getRevenueRateForDesignation(designation) {
  const key = normalizeDesignationKey(designation);
  if (!key) return null;

  return (S.revenueRates || []).find(rate =>
    normalizeDesignationKey(rate.designation) === key,
  ) || null;
}
