/* Workforce Allocation Dashboard — core/person-identity.js */

const PERSON_IDENTITY_ALIASES = Object.freeze([
  Object.freeze({
    canonicalName: 'Pervez Md Nafiz',
    aliases: Object.freeze([
      'Pervez Md Nafiz',
      'Md Nafiz Pervez',
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
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONICAL_PERSON_NAME_BY_ALIAS = new Map();
PERSON_IDENTITY_ALIASES.forEach(identity => {
  identity.aliases.forEach(alias => {
    CANONICAL_PERSON_NAME_BY_ALIAS.set(
      normalizePersonIdentityText(alias),
      identity.canonicalName,
    );
  });
});

function canonicalPersonName(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';

  return CANONICAL_PERSON_NAME_BY_ALIAS.get(
    normalizePersonIdentityText(cleaned),
  ) || cleaned;
}

function personIdentityKey(value) {
  return normalizePersonIdentityText(canonicalPersonName(value));
}
