function normalizeDesignationAliasKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._–—-]+/g, ' ')
    .replace(/[^a-z0-9, ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalDesignationDisplay(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const key = normalizeDesignationAliasKey(raw);
  if (key === normalizeDesignationAliasKey('Team Lead')) return 'Technical Lead';
  if (key === normalizeDesignationAliasKey('Junior Consultant')) return 'Jr. Consultant';
  if (key === normalizeDesignationAliasKey('Senior Manager, Delivery')) return 'Senior Manager';
  return raw;
}

function withCanonicalDesignation(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    designation: canonicalDesignationDisplay(row.designation),
  };
}

module.exports = {
  canonicalDesignationDisplay,
  normalizeDesignationAliasKey,
  withCanonicalDesignation,
};
