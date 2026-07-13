const { getAppDb } = require('../database');
const { cleanText, normCode, normImportAmountKey, normalizeImportNumber } = require('./values');

function compactAssignmentTextKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeAssignmentImportRows(rows) {
  return (rows || []).map((raw, idx) => {
    const employeeCode = cleanText(raw.employee_code || raw['Resource ID'] || raw['Employee Code'] || raw['Res ID']).toUpperCase();
    const employeeName = cleanText(raw.employee_name || raw['Resource Name'] || raw['Employee Name'] || raw['Worker']);
    const projectCode = normCode(raw.project_code || raw['Opportunity Number'] || raw['Project Code'] || raw['SA Number']);
    const projectName = cleanText(raw.project_name || raw['Project Name'] || raw['Opportunity Name']);
    const productName = cleanText(raw.product_name || raw['Product Name'] || raw['Product Description']);
    const productAmount = normalizeImportNumber(raw.product_amount ?? raw['Product Amount']);
    const oldProjectId = Math.trunc(normalizeImportNumber(raw.old_project_id ?? raw['Old Project ID'] ?? raw['Project ID']));
    const projectImportRowNo = Math.trunc(normalizeImportNumber(raw.project_import_row_no ?? raw['Project Import Row No'] ?? raw['Project Source Row'] ?? raw['Excel Row']));
    const projectListPosition = Math.trunc(normalizeImportNumber(raw.project_list_position ?? raw['Project List Position'] ?? raw['Project Row No']));
    const year = Math.trunc(normalizeImportNumber(raw.year ?? raw['Year']));
    const month = Math.trunc(normalizeImportNumber(raw.month ?? raw['Month Number'] ?? raw['Month']));
    const week = Math.trunc(normalizeImportNumber(raw.week ?? raw['Week']));
    const percentage = normalizeImportNumber(raw.percentage ?? raw['Allocation %'] ?? raw['Percentage'] ?? raw['Workload Allocation']);

    return {
      source_row: Math.trunc(normalizeImportNumber(raw.source_row)) || idx + 2,
      employee_code: employeeCode,
      employee_name: employeeName,
      old_project_id: oldProjectId || 0,
      project_import_row_no: projectImportRowNo || 0,
      project_list_position: projectListPosition || 0,
      project_code: projectCode,
      project_name: projectName,
      product_name: productName,
      product_amount: +productAmount.toFixed(2),
      year,
      month,
      week,
      percentage: +percentage.toFixed(2),
    };
  });
}

function buildAssignmentImportResolvers() {
  const db = getAppDb();
  const employees = db.prepare('SELECT id, employee_code, name FROM employees').all();
  const projects = db.prepare('SELECT id, code, name, product_name, product_amount, import_row_no FROM projects ORDER BY id').all();

  const employeeByCode = new Map();
  const employeeByName = new Map();

  for (const e of employees) {
    const codeKey = normCode(e.employee_code);
    if (codeKey && !employeeByCode.has(codeKey)) employeeByCode.set(codeKey, e);

    const nameKey = compactAssignmentTextKey(e.name);
    if (nameKey) {
      if (!employeeByName.has(nameKey)) employeeByName.set(nameKey, []);
      employeeByName.get(nameKey).push(e);
    }
  }

  const byId = new Map(projects.map(p => [Number(p.id), p]));
  const byImportRow = new Map();
  const byListPosition = new Map();
  const byCodeNameProductAmount = new Map();
  const byCodeNameProduct = new Map();
  const byCodeName = new Map();
  const byCodeProduct = new Map();
  const byCode = new Map();

  const addToMap = (map, key, project) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(project);
  };

  projects.forEach((p, idx) => {
    const code = normCode(p.code);
    const nameKey = compactAssignmentTextKey(p.name);
    const productKey = compactAssignmentTextKey(p.product_name);
    const amountKey = normImportAmountKey(p.product_amount);

    if (p.import_row_no) addToMap(byImportRow, String(p.import_row_no), p);
    addToMap(byListPosition, String(idx + 1), p);
    addToMap(byCodeNameProductAmount, [code, nameKey, productKey, amountKey].join('\u001F'), p);
    addToMap(byCodeNameProduct, [code, nameKey, productKey].join('\u001F'), p);
    addToMap(byCodeName, [code, nameKey].join('\u001F'), p);
    addToMap(byCodeProduct, [code, productKey].join('\u001F'), p);
    addToMap(byCode, code, p);
  });

  const matchesKnownText = (project, row) => {
    if (!project) return false;
    const rowCode = normCode(row.project_code);
    const rowName = compactAssignmentTextKey(row.project_name);
    const rowProduct = compactAssignmentTextKey(row.product_name);
    if (rowCode && normCode(project.code) === rowCode) return true;
    if (rowName && compactAssignmentTextKey(project.name) === rowName) return true;
    if (rowProduct && compactAssignmentTextKey(project.product_name) === rowProduct) return true;
    return false;
  };

  const chooseFirst = candidates => (candidates && candidates.length ? candidates[0] : null);

  return {
    resolveEmployee(row) {
      if (row.employee_code && employeeByCode.has(normCode(row.employee_code))) {
        return { employee: employeeByCode.get(normCode(row.employee_code)) };
      }

      const nameKey = compactAssignmentTextKey(row.employee_name);
      const byName = nameKey ? employeeByName.get(nameKey) : null;
      if (byName && byName.length === 1) return { employee: byName[0] };
      if (byName && byName.length > 1) {
        return { reason: 'Multiple employees matched the Resource Name. Add a unique Resource ID in the Excel.' };
      }

      return { reason: 'Employee not found by Resource ID or Resource Name.' };
    },

    resolveProject(row) {
      // No uniqueness enforcement. For duplicate project rows, restore uses the
      // most specific backup fields first, then falls back to the first matching project.
      if (row.project_import_row_no) {
        const candidate = chooseFirst(byImportRow.get(String(row.project_import_row_no)));
        if (candidate && matchesKnownText(candidate, row)) return { project: candidate };
      }

      if (row.old_project_id) {
        const candidate = byId.get(Number(row.old_project_id));
        if (candidate && matchesKnownText(candidate, row)) return { project: candidate };
      }

      if (row.project_list_position) {
        const candidate = chooseFirst(byListPosition.get(String(row.project_list_position)));
        if (candidate && matchesKnownText(candidate, row)) return { project: candidate };
      }

      const code = normCode(row.project_code);
      const nameKey = compactAssignmentTextKey(row.project_name);
      const productKey = compactAssignmentTextKey(row.product_name);
      const amountKey = normImportAmountKey(row.product_amount);

      let candidate = chooseFirst(byCodeNameProductAmount.get([code, nameKey, productKey, amountKey].join('\u001F')));
      if (candidate) return { project: candidate };

      candidate = chooseFirst(byCodeNameProduct.get([code, nameKey, productKey].join('\u001F')));
      if (candidate) return { project: candidate };

      candidate = chooseFirst(byCodeName.get([code, nameKey].join('\u001F')));
      if (candidate) return { project: candidate };

      candidate = chooseFirst(byCodeProduct.get([code, productKey].join('\u001F')));
      if (candidate) return { project: candidate };

      candidate = chooseFirst(byCode.get(code));
      if (candidate) return { project: candidate };

      return { reason: 'Project not found in the replaced project list using backup row ID, Opportunity Number, Project Name, Product Name, or Product Amount.' };
    },
  };
}

module.exports = { buildAssignmentImportResolvers, compactAssignmentTextKey, normalizeAssignmentImportRows };
