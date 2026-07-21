const { normalizeFiscalPeriod } = require('./fiscal');
const { projectColorForIndex } = require('./project-colors');
const {
  cleanText,
  normCode,
  normalizeImportDate,
  normalizeImportNumber,
  normalizeImportProbability,
} = require('./values');

function normalizeImportedProjectRows(rows) {
  const normalized = [];
  for (const [index, raw] of (rows || []).entries()) {
    const code = normCode(raw.code || raw.opportunity_number || raw['Opportunity Number']);
    const name = cleanText(raw.name || raw.opportunity_name || raw['Opportunity Name']);
    if (!code || !name) continue;

    const productFamily = cleanText(raw.product_family || raw['Product Family']);
    const productName = cleanText(raw.product_name || raw.product_description || raw['Product Name'] || raw['Product Description']);
    const productAmount = normalizeImportNumber(raw.product_amount ?? raw['Product Amount']);
    const opportunityAmount = normalizeImportNumber(raw.opp_amount ?? raw.amount ?? raw['Amount']);

    normalized.push({
      code,
      name,
      client: cleanText(raw.account_name || raw['Account Name']),
      account_name: cleanText(raw.account_name || raw['Account Name']),
      opportunity_owner: cleanText(raw.opportunity_owner || raw['Opportunity Owner']),
      probability: normalizeImportProbability(raw.probability ?? raw['Probability (%)']),
      product_family: productFamily,
      product_name: productName,
      stage: cleanText(raw.stage || raw['Stage']) || 'Prospect',
      end_date: normalizeImportDate(raw.end_date || raw.close_date || raw['Close Date']),
      created_date: normalizeImportDate(raw.created_date || raw['Created Date']),
      fiscal_period: normalizeFiscalPeriod(raw.fiscal_period || raw['Fiscal Period'] || raw.fiscal_year || raw['Fiscal Year']),
      product_amount: +productAmount.toFixed(2),
      opp_amount: +opportunityAmount.toFixed(2),
      budget: +opportunityAmount.toFixed(2),
      spent_pct: 0,
      progress: 0,
      color: projectColorForIndex(normalized.length),
      priority: 'Medium',
      project_closing_date: null,
      import_row_no: Math.trunc(normalizeImportNumber(raw.source_row ?? raw.import_row_no ?? raw['Source Row'] ?? raw['Excel Row'])) || index + 2,
    });
  }
  return normalized;
}

module.exports = { normalizeImportedProjectRows };
