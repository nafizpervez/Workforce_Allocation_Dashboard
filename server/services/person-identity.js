const { cleanText } = require('./values');

const PERSON_IDENTITY_ALIASES = Object.freeze([
  Object.freeze({
    canonicalName: 'Md Masud Iqbal',
    aliases: Object.freeze([
      'Masud Iqbal',
      'Md Masud Iqbal',
    ]),
  }),
  Object.freeze({
    canonicalName: 'Shah Imran Ahsan Chowdhury',
    aliases: Object.freeze([
      'Imran Chowdhury',
      'Shah Imran Ahsan Chowdhury',
    ]),
  }),
]);

function normalizePersonIdentityText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONICAL_NAME_BY_ALIAS = new Map();
for (const identity of PERSON_IDENTITY_ALIASES) {
  for (const alias of identity.aliases) {
    CANONICAL_NAME_BY_ALIAS.set(
      normalizePersonIdentityText(alias),
      identity.canonicalName,
    );
  }
}

function canonicalPersonName(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return '';

  return CANONICAL_NAME_BY_ALIAS.get(normalizePersonIdentityText(cleaned)) || cleaned;
}

function personIdentityKey(value) {
  return normalizePersonIdentityText(canonicalPersonName(value));
}

module.exports = {
  PERSON_IDENTITY_ALIASES,
  canonicalPersonName,
  normalizePersonIdentityText,
  personIdentityKey,
};
