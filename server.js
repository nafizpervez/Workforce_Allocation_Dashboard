/**
 * server.js — Express API for Workforce Allocation Dashboard
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, createSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 8009;

const db = getDb();
createSchema(db);

/* ─── migrations ──────────────────────────────────────────────── */
// Add 'active' column to employees if it doesn't exist yet
try {
  db.prepare("ALTER TABLE employees ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run();
} catch (_) { /* column already exists — safe to ignore */ }


/* Allow multiple project/product rows under the same Opportunity Number.
   Older DB versions may have UNIQUE(code), which blocks importing separate
   product rows for the same SA number. This migration removes only that
   single-column UNIQUE(code) constraint while preserving project ids. */
function ensureProjectsAllowDuplicateCodes() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (!table || !table.sql) return;

  const indexes = db.prepare("PRAGMA index_list('projects')").all();
  let hasSingleCodeUniqueIndex = false;

  for (const idx of indexes) {
    if (!idx.unique) continue;
    const cols = db.prepare(`PRAGMA index_info(${quoteIdent(idx.name)})`).all().map(c => c.name);
    if (cols.length === 1 && cols[0] === 'code') {
      hasSingleCodeUniqueIndex = true;
      break;
    }
  }

  const inlineUniqueCode = /\bcode\b[^,)]*\bUNIQUE\b/i.test(table.sql);
  const tableUniqueCode = /UNIQUE\s*\(\s*code\s*\)/i.test(table.sql);

  if (!hasSingleCodeUniqueIndex && !inlineUniqueCode && !tableUniqueCode) return;

  const backupName = `projects_code_unique_backup_${Date.now()}`;
  let createSql = table.sql;

  createSql = createSql
    .replace(/\bcode\b\s+TEXT\s+NOT\s+NULL\s+UNIQUE/ig, 'code TEXT NOT NULL')
    .replace(/\bcode\b\s+TEXT\s+UNIQUE/ig, 'code TEXT')
    .replace(/,\s*UNIQUE\s*\(\s*code\s*\)/ig, '')
    .replace(/UNIQUE\s*\(\s*code\s*\)\s*,/ig, '');

  const cols = db.prepare("PRAGMA table_info('projects')").all().map(c => c.name);
  const colList = cols.map(quoteIdent).join(', ');

  const txn = db.transaction(() => {
    db.prepare('PRAGMA foreign_keys = OFF').run();
    db.prepare(`ALTER TABLE projects RENAME TO ${quoteIdent(backupName)}`).run();
    db.prepare(createSql).run();
    db.prepare(`INSERT INTO projects (${colList}) SELECT ${colList} FROM ${quoteIdent(backupName)}`).run();
    db.prepare(`DROP TABLE ${quoteIdent(backupName)}`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(code)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_import_key ON projects(code, product_name, product_amount)').run();
    db.prepare('PRAGMA foreign_keys = ON').run();
  });

  txn();
}

try {
  ensureProjectsAllowDuplicateCodes();
} catch (e) {
  console.error('Project duplicate-code compatibility migration failed:', e);
}

/* ─── Time Sheet summary table ───────────────────────────────── */
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS timesheet_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      worker TEXT NOT NULL,
      work_type TEXT NOT NULL,
      project_name TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL DEFAULT 0,
      source_file TEXT,
      sheet_name TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(month, worker, work_type, project_name)
    )
  `).run();

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_timesheet_entries_month
    ON timesheet_entries(month)
  `).run();

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_timesheet_entries_worker
    ON timesheet_entries(worker)
  `).run();

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_timesheet_entries_work_type
    ON timesheet_entries(work_type)
  `).run();
} catch (e) {
  console.error('Time Sheet table migration failed:', e);
}

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ─── helpers ─────────────────────────────────────────────────── */
function fiscalMonths(fy) {
  return [
    { year: fy, month: 4 }, { year: fy, month: 5 }, { year: fy, month: 6 },
    { year: fy, month: 7 }, { year: fy, month: 8 }, { year: fy, month: 9 },
    { year: fy, month: 10 }, { year: fy, month: 11 }, { year: fy, month: 12 },
    { year: fy + 1, month: 1 }, { year: fy + 1, month: 2 }, { year: fy + 1, month: 3 },
  ];
}
const FISCAL_WHERE = `((year = ? AND month >= 4) OR (year = ? AND month <= 3))`;
const fiscalParams = fy => [fy, fy + 1];

function getRunningProjectCutoffDate() {
  const currentYear = new Date().getFullYear();
  const cutoffYear = currentYear - 2;
  return `${cutoffYear}-01-01`;
}

function getFiscalYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const month = d.getMonth() + 1;
  return month >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}
function fyLabel(fy) { return `FY ${fy + 1}`; }

/**
 * productCategory — classifies a project into a category bucket.
 * Same logic used in app.js classifyProduct.
 */
function productCategory(prodName, prodFamily) {
  const n = (prodName || '').toUpperCase();
  const f = (prodFamily || '').toUpperCase();
  if (n.includes('PS SYSTEM SUPPORT') || n.includes('PS PROJECT IMPLEMENT')) return 'PS';
  if (n.includes('PERSONAL USE')) return 'PERSONAL';
  if (n.includes('STUDENT USE')) return 'STUDENT';
  if (f === 'PROFESSIONAL SERVICES') return 'PS';          // catch-all for PS family
  if (f === 'SOFTWARE') return 'SOFTWARE';
  if (n.includes('LICENSE') || n.includes('RENEW') || n.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
  return 'OTHER';
}

/**
 * matchesCategory — returns true if a project belongs to the given category.
 *
 * Categories:
 *   'ALL'        — every Closed Won project
 *   'ALLCLEAN'   — exclude Personal Use and Student Use
 *   'SOFTWARE'   — product_family='Software', excluding Personal/Student Use
 *   'PS'         — product_family='Professional Services' with PS product names
 *   'PERSONAL'   — product_name contains 'PERSONAL USE'
 *   'STUDENT'    — product_name contains 'STUDENT USE'
 */
function matchesCategory(p, cat) {
  const n = (p.product_name || '').toUpperCase();
  const f = (p.product_family || '').toUpperCase();
  const isPersonal = n.includes('PERSONAL USE');
  const isStudent = n.includes('STUDENT USE');
  const isPS = (n.includes('PS SYSTEM SUPPORT') || n.includes('PS PROJECT IMPLEMENT')) && f === 'PROFESSIONAL SERVICES';
  switch (cat) {
    case 'ALL': return true;
    case 'ALLCLEAN': return !isPersonal && !isStudent;
    case 'SOFTWARE': return f === 'SOFTWARE' && !isPersonal && !isStudent;
    case 'PS': return isPS;
    case 'PERSONAL': return isPersonal;
    case 'STUDENT': return isStudent;
    default: return true;
  }
}

/**
 * calcDealStatusesForSubset — assigns NEW LOGO / REPEAT / REACTIVE to each project
 * within a filtered subset. Status is computed based ONLY on the subset history.
 *
 * Rules:
 *   - First time account appears in subset → NEW LOGO
 *   - Account last seen in immediately preceding FY → REPEAT
 *   - Account skipped ≥1 FY → REACTIVE
 *   - Multiple SA codes same account same FY: canonical status locked to FIRST occurrence.
 *     Exception: after REACTIVE, subsequent entries in same FY → REPEAT (duplicate rule),
 *     but canonical stays REACTIVE for the account that FY.
 */
function calcDealStatusesForSubset(projects) {
  const cwProjects = projects
    .filter(p => p.stage === 'Closed Won' && p.end_date)
    .map(p => ({ ...p, fy: getFiscalYear(p.end_date) }))
    .filter(p => p.fy !== null)
    .sort((a, b) => a.fy !== b.fy ? a.fy - b.fy : a.id - b.id);

  const acctMap = {};
  for (const p of cwProjects) {
    const key = (p.account_name || p.client || '').trim().toLowerCase();
    if (!key) continue;
    (acctMap[key] || (acctMap[key] = [])).push(p);
  }

  const out = {};

  for (const occs of Object.values(acctMap)) {
    let prevFY = null;
    let canonicalStatus = null; // locked per FY, updated only on FY change

    for (const occ of occs) {
      let status;
      if (prevFY === null) {
        status = 'NEW LOGO'; canonicalStatus = 'NEW LOGO';
      } else if (occ.fy === prevFY) {
        // Same FY: canonical status NOT updated. Apply duplicate rule.
        status = canonicalStatus === 'REACTIVE' ? 'REPEAT' : canonicalStatus;
      } else if (occ.fy === prevFY + 1) {
        status = 'REPEAT'; canonicalStatus = 'REPEAT';
      } else {
        status = 'REACTIVE'; canonicalStatus = 'REACTIVE';
      }
      out[occ.id] = status;
      prevFY = occ.fy;
    }
  }

  // Prospective status for pipeline (non-Closed Won)
  const acctLastFY = {};
  for (const p of cwProjects) {
    const key = (p.account_name || p.client || '').trim().toLowerCase();
    if (!acctLastFY[key] || p.fy > acctLastFY[key]) acctLastFY[key] = p.fy;
  }
  for (const p of projects) {
    if (p.stage === 'Closed Won') continue;
    const fy = getFiscalYear(p.end_date) || new Date().getFullYear();
    const key = (p.account_name || p.client || '').trim().toLowerCase();
    const lastFY = acctLastFY[key];
    out[p.id] = lastFY === undefined ? 'NEW LOGO' : (lastFY >= fy - 1 ? 'REPEAT' : 'REACTIVE');
  }
  for (const p of projects) {
    if (!(p.id in out)) out[p.id] = 'NEW LOGO';
  }

  return out;
}

/**
 * calcDealStatuses — wrapper used by /api/projects and /api/dashboard/deadlines.
 * Uses ALL projects (no category filter) for global status assignment.
 */
function calcDealStatuses(allProjects) {
  return calcDealStatusesForSubset(allProjects);
}


const safeNum = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function normCode(v) {
  return cleanText(v).toUpperCase();
}

function normProductName(v) {
  return cleanText(v).toUpperCase().replace(/\s+/g, ' ');
}

function normImportAmountKey(v) {
  const n = normalizeImportNumber(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function projectImportCompositeKey(code, productName, productAmount) {
  return [
    normCode(code),
    normProductName(productName),
    normImportAmountKey(productAmount),
  ].join('\u001F');
}

function getProjectImportKeyFromProjectRow(row) {
  return projectImportCompositeKey(row.code, row.product_name, row.product_amount);
}

function normalizeImportNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeImportProbability(v) {
  const n = normalizeImportNumber(v);
  if (!n) return 0;
  return n > 0 && n <= 1 ? +(n * 100).toFixed(2) : +n.toFixed(2);
}

function normalizeImportDate(v) {
  const s = cleanText(v);
  if (!s) return null;

  // Already ISO-like
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // M/D/YYYY or D/M/YYYY. Salesforce export usually uses M/D/YYYY.
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let mo = +m[1], d = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dObj = new Date(s);
  if (!isNaN(dObj)) return dObj.toISOString().slice(0, 10);
  return null;
}

function normalizeImportedProjectRows(rows) {
  const byCompositeKey = new Map();

  for (const raw of rows || []) {
    const code = normCode(raw.code || raw.opportunity_number || raw['Opportunity Number']);
    const name = cleanText(raw.name || raw.opportunity_name || raw['Opportunity Name']);
    if (!code || !name) continue;

    const productFamily = cleanText(raw.product_family || raw['Product Family']);
    const productName = cleanText(
      raw.product_name ||
      raw.product_description ||
      raw['Product Name'] ||
      raw['Product Description']
    );
    const productAmount = normalizeImportNumber(raw.product_amount ?? raw['Product Amount']);
    const oppAmount = normalizeImportNumber(raw.opp_amount ?? raw.amount ?? raw['Amount']);
    const probability = normalizeImportProbability(raw.probability ?? raw['Probability (%)']);
    const closeDate = normalizeImportDate(raw.end_date || raw.close_date || raw['Close Date']);
    const createdDate = normalizeImportDate(raw.created_date || raw['Created Date']);

    // IMPORTANT:
    // Import uniqueness is NOT only Opportunity Number.
    // A project line is unique by:
    // Opportunity Number + resolved Product Name/Product Description + Product Amount.
    const compositeKey = projectImportCompositeKey(code, productName, productAmount);

    const row = {
      code,
      name,
      client: cleanText(raw.account_name || raw['Account Name']),
      account_name: cleanText(raw.account_name || raw['Account Name']),
      opportunity_owner: cleanText(raw.opportunity_owner || raw['Opportunity Owner']),
      probability,
      product_family: productFamily,
      product_name: productName,
      stage: cleanText(raw.stage || raw['Stage']) || 'Prospect',
      end_date: closeDate,
      created_date: createdDate,
      product_amount: +productAmount.toFixed(2),
      opp_amount: +oppAmount.toFixed(2),
      budget: +oppAmount.toFixed(2),
      spent_pct: 0,
      progress: 0,
      color: '#8B5CF6',
      priority: 'Medium',
      project_closing_date: null,
      _import_key: compositeKey,
    };

    if (!byCompositeKey.has(compositeKey)) {
      byCompositeKey.set(compositeKey, row);
      continue;
    }

    // If the same Opportunity Number + Product Name + Product Amount appears
    // more than once inside the uploaded Excel, keep one row and fill blanks.
    const existing = byCompositeKey.get(compositeKey);
    if (!existing.name && row.name) existing.name = row.name;
    if (!existing.account_name && row.account_name) existing.account_name = row.account_name;
    if (!existing.client && row.client) existing.client = row.client;
    if (!existing.opportunity_owner && row.opportunity_owner) existing.opportunity_owner = row.opportunity_owner;
    if (!existing.product_family && row.product_family) existing.product_family = row.product_family;
    if (!existing.stage && row.stage) existing.stage = row.stage;
    if (!existing.end_date && row.end_date) existing.end_date = row.end_date;
    if (!existing.created_date && row.created_date) existing.created_date = row.created_date;
    if (!existing.probability && row.probability) existing.probability = row.probability;
    if (!existing.opp_amount && row.opp_amount) {
      existing.opp_amount = row.opp_amount;
      existing.budget = row.opp_amount;
    }
  }

  return [...byCompositeKey.values()]
    .sort((a, b) => {
      const codeCompare = String(a.code).localeCompare(String(b.code), undefined, { numeric: true, sensitivity: 'base' });
      if (codeCompare !== 0) return codeCompare;
      const productCompare = String(a.product_name || '').localeCompare(String(b.product_name || ''), undefined, { numeric: true, sensitivity: 'base' });
      if (productCompare !== 0) return productCompare;
      return (Number(a.product_amount) || 0) - (Number(b.product_amount) || 0);
    });
}

function cleanText(v) {
  return String(v ?? '').trim();
}

function normalizeTimesheetPayloadRows(rows) {
  const map = new Map();

  for (const r of rows || []) {
    const month = cleanText(r.month);
    const worker = cleanText(r.worker);
    const workType = cleanText(r.workType || r.work_type);
    const projectName = cleanText(r.projectName || r.project_name || '(No project name)');
    const qty = safeNum(r.qty, 0);

    if (!month || !worker || !workType || qty <= 0) continue;

    const key = [month, worker, workType, projectName].join('\u001F');

    if (!map.has(key)) {
      map.set(key, {
        month,
        worker,
        workType,
        projectName,
        qty: 0,
      });
    }

    map.get(key).qty += qty;
  }

  return [...map.values()].map(r => ({
    ...r,
    qty: +r.qty.toFixed(4),
  }));
}


/* ─── Revenue chart — per-category revenue data ──────────────── */
app.get('/api/dashboard/ps-revenue-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, end_date, product_amount, opp_amount, product_name, product_family, account_name, client, stage FROM projects'
  ).all();

  const CATEGORIES = ['ALL', 'ALLCLEAN', 'SOFTWARE', 'PS', 'PERSONAL', 'STUDENT'];

  const buildRevenueForCategory = (cat) => {
    const subset = allProjects.filter(p =>
      p.stage === 'Closed Won' && p.end_date && matchesCategory(p, cat)
    );

    const fyData = {};
    for (const r of subset) {
      const fy = getFiscalYear(r.end_date);
      if (fy === null) continue;
      if (!fyData[fy]) fyData[fy] = { total: 0, ps: 0, allProjects: [], psProjects: [] };

      // Total Amount MUST use Product Amount only.
      // Never use Amount / opp_amount for this revenue chart.
      const totalAmt = r.product_amount || 0;
      fyData[fy].total += totalAmt;
      fyData[fy].allProjects.push({
        name: r.name || r.code,
        code: r.code,
        amount: totalAmt,
        product_name: r.product_name || '',
        product_family: r.product_family || '—',
      });

      // PS Amount MUST also use Product Amount only, limited to PS product rows.
      const pnUpper = (r.product_name || '').toUpperCase();
      const isPSProduct = (r.product_family || '') === 'Professional Services' &&
        (pnUpper.includes('PS SYSTEM SUPPORT') || pnUpper.includes('PS PROJECT IMPLEMENT'));
      if (isPSProduct) {
        const psAmt = r.product_amount || 0;
        fyData[fy].ps += psAmt;
        fyData[fy].psProjects.push({ name: r.name || r.code, code: r.code, amount: psAmt });
      }
    }

    return Object.entries(fyData)
      .sort((a, b) => +a[0] - +b[0])
      .map(([fy, d]) => ({
        fy: +fy,
        label: fyLabel(+fy),
        ps_amount: +d.ps.toFixed(2),
        total_amount: +d.total.toFixed(2),
        pct: d.total > 0 ? +((d.ps / d.total) * 100).toFixed(1) : 0,
        all_projects: d.allProjects.sort((a, b) => b.amount - a.amount),
        ps_projects: d.psProjects.sort((a, b) => b.amount - a.amount),
      }));
  };

  const result = {};
  for (const cat of CATEGORIES) {
    result[cat] = buildRevenueForCategory(cat);
  }

  res.json(result);
});


/* ─── employees ───────────────────────────────────────────────── */
app.get('/api/employees', (_, res) =>
  res.json(db.prepare('SELECT id, employee_code, name, dept, email, COALESCE(active,1) AS active, created_at FROM employees ORDER BY id').all())
);

app.post('/api/employees', (req, res) => {
  const { employee_code, name, dept, email } = req.body || {};
  if (!name || !dept) return res.status(400).json({ error: 'name and dept are required' });
  const info = db.prepare('INSERT INTO employees (employee_code,name,dept,email) VALUES (?,?,?,?)').run(employee_code || '', name, dept, email || null);
  res.status(201).json(db.prepare('SELECT * FROM employees WHERE id=?').get(info.lastInsertRowid));
});

app.put('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM employees WHERE id=?').get(id)) return res.status(404).json({ error: 'not found' });
  const { employee_code, name, dept, email } = req.body || {};
  db.prepare('UPDATE employees SET employee_code=COALESCE(?,employee_code),name=COALESCE(?,name),dept=COALESCE(?,dept),email=COALESCE(?,email) WHERE id=?')
    .run(employee_code ?? null, name ?? null, dept ?? null, email ?? null, id);
  res.json(db.prepare('SELECT * FROM employees WHERE id=?').get(id));
});

app.patch('/api/employees/:id/active', (req, res) => {
  const id = Number(req.params.id);
  const emp = db.prepare('SELECT id, COALESCE(active,1) AS active FROM employees WHERE id=?').get(id);
  if (!emp) return res.status(404).json({ error: 'not found' });
  const newActive = emp.active ? 0 : 1;
  db.prepare('UPDATE employees SET active=? WHERE id=?').run(newActive, id);
  res.json(db.prepare('SELECT id, employee_code, name, dept, email, COALESCE(active,1) AS active, created_at FROM employees WHERE id=?').get(id));
});

app.delete('/api/employees/:id', (req, res) => {
  const info = db.prepare('DELETE FROM employees WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/* ─── projects ────────────────────────────────────────────────── */
const PROJECT_FIELDS = [
  'code', 'name', 'client', 'budget', 'spent_pct', 'end_date', 'stage', 'progress', 'color', 'priority',
  'product_amount', 'account_name', 'product_name', 'product_family', 'opportunity_owner', 'opp_amount', 'probability',
  'created_date', 'project_closing_date',
];

app.get('/api/projects', (_, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const statusMap = calcDealStatuses(rows);
  res.json(rows.map(r => ({ ...r, deal_status: statusMap[r.id] || 'NEW LOGO' })));
});

app.post('/api/projects', (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name are required' });
  try {
    const info = db.prepare(`
      INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
        product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
        created_date,project_closing_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.code, b.name, b.client || b.account_name || null,
      safeNum(b.budget ?? b.opp_amount, 0), safeNum(b.spent_pct, 0),
      b.end_date || null, b.stage || 'Prospect', safeNum(b.progress, 0),
      b.color || '#8B5CF6', b.priority || 'Medium',
      safeNum(b.product_amount, 0), b.account_name || null, b.product_name || null,
      b.product_family || null,
      b.opportunity_owner || null, safeNum(b.opp_amount, 0), safeNum(b.probability, 0),
      b.created_date || null, b.project_closing_date || null
    );
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'project code must be unique' });
    throw e;
  }

});

app.post('/api/projects/import', (req, res) => {
  const rows = normalizeImportedProjectRows(req.body?.rows || []);

  if (!rows.length) {
    return res.status(400).json({ error: 'No valid project rows found in uploaded Excel.' });
  }

  const existingImportKeys = new Set(
    db.prepare('SELECT code, product_name, product_amount FROM projects').all().map(getProjectImportKeyFromProjectRow)
  );

  const toInsert = rows.filter(r => !existingImportKeys.has(r._import_key));
  const skippedExisting = rows.filter(r => existingImportKeys.has(r._import_key));

  const insertProject = db.prepare(`
    INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
      product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
      created_date,project_closing_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const inserted = [];
  const failed = [];

  const txn = db.transaction(() => {
    for (const p of toInsert) {
      try {
        const info = insertProject.run(
          p.code,
          p.name,
          p.client || p.account_name || null,
          safeNum(p.budget ?? p.opp_amount, 0),
          safeNum(p.spent_pct, 0),
          p.end_date || null,
          p.stage || 'Prospect',
          safeNum(p.progress, 0),
          p.color || '#8B5CF6',
          p.priority || 'Medium',
          safeNum(p.product_amount, 0),
          p.account_name || null,
          p.product_name || null,
          p.product_family || null,
          p.opportunity_owner || null,
          safeNum(p.opp_amount, 0),
          safeNum(p.probability, 0),
          p.created_date || null,
          p.project_closing_date || null
        );
        inserted.push({
          id: info.lastInsertRowid,
          code: p.code,
          name: p.name,
          product_name: p.product_name,
          product_amount: p.product_amount,
        });
        existingImportKeys.add(p._import_key);
      } catch (e) {
        failed.push({ code: p.code, name: p.name, product_name: p.product_name, product_amount: p.product_amount, error: e.message });
      }
    }
  });

  txn();

  res.status(201).json({
    ok: true,
    parsed_rows: Array.isArray(req.body?.rows) ? req.body.rows.length : 0,
    normalized_projects: rows.length,
    inserted_count: inserted.length,
    skipped_existing_count: skippedExisting.length,
    failed_count: failed.length,
    inserted,
    import_unique_key: 'Opportunity Number + resolved Product Name/Product Description + Product Amount',
    skipped_existing: skippedExisting.map(p => ({
      code: p.code,
      name: p.name,
      product_name: p.product_name,
      product_amount: p.product_amount,
      reason: 'Already exists in the app with the same Opportunity Number + resolved Product Name/Product Description + Product Amount.',
    })),
    failed: failed.map(p => ({
      ...p,
      reason: p.error || 'Database insert failed.',
    })),
  });
});

app.put('/api/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) return res.status(404).json({ error: 'not found' });
  const updates = [], params = [];
  for (const f of PROJECT_FIELDS) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f}=?`); params.push(req.body[f]);
    }
  }
  if (updates.length) { params.push(id); db.prepare(`UPDATE projects SET ${updates.join(',')} WHERE id=?`).run(...params); }
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(id));
});

app.delete('/api/projects/:id', (req, res) => {
  const info = db.prepare('DELETE FROM projects WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/* ─── assignments ─────────────────────────────────────────────── */
app.get('/api/assignments', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  res.json(db.prepare(`
    SELECT a.id, a.employee_id, a.project_id, a.year, a.month, a.week, a.percentage,
           p.code AS project_code, p.name AS project_name, p.color AS project_color,
           COALESCE(p.account_name, p.client, p.name) AS account_name
      FROM assignments a JOIN projects p ON p.id=a.project_id
     WHERE ${FISCAL_WHERE}
  `).all(...fiscalParams(fy)));
});

app.post('/api/assignments', (req, res) => {
  const { employee_id, project_id, year, month, week, percentage } = req.body || {};
  if (!employee_id || !project_id || !year || !month || !week) return res.status(400).json({ error: 'missing fields' });
  if (month < 1 || month > 12 || week < 1 || week > 4) return res.status(400).json({ error: 'invalid month/week' });
  const info = db.prepare('INSERT INTO assignments(employee_id,project_id,year,month,week,percentage) VALUES(?,?,?,?,?,?)')
    .run(employee_id, project_id, year, month, week, safeNum(percentage, 0));
  const row = db.prepare('SELECT a.*, p.code AS project_code, p.name AS project_name, p.color AS project_color FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.id=?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.post('/api/assignments/bulk', (req, res) => {
  const { employee_id, project_id, percentage, slots } = req.body || {};
  if (!employee_id || !project_id || !Array.isArray(slots) || !slots.length) return res.status(400).json({ error: 'missing fields' });
  const pct = safeNum(percentage, 0);
  const ins = db.prepare('INSERT INTO assignments(employee_id,project_id,year,month,week,percentage) VALUES(?,?,?,?,?,?)');
  const txn = db.transaction(arr => {
    let n = 0;
    for (const s of arr) {
      const y = safeNum(s.year, 0), m = safeNum(s.month, 0), w = safeNum(s.week, 0);
      if (!y || m < 1 || m > 12 || w < 1 || w > 4) continue;
      ins.run(employee_id, project_id, y, m, w, pct); n++;
    }
    return n;
  });
  res.status(201).json({ created: txn(slots) });
});

app.put('/api/assignments/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM assignments WHERE id=?').get(id)) return res.status(404).json({ error: 'not found' });
  const fields = ['employee_id', 'project_id', 'year', 'month', 'week', 'percentage'];
  const updates = [], params = [];
  for (const f of fields) if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) { updates.push(`${f}=?`); params.push(req.body[f]); }
  if (updates.length) { params.push(id); db.prepare(`UPDATE assignments SET ${updates.join(',')} WHERE id=?`).run(...params); }
  const row = db.prepare('SELECT a.*, p.code AS project_code, p.name AS project_name, p.color AS project_color FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.id=?').get(id);
  res.json(row);
});


app.post('/api/assignments/:id/reschedule', (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT id FROM assignments WHERE id=?').get(id);
  if (!old) return res.status(404).json({ error: 'not found' });

  const { employee_id, project_id, percentage, slots } = req.body || {};
  if (!employee_id || !project_id || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const validSlots = slots
    .map(s => ({ year: safeNum(s.year, 0), month: safeNum(s.month, 0), week: safeNum(s.week, 0) }))
    .filter(s => s.year && s.month >= 1 && s.month <= 12 && s.week >= 1 && s.week <= 4);

  if (!validSlots.length) return res.status(400).json({ error: 'invalid date range' });

  const pct = safeNum(percentage, 0);
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM assignments WHERE id=?').run(id);
    const ins = db.prepare('INSERT INTO assignments(employee_id,project_id,year,month,week,percentage) VALUES(?,?,?,?,?,?)');
    let created = 0;
    for (const s of validSlots) {
      ins.run(employee_id, project_id, s.year, s.month, s.week, pct);
      created++;
    }
    return created;
  });

  res.json({ ok: true, deleted: id, created: txn() });
});

app.delete('/api/assignments/:id', (req, res) => {
  const info = db.prepare('DELETE FROM assignments WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});


/* ─── Time Sheet saved summary ────────────────────────────────── */
app.get('/api/timesheet-summary', (_, res) => {
  const rows = db.prepare(`
    SELECT
      month,
      worker,
      work_type AS workType,
      project_name AS projectName,
      qty,
      source_file,
      sheet_name,
      updated_at
    FROM timesheet_entries
    ORDER BY month, worker, work_type, project_name
  `).all();

  const meta = db.prepare(`
    SELECT source_file, sheet_name, updated_at
    FROM timesheet_entries
    ORDER BY datetime(updated_at) DESC
    LIMIT 1
  `).get();

  const months = db.prepare(`
    SELECT DISTINCT month
    FROM timesheet_entries
    ORDER BY month
  `).all().map(r => r.month);

  const totalHours = rows.reduce((sum, r) => sum + safeNum(r.qty, 0), 0);

  res.json({
    rows,
    months,
    total_hours: +totalHours.toFixed(2),
    last_source_file: meta?.source_file || '',
    last_sheet_name: meta?.sheet_name || '',
    last_updated_at: meta?.updated_at || '',
  });
});

app.post('/api/timesheet-summary/bulk', (req, res) => {
  const body = req.body || {};
  const fileName = cleanText(body.fileName || body.file_name || '');
  const sheetName = cleanText(body.sheetName || body.sheet_name || '');
  const replaceMonths = body.replaceMonths !== false;
  const rows = normalizeTimesheetPayloadRows(body.rows || []);

  if (!rows.length) {
    return res.status(400).json({
      error: 'No valid Time Sheet rows received.',
    });
  }

  const uploadedMonths = [...new Set(rows.map(r => r.month).filter(Boolean))];

  const delByMonth = db.prepare(`
    DELETE FROM timesheet_entries
    WHERE month = ?
  `);

  const insertRow = db.prepare(`
    INSERT INTO timesheet_entries (
      month,
      worker,
      work_type,
      project_name,
      qty,
      source_file,
      sheet_name,
      uploaded_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(month, worker, work_type, project_name)
    DO UPDATE SET
      qty = excluded.qty,
      source_file = excluded.source_file,
      sheet_name = excluded.sheet_name,
      updated_at = CURRENT_TIMESTAMP
  `);

  const txn = db.transaction(() => {
    if (replaceMonths) {
      for (const month of uploadedMonths) {
        delByMonth.run(month);
      }
    }

    let savedRows = 0;

    for (const r of rows) {
      insertRow.run(
        r.month,
        r.worker,
        r.workType,
        r.projectName,
        r.qty,
        fileName,
        sheetName
      );
      savedRows++;
    }

    return savedRows;
  });

  const savedRows = txn();
  const totalHours = rows.reduce((sum, r) => sum + safeNum(r.qty, 0), 0);

  res.status(201).json({
    ok: true,
    saved_rows: savedRows,
    replaced_months: replaceMonths ? uploadedMonths : [],
    month_count: uploadedMonths.length,
    total_hours: +totalHours.toFixed(2),
  });
});

app.delete('/api/timesheet-summary', (_, res) => {
  const info = db.prepare('DELETE FROM timesheet_entries').run();

  res.json({
    ok: true,
    deleted_rows: info.changes,
  });
});

/* ─── dashboard stats ─────────────────────────────────────────── */
app.get('/api/dashboard/stats', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());

  const activeEmployees = db.prepare('SELECT COUNT(*) AS c FROM employees WHERE COALESCE(active,1)=1').get().c;
  const activeProjects = db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE stage != 'Closed Won'`).get().c;
  const assignedProjects = db.prepare(`SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE ${FISCAL_WHERE}`).get(...fiscalParams(fy)).c;

  // Avg utilization = average across active employees of (their weighted slots / 48 FY weeks * 100)
  const TOTAL_FY_WEEKS = 48;
  const utilRows = db.prepare(`
    SELECT COALESCE(SUM(a.percentage / 100.0), 0) AS weighted_slots
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id = e.id
        AND ((a.year = ? AND a.month >= 4) OR (a.year = ? AND a.month <= 3))
     WHERE COALESCE(e.active,1)=1
     GROUP BY e.id
  `).all(...fiscalParams(fy));
  const activeCount = utilRows.length || 1;
  avgUtil = utilRows.reduce((s, r) => s + Math.min(r.weighted_slots / TOTAL_FY_WEEKS * 100, 100), 0) / activeCount;

  const psCount = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE dept='Professional Services' AND COALESCE(active,1)=1`).get().c || 1;
  const productivity = psCount > 0 ? +(avgUtil / psCount).toFixed(2) : 0;
  const onTime = db.prepare(`SELECT ROUND(100.0*SUM(CASE WHEN progress>=80 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS v FROM projects`).get().v || 0;

  const now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1;
  const prevM = curM === 1 ? 12 : curM - 1, prevY = curM === 1 ? curY - 1 : curY;
  const curMStr = String(curM).padStart(2, '0');

  const asgCur = db.prepare('SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE year=? AND month=?').get(curY, curM).c;
  const asgPrev = db.prepare('SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE year=? AND month=?').get(prevY, prevM).c;
  const asgDelta = asgCur - asgPrev;

  const utilCur = db.prepare('SELECT AVG(wt) AS u FROM (SELECT SUM(percentage) AS wt FROM assignments WHERE year=? AND month=? GROUP BY employee_id,week)').get(curY, curM).u || 0;
  const utilPrev = db.prepare('SELECT AVG(wt) AS u FROM (SELECT SUM(percentage) AS wt FROM assignments WHERE year=? AND month=? GROUP BY employee_id,week)').get(prevY, prevM).u || 0;
  const utilDelta = +(utilCur - utilPrev).toFixed(1);

  const newEmps = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;
  const newProjs = db.prepare(`SELECT COUNT(*) AS c FROM projects  WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;

  const prodDelta = psCount > 0 ? +(utilDelta / psCount).toFixed(2) : 0;
  const onTimeDelta = +(onTime - (db.prepare('SELECT ROUND(100.0*SUM(CASE WHEN progress>=75 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS v FROM projects').get().v || 0)).toFixed(1);

  const sign = n => n >= 0 ? `+${n}` : `${n}`;
  const signF = n => n >= 0 ? `+${n}%` : `${n}%`;

  res.json({
    active_employees: activeEmployees,
    active_projects: activeProjects,
    avg_utilization: +avgUtil.toFixed(1),
    assigned_projects: assignedProjects,
    productivity,
    ps_count: psCount,
    on_time_pct: onTime,
    trends: {
      employees: { value: newEmps > 0 ? `+${newEmps} this month` : 'No change', up: newEmps >= 0 },
      projects: { value: newProjs > 0 ? `+${newProjs} new` : 'No new this month', up: newProjs >= 0 },
      utilization: { value: `${signF(utilDelta)} vs last month`, up: utilDelta >= 0 },
      assigned_projects: { value: `${sign(asgDelta)} vs last month`, up: asgDelta >= 0 },
      productivity: { value: `${sign(prodDelta)} vs last month`, up: prodDelta >= 0 },
      on_time: { value: `${signF(onTimeDelta)} vs last month`, up: onTimeDelta >= 0 },
    },
  });
});

app.get('/api/dashboard/trends', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const months = fiscalMonths(fy);
  const data = months.map(({ year, month }) => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE year=? AND month=?').get(year, month).c;
    const util = db.prepare('SELECT AVG(w) AS u FROM (SELECT SUM(percentage) AS w FROM assignments WHERE year=? AND month=? GROUP BY employee_id,week)').get(year, month).u || 0;
    const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
    return { label, year, month, assignments: count, utilization: +util.toFixed(1) };
  });
  res.json(data);
});

app.get('/api/dashboard/workload', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  res.json(db.prepare(`
    SELECT e.dept, COUNT(a.id) AS assignment_count
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id=e.id
        AND ((a.year=? AND a.month>=4) OR (a.year=? AND a.month<=3))
     WHERE COALESCE(e.active,1)=1 GROUP BY e.dept ORDER BY assignment_count DESC
  `).all(...fiscalParams(fy)));
});

app.get('/api/dashboard/utilization', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  // Utilization = sum(percentage/100 per slot) / TOTAL_FY_WEEKS * 100
  // TOTAL_FY_WEEKS = 48 (12 months × 4 weeks per month)
  const TOTAL_FY_WEEKS = 48;
  const rows = db.prepare(`
    SELECT e.id, e.name, e.dept,
           COALESCE(SUM(a.percentage / 100.0), 0) AS weighted_slots
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id = e.id
        AND ((a.year = ? AND a.month >= 4) OR (a.year = ? AND a.month <= 3))
     WHERE COALESCE(e.active,1)=1
     GROUP BY e.id ORDER BY weighted_slots ASC
  `).all(...fiscalParams(fy));
  const cleaned = rows.map(r => ({
    id: r.id, name: r.name, dept: r.dept,
    utilization: +Math.min((r.weighted_slots / TOTAL_FY_WEEKS * 100), 100).toFixed(1)
  }));
  res.json({ all: cleaned, top_available: cleaned.slice(0, 5), high_workload: [...cleaned].reverse().slice(0, 5) });
});

app.get('/api/dashboard/pipeline', (_, res) => {
  const rows = db.prepare(`SELECT stage,COUNT(*) AS count,SUM(budget) AS total_budget,AVG(progress) AS avg_progress FROM projects GROUP BY stage`).all();
  const order = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won'];
  rows.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  res.json(rows);
});

/* Running Projects: All Closed Won projects from Jan 1 two years before current year */
app.get('/api/dashboard/deadlines', (_, res) => {
  const today = new Date();
  const runningProjectCutoff = getRunningProjectCutoffDate();

  const rows = db.prepare(`
    SELECT id, code, name, end_date, project_closing_date, product_name, product_family,
           progress, priority, opp_amount, product_amount, account_name, stage, color, opportunity_owner
      FROM projects
     WHERE stage = 'Closed Won'
       AND end_date >= ?
       AND UPPER(COALESCE(product_name,'')) NOT LIKE '%PERSONAL USE%'
       AND UPPER(COALESCE(product_name,'')) NOT LIKE '%STUDENT USE%'
     ORDER BY CASE
       WHEN project_closing_date IS NOT NULL AND project_closing_date != '' THEN project_closing_date
       ELSE COALESCE(end_date, '9999-12-31')
     END ASC
  `).all(runningProjectCutoff);

  const allProjects = db.prepare('SELECT id, code, name, account_name, client, end_date, stage, product_name FROM projects').all();
  const statusMap = calcDealStatuses(allProjects);

  const enriched = rows.map(r => {
    const closingDate = r.project_closing_date || r.end_date;
    const days = closingDate ? Math.round((new Date(closingDate) - today) / 864e5) : null;
    const status = days === null ? '—' : days < 0 ? 'Overdue' : days < 14 ? 'Due Soon' : 'On Track';
    return { ...r, closing_date: closingDate, days, status, deal_status: statusMap[r.id] || 'NEW LOGO' };
  });
  res.json(enriched);
});


/* ─── New Logo bar chart data ─────────────────────────────────── */
app.get('/api/dashboard/new-logo-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, account_name, client, end_date, stage, product_name, product_family FROM projects'
  ).all();

  const CATEGORIES = ['ALL', 'ALLCLEAN', 'SOFTWARE', 'PS', 'PERSONAL', 'STUDENT'];

  /*
   * For each category:
   *   1. Filter projects to only those matching the category
   *   2. Compute NEW LOGO / REPEAT / REACTIVE independently within that subset
   *   3. Build FY counts and project lists with the canonical-status dedup:
   *      - One bar count per unique account per FY
   *      - Canonical status = status of the FIRST SA code for that account in that FY
   *      - Project list: one entry per (account + product_category) per FY per status
   */
  const buildChartForCategory = (cat) => {
    const subset = allProjects.filter(p => p.stage === 'Closed Won' && matchesCategory(p, cat));
    const statusMap = calcDealStatusesForSubset(subset);

    // Sort chronologically
    const cwSorted = subset
      .filter(p => p.end_date)
      .sort((a, b) => {
        if (a.end_date < b.end_date) return -1;
        if (a.end_date > b.end_date) return 1;
        return a.id - b.id;
      });

    const acctFYStatus = {}; // [acctKey][fy] = canonical status (locked to first SA code)
    const fySeenCombo = {}; // [fy][status] = Set of "acctKey|prodCat"
    const fyAcctSeen = {}; // [fy] = Set of acctKey
    const fyData = {};
    const fyProjects = {};

    for (const p of cwSorted) {
      const fy = getFiscalYear(p.end_date);
      if (fy === null) continue;
      const acctKey = (p.account_name || p.client || '').trim().toLowerCase();
      const acctDisp = (p.account_name || p.client || p.name || p.code || 'Unknown').trim();
      const prodName = (p.product_name || '').trim();
      const prodFam = (p.product_family || '').trim();
      const prodCat = productCategory(prodName, prodFam);

      // Canonical status: locked to first SA code for this account in this FY
      if (!acctFYStatus[acctKey]) acctFYStatus[acctKey] = {};
      if (!(fy in acctFYStatus[acctKey])) {
        acctFYStatus[acctKey][fy] = statusMap[p.id] || 'NEW LOGO';
      }
      const st = acctFYStatus[acctKey][fy];

      if (!fyData[fy]) fyData[fy] = { 'NEW LOGO': 0, 'REPEAT': 0, 'REACTIVE': 0 };
      if (!fyProjects[fy]) fyProjects[fy] = { 'NEW LOGO': [], 'REPEAT': [], 'REACTIVE': [] };
      if (!fySeenCombo[fy]) fySeenCombo[fy] = { 'NEW LOGO': new Set(), 'REPEAT': new Set(), 'REACTIVE': new Set() };
      if (!fyAcctSeen[fy]) fyAcctSeen[fy] = new Set();

      // Bar count: once per unique account per FY
      if (!fyAcctSeen[fy].has(acctKey)) {
        fyData[fy][st]++;
        fyAcctSeen[fy].add(acctKey);
      }

      // Project list: once per (account + prodCat) per FY per status
      const combo = acctKey + '|' + prodCat;
      if (!fySeenCombo[fy][st].has(combo)) {
        fySeenCombo[fy][st].add(combo);
        fyProjects[fy][st].push({
          name: acctDisp,
          code: (p.code || '').trim(),
          opp_name: (p.name || '').trim(),
          product_name: prodName,
          product_family: prodFam,
        });
      }
    }

    return Object.entries(fyData)
      .sort((a, b) => +a[0] - +b[0])
      .map(([fy, c]) => ({
        fy: +fy,
        label: fyLabel(+fy),
        'NEW LOGO': c['NEW LOGO'],
        'REPEAT': c['REPEAT'],
        'REACTIVE': c['REACTIVE'],
        projects: {
          'NEW LOGO': (fyProjects[+fy]?.['NEW LOGO'] || []).sort((a, b) => a.name.localeCompare(b.name)),
          'REPEAT': (fyProjects[+fy]?.['REPEAT'] || []).sort((a, b) => a.name.localeCompare(b.name)),
          'REACTIVE': (fyProjects[+fy]?.['REACTIVE'] || []).sort((a, b) => a.name.localeCompare(b.name)),
        }
      }));
  };

  // Build chart data for all categories in one request
  const result = {};
  for (const cat of CATEGORIES) {
    result[cat] = buildChartForCategory(cat);
  }

  res.json(result);
});

/* ─── Chart 3: PS Support vs PS Implementation count per FY ── */
app.get('/api/dashboard/ps-type-chart', (_, res) => {
  const rows = db.prepare(`
    SELECT end_date, product_name, name, code, stage
    FROM projects
    WHERE stage = 'Closed Won'
      AND product_name IS NOT NULL
      AND product_name != ''
  `).all();

  const fyData = {};
  for (const r of rows) {
    const fy = getFiscalYear(r.end_date);
    if (fy === null) continue;
    const pn = (r.product_name || '').trim().toUpperCase();
    const isSupport = pn.includes('PS SYSTEM SUPPORT');
    const isImpl = pn.includes('PS PROJECT IMPLEMENTATION') || pn.includes('PS PROJECT IMPLEMETATION');
    if (!isSupport && !isImpl) continue;
    if (!fyData[fy]) fyData[fy] = { support: 0, impl: 0, supportProjects: [], implProjects: [] };
    const projName = (r.name || r.code || 'Unknown').trim();
    if (isSupport) { fyData[fy].support++; fyData[fy].supportProjects.push(projName); }
    if (isImpl) { fyData[fy].impl++; fyData[fy].implProjects.push(projName); }
  }

  const result = Object.entries(fyData)
    .sort((a, b) => +a[0] - +b[0])
    .map(([fy, d]) => ({
      fy: +fy,
      label: fyLabel(+fy),
      support: d.support,
      impl: d.impl,
      supportProjects: d.supportProjects.sort(),
      implProjects: d.implProjects.sort(),
    }));

  res.json(result);
});

/* ─── misc ─────────────────────────────────────────────────────── */
app.get('/api/fiscal-years', (_, res) => {
  const rows = db.prepare(`SELECT DISTINCT CASE WHEN month>=4 THEN year ELSE year-1 END AS fiscal_year FROM assignments ORDER BY fiscal_year ASC`).all();
  res.json(rows.map(r => r.fiscal_year));
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: err.message }); });
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Workforce Dashboard running at http://localhost:${PORT}`));