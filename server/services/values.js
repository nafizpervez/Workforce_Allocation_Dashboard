function safeNum(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeImportNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

function normalizeImportProbability(value) {
  const number = normalizeImportNumber(value);
  if (!number) return 0;
  return number > 0 && number <= 1 ? +(number * 100).toFixed(2) : +number.toFixed(2);
}

function normalizeImportDate(value) {
  const text = cleanText(value);
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const year = +match[1], month = +match[2], day = +match[3];
    if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    let month = +match[1], day = +match[2], year = +match[3];
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(text);
  return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
}

function normCode(value) {
  return cleanText(value).toUpperCase();
}

function normImportAmountKey(value) {
  const number = normalizeImportNumber(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

module.exports = {
  cleanText,
  normCode,
  normImportAmountKey,
  normalizeImportDate,
  normalizeImportNumber,
  normalizeImportProbability,
  safeNum,
};
