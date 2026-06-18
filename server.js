/**
 * server.js — Express API for Workforce Allocation Dashboard
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { getDb, createSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 9002;

const db = getDb();
createSchema(db);

/* ─── migrations ──────────────────────────────────────────────── */
// Add 'active' column to employees if it doesn't exist yet
try {
  db.prepare("ALTER TABLE employees ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run();
} catch (_) { /* column already exists — safe to ignore */ }

// Add Salesforce Fiscal Period to projects if it does not exist yet.
// Chart grouping uses this value first, with Close Date as fallback.
try {
  db.prepare("ALTER TABLE projects ADD COLUMN fiscal_period TEXT").run();
} catch (_) { /* column already exists — safe to ignore */ }
try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_fiscal_period ON projects(fiscal_period)').run();
} catch (_) { /* safe to ignore */ }

// Source Excel row number / import sequence for safer backup-restore after full project replacement.
try {
  db.prepare("ALTER TABLE projects ADD COLUMN import_row_no INTEGER").run();
} catch (_) { /* column already exists — safe to ignore */ }
try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_import_row_no ON projects(import_row_no)').run();
} catch (_) { /* safe to ignore */ }


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
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_import_key ON projects(code, product_name)').run();
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
app.use(express.urlencoded({ extended: false }));
app.set('trust proxy', 1);

/* ─── password protection ─────────────────────────────────────── */
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Esr!@9122';
const AUTH_COOKIE_NAME = 'wa_auth';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const AUTH_SECRET = process.env.DASHBOARD_AUTH_SECRET ||
  crypto.createHash('sha256').update(`${DASHBOARD_PASSWORD}:${__dirname}`).digest('hex');

function parseCookies(header = '') {
  return String(header || '')
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return acc;
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      acc[key] = decodeURIComponent(val);
      return acc;
    }, {});
}

function signAuthPayload(payload) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
}

function createAuthToken() {
  const expiresAt = Date.now() + AUTH_MAX_AGE_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = signAuthPayload(payload);
  return `${payload}.${signature}`;
}

function isValidAuthToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = signAuthPayload(payload);
  const sigBuffer = Buffer.from(signature || '', 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return isValidAuthToken(cookies[AUTH_COOKIE_NAME]);
}

function cookieSecureFlag(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || proto === 'https' ? '; Secure' : '';
}

function sendLoginPage(res, errorMessage = '') {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Login — Workforce Allocation Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
      overflow: hidden;
    }
    .head {
      padding: 28px 30px 18px;
      border-bottom: 1px solid #f1f5f9;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .icon {
      width: 42px; height: 42px; border-radius: 13px;
      background: #2563eb; color: #fff; display: grid; place-items: center;
      font-weight: 800;
    }
    h1 { margin: 0; font-size: 19px; line-height: 1.2; }
    p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
    form { padding: 24px 30px 30px; }
    label { display: block; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 8px; }
    input {
      width: 100%; height: 44px; border: 1px solid #cbd5e1; border-radius: 10px;
      padding: 0 12px; font-size: 14px; outline: none;
    }
    input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
    button {
      width: 100%; height: 44px; margin-top: 18px; border: 0; border-radius: 10px;
      background: #2563eb; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    .error {
      margin-top: 12px; padding: 10px 12px; border-radius: 10px;
      background: #fef2f2; color: #b91c1c; font-size: 13px; font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="brand">
        <div class="icon">▦</div>
        <div>
          <h1>Workforce Allocation Dashboard</h1>
          <p>Password required</p>
        </div>
      </div>
    </div>
    <form method="post" action="/login" autocomplete="off">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autofocus required />
      ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`);
}

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/');
  return sendLoginPage(res);
});

app.post('/login', (req, res) => {
  const password = String(req.body?.password || '');

  if (password !== DASHBOARD_PASSWORD) {
    return sendLoginPage(res.status(401), 'Incorrect password.');
  }

  const token = createAuthToken();
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${AUTH_MAX_AGE_SECONDS}${cookieSecureFlag(req)}`
  );

  return res.redirect('/');
});

app.post('/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecureFlag(req)}`
  );
  return res.redirect('/login');
});

function requireDashboardAuth(req, res, next) {
  if (isAuthenticated(req)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  return res.redirect('/login');
}

app.use(requireDashboardAuth);
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

function normalizeFiscalPeriod(value) {
  const raw = cleanText(value);
  if (!raw) return '';

  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const quarterMatch = compact.match(/^Q([1-4])[-/\\]?(\d{4})$/);
  if (quarterMatch) return `Q${quarterMatch[1]}-${quarterMatch[2]}`;

  const fyMatch = compact.match(/^FY[-/\\]?(\d{4})$/);
  if (fyMatch) return `FY-${fyMatch[1]}`;

  const yearMatch = compact.match(/^(\d{4})$/);
  if (yearMatch) return `FY-${yearMatch[1]}`;

  return raw;
}

function getFiscalYearFromPeriod(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const quarterMatch = compact.match(/^Q[1-4][-/\\]?(\d{4})$/);
  if (quarterMatch) return Number(quarterMatch[1]);

  const fyMatch = compact.match(/^FY[-/\\]?(\d{4})$/);
  if (fyMatch) return Number(fyMatch[1]);

  const yearMatch = compact.match(/^(\d{4})$/);
  if (yearMatch) return Number(yearMatch[1]);

  return null;
}

function getProjectFiscalYear(project) {
  // Dashboard chart fiscal year must be calculated from the Excel Fiscal Period only.
  // Example: Q1-2025, Q2-2025, Q3-2025, Q4-2025 all group under FY 2025.
  // Close Date / Closed Won Date is intentionally NOT used as fallback here.
  return getFiscalYearFromPeriod(project?.fiscal_period);
}

function fiscalSortValue(project) {
  const fy = getProjectFiscalYear(project);
  if (fy === null) return 999999;

  const period = String(project?.fiscal_period || '').toUpperCase().replace(/\s+/g, '');
  const quarterMatch = period.match(/^Q([1-4])[-/\\]?\d{4}$/);
  const quarter = quarterMatch ? Number(quarterMatch[1]) : 9;
  return fy * 10 + quarter;
}

function fyLabel(fy) { return `FY ${fy}`; }

/**
 * productCategory — classifies a project into a category bucket.
 * Same logic used in app.js classifyProduct.
 */
function productCategory(prodName, prodFamily, projectName = '') {
  const n = (prodName || '').toUpperCase();
  const fallback = (projectName || '').toUpperCase();
  const text = n || fallback;
  const f = (prodFamily || '').toUpperCase();
  if (text.includes('PERSONAL USE')) return 'PERSONAL';
  if (text.includes('STUDENT USE')) return 'STUDENT';
  if (f === 'PROFESSIONAL SERVICES' || text.includes('PS SYSTEM SUPPORT') || text.includes('PS PROJECT IMPLEMENT')) return 'PS';
  if (f === 'SOFTWARE') return 'SOFTWARE';
  if (text.includes('LICENSE') || text.includes('RENEW') || text.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
  return 'OTHER';
}

function getRevenueAmount(project) {
  const productAmount = safeNum(project?.product_amount, 0);
  if (productAmount > 0) return productAmount;

  // Some historical rows do not have Product Amount/Product Name.
  // In that case, use Opportunity Amount / Amount for revenue calculations.
  return safeNum(project?.opp_amount ?? project?.budget, 0);
}

function getProductText(project) {
  return String(project?.product_name || project?.name || '').toUpperCase();
}

function isPSRevenueProject(project) {
  const family = String(project?.product_family || '').toUpperCase();
  const text = getProductText(project);

  return family === 'PROFESSIONAL SERVICES' ||
    text.includes('PS SYSTEM SUPPORT') ||
    text.includes('PS PROJECT IMPLEMENT');
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
  const text = getProductText(p);
  const f = (p.product_family || '').toUpperCase();
  const isPersonal = text.includes('PERSONAL USE');
  const isStudent = text.includes('STUDENT USE');
  const isPS = isPSRevenueProject(p);

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
    .filter(p => p.stage === 'Closed Won' && getProjectFiscalYear(p) !== null)
    .map(p => ({ ...p, fy: getProjectFiscalYear(p) }))
    .sort((a, b) => {
      if (a.fy !== b.fy) return a.fy - b.fy;
      const fiscalDiff = fiscalSortValue(a) - fiscalSortValue(b);
      if (fiscalDiff !== 0) return fiscalDiff;
      if ((a.end_date || '') !== (b.end_date || '')) {
        return String(a.end_date || '').localeCompare(String(b.end_date || ''));
      }
      return a.id - b.id;
    });

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
    const fy = getProjectFiscalYear(p) || new Date().getFullYear();
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

function normImportAmountKey(v) {
  const n = normalizeImportNumber(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}


const PROJECT_COLOR_PALETTE = [
  '#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1',
  '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308',
  '#22C55E', '#3B82F6', '#D946EF', '#EF4444', '#F97316', '#65A30D',
  '#0891B2', '#7C3AED', '#DB2777', '#0D9488', '#4F46E5', '#CA8A04',
  '#FDE68A', '#FEF3C7', '#FCD34D', '#FBBF24', '#FCA5A5', '#FECACA',
  '#FDBA74', '#FED7AA', '#BBF7D0', '#86EFAC', '#A7F3D0', '#5EEAD4',
  '#BAE6FD', '#7DD3FC', '#C4B5FD', '#DDD6FE', '#FBCFE8', '#F9A8D4',
  '#E9D5FF', '#D8B4FE', '#BFDBFE', '#93C5FD', '#D9F99D', '#BEF264',
  '#E5E7EB', '#CBD5E1', '#94A3B8', '#64748B'
];

function hslToHex(h, s, l) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, Number(s))) / 100;
  const light = Math.max(0, Math.min(100, Number(l))) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = light - c / 2;
  let r = 0, g = 0, b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function projectColorForIndex(index) {
  const i = Math.max(0, Math.trunc(Number(index) || 0));
  if (i < PROJECT_COLOR_PALETTE.length) return PROJECT_COLOR_PALETTE[i];

  // Golden-angle hue distribution. The color is still HEX so existing
  // chip transparency logic like `${color}20` remains valid.
  const hue = (i * 137.508) % 360;
  const saturation = 72;
  const lightness = i % 2 === 0 ? 46 : 56;
  return hslToHex(hue, saturation, lightness);
}

function assignUniqueProjectColors(projectIds = null) {
  const rows = projectIds && projectIds.length
    ? db.prepare(`SELECT id FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')}) ORDER BY id`).all(...projectIds)
    : db.prepare('SELECT id FROM projects ORDER BY id').all();

  if (!rows.length) return 0;

  const update = db.prepare('UPDATE projects SET color=? WHERE id=?');
  const txn = db.transaction(items => {
    let n = 0;
    items.forEach((row, idx) => {
      update.run(projectColorForIndex(idx), row.id);
      n++;
    });
    return n;
  });

  return txn(rows);
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
  // Full replacement import: keep every valid Excel row.
  // No de-duplication is applied. If the Excel contains duplicate
  // Opportunity Number / Product Name rows, those duplicate rows are inserted.
  const out = [];

  for (const [idx, raw] of (rows || []).entries()) {
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
    const fiscalPeriod = normalizeFiscalPeriod(
      raw.fiscal_period ||
      raw['Fiscal Period'] ||
      raw.fiscal_year ||
      raw['Fiscal Year']
    );

    out.push({
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
      fiscal_period: fiscalPeriod,
      product_amount: +productAmount.toFixed(2),
      opp_amount: +oppAmount.toFixed(2),
      budget: +oppAmount.toFixed(2),
      spent_pct: 0,
      progress: 0,
      color: projectColorForIndex(out.length),
      priority: 'Medium',
      project_closing_date: null,
      import_row_no: Math.trunc(normalizeImportNumber(raw.source_row ?? raw.import_row_no ?? raw['Source Row'] ?? raw['Excel Row'])) || idx + 2,
    });
  }

  return out;
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


/* ─── Revenue chart — grouped strictly by Fiscal Period ───────── */
app.get('/api/dashboard/ps-revenue-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, end_date, fiscal_period, product_amount, opp_amount, budget, product_name, product_family, account_name, client, stage FROM projects'
  ).all();

  const CATEGORIES = ['ALL', 'ALLCLEAN', 'SOFTWARE', 'PS', 'PERSONAL', 'STUDENT'];

  const buildRevenueForCategory = (cat) => {
    const subset = allProjects.filter(p =>
      p.stage === 'Closed Won' && getProjectFiscalYear(p) !== null && matchesCategory(p, cat)
    );

    const fyData = {};
    for (const r of subset) {
      const fy = getProjectFiscalYear(r);
      if (fy === null) continue;
      if (!fyData[fy]) fyData[fy] = { total: 0, ps: 0, allProjects: [], psProjects: [] };

      // Revenue amount rule:
      // 1) Use Product Amount when available.
      // 2) If Product Amount is blank/zero, use Opportunity Amount / Amount.
      // This protects historical rows that have no Product Name.
      const amount = getRevenueAmount(r);
      fyData[fy].total += amount;
      fyData[fy].allProjects.push({
        name: r.name || r.code,
        code: r.code,
        amount,
        product_name: r.product_name || '',
        product_family: r.product_family || '—',
        fiscal_period: r.fiscal_period || '',
        amount_source: safeNum(r.product_amount, 0) > 0 ? 'Product Amount' : 'Amount',
      });

      // PS Amount follows the same amount rule, but only for Professional Services rows.
      // If Product Name is missing, Product Family = Professional Services is enough
      // to classify the row as PS revenue.
      if (isPSRevenueProject(r)) {
        fyData[fy].ps += amount;
        fyData[fy].psProjects.push({
          name: r.name || r.code,
          code: r.code,
          amount,
          product_name: r.product_name || '',
          product_family: r.product_family || '—',
          fiscal_period: r.fiscal_period || '',
          amount_source: safeNum(r.product_amount, 0) > 0 ? 'Product Amount' : 'Amount',
        });
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
  'created_date', 'fiscal_period', 'project_closing_date',
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
        created_date,fiscal_period,project_closing_date,import_row_no)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.code, b.name, b.client || b.account_name || null,
      safeNum(b.budget ?? b.opp_amount, 0), safeNum(b.spent_pct, 0),
      b.end_date || null, b.stage || 'Prospect', safeNum(b.progress, 0),
      b.color || projectColorForIndex(db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0), b.priority || 'Medium',
      safeNum(b.product_amount, 0), b.account_name || null, b.product_name || null,
      b.product_family || null,
      b.opportunity_owner || null, safeNum(b.opp_amount, 0), safeNum(b.probability, 0),
      b.created_date || null, normalizeFiscalPeriod(b.fiscal_period) || null, b.project_closing_date || null, null
    );
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'project code must be unique' });
    throw e;
  }

});

app.post('/api/projects/import', (req, res) => {
  const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const rows = normalizeImportedProjectRows(incomingRows);

  if (!rows.length) {
    return res.status(400).json({ error: 'No valid project rows found in uploaded Excel.' });
  }

  const beforeProjectCount = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c || 0;
  const beforeAssignmentCount = db.prepare('SELECT COUNT(*) AS c FROM assignments').get().c || 0;

  const insertProject = db.prepare(`
    INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
      product_amount,account_name,product_name,product_family,opportunity_owner,opp_amount,probability,
      created_date,fiscal_period,project_closing_date,import_row_no)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const inserted = [];
  const failed = [];
  let deletedProjectCount = 0;
  let deletedAssignmentCount = 0;

  const txn = db.transaction(() => {
    // Full replacement mode:
    // Project IDs are regenerated from the uploaded Excel. Existing assignments
    // reference old project IDs, so they must be removed to avoid orphaned data.
    const deletedAssignments = db.prepare('DELETE FROM assignments').run();
    deletedAssignmentCount = deletedAssignments.changes || 0;

    const deletedProjects = db.prepare('DELETE FROM projects').run();
    deletedProjectCount = deletedProjects.changes || 0;

    // Reset autoincrement counters when sqlite_sequence exists.
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('projects', 'assignments')").run();
    } catch (_) { /* sqlite_sequence may not exist in older DBs */ }

    for (const p of rows) {
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
          p.fiscal_period || null,
          p.project_closing_date || null,
          p.import_row_no || null
        );

        inserted.push({
          id: info.lastInsertRowid,
          code: p.code,
          name: p.name,
          product_name: p.product_name,
          product_amount: p.product_amount,
          fiscal_period: p.fiscal_period,
          import_row_no: p.import_row_no || null,
        });
      } catch (e) {
        failed.push({
          code: p.code,
          name: p.name,
          product_name: p.product_name,
          product_amount: p.product_amount,
          fiscal_period: p.fiscal_period,
          import_row_no: p.import_row_no || null,
          error: e.message,
          reason: e.message || 'Database insert failed.',
        });
      }
    }
  });

  txn();

  const recoloredProjectCount = assignUniqueProjectColors();

  res.status(201).json({
    ok: true,
    mode: 'replace_all_projects',
    parsed_rows: incomingRows.length,
    project_rows_ready: rows.length,
    before_project_count: beforeProjectCount,
    before_assignment_count: beforeAssignmentCount,
    deleted_project_count: deletedProjectCount,
    deleted_assignment_count: deletedAssignmentCount,
    inserted_count: inserted.length,
    recolored_project_count: recoloredProjectCount,
    skipped_existing_count: 0,
    updated_existing_count: 0,
    failed_count: failed.length,
    inserted,
    import_behavior: 'No project de-duplication. Every valid Excel row is inserted, including duplicate rows. Each imported project receives a unique chart color.',
    skipped_existing: [],
    failed: failed.map(p => ({
      ...p,
      reason: p.reason || p.error || 'Database insert failed.',
    })),
    note: 'Existing project rows were deleted and replaced by the uploaded Excel. Existing assignments were also deleted because they referenced old project IDs. Use Bulk Assign Assignment to restore assignments from backup Excel.',
  });
});

app.put('/api/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) return res.status(404).json({ error: 'not found' });
  const updates = [], params = [];
  for (const f of PROJECT_FIELDS) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f}=?`);
      params.push(f === 'fiscal_period' ? (normalizeFiscalPeriod(req.body[f]) || null) : req.body[f]);
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


app.post('/api/assignments/import', (req, res) => {
  const body = req.body || {};
  const fiscalYear = Math.trunc(safeNum(body.fiscalYear, new Date().getFullYear()));
  const replaceFiscalYear = body.replaceFiscalYear !== false;
  const rows = normalizeAssignmentImportRows(body.rows || []);

  if (!rows.length) {
    return res.status(400).json({ error: 'No valid assignment rows found in uploaded Excel.' });
  }

  const { resolveEmployee, resolveProject } = buildAssignmentImportResolvers();

  const toInsert = [];
  const skipped = [];

  for (const row of rows) {
    if (!row.employee_code && !row.employee_name) {
      skipped.push({ ...row, reason: 'Missing Resource ID/Resource Name.' });
      continue;
    }

    if (!row.project_code && !row.project_name) {
      skipped.push({ ...row, reason: 'Missing Opportunity Number/Project Name.' });
      continue;
    }

    if (!row.year || row.month < 1 || row.month > 12 || row.week < 1 || row.week > 4) {
      skipped.push({ ...row, reason: 'Invalid Year, Month Number, or Week.' });
      continue;
    }

    if (row.percentage < 0) {
      skipped.push({ ...row, reason: 'Allocation percentage cannot be negative.' });
      continue;
    }

    const empResolved = resolveEmployee(row);
    if (!empResolved.employee) {
      skipped.push({ ...row, reason: empResolved.reason || 'Employee could not be resolved.' });
      continue;
    }

    const projectResolved = resolveProject(row);
    if (!projectResolved.project) {
      skipped.push({ ...row, reason: projectResolved.reason || 'Project could not be resolved.' });
      continue;
    }

    toInsert.push({
      ...row,
      employee_id: empResolved.employee.id,
      project_id: projectResolved.project.id,
      employee_code: empResolved.employee.employee_code || row.employee_code,
      employee_name: empResolved.employee.name || row.employee_name,
      project_code: projectResolved.project.code || row.project_code,
      project_name: projectResolved.project.name || row.project_name,
    });
  }

  const imported = [];
  const failed = [];
  let deletedCount = 0;

  const insertAssignment = db.prepare(`
    INSERT INTO assignments(employee_id, project_id, year, month, week, percentage)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    if (replaceFiscalYear) {
      const del = db.prepare(`
        DELETE FROM assignments
        WHERE ((year = ? AND month >= 4) OR (year = ? AND month <= 3))
      `).run(fiscalYear, fiscalYear + 1);
      deletedCount = del.changes || 0;
    }

    for (const row of toInsert) {
      try {
        const info = insertAssignment.run(
          row.employee_id,
          row.project_id,
          row.year,
          row.month,
          row.week,
          safeNum(row.percentage, 0)
        );

        imported.push({
          id: info.lastInsertRowid,
          source_row: row.source_row,
          employee_code: row.employee_code,
          employee_name: row.employee_name,
          project_id: row.project_id,
          project_code: row.project_code,
          project_name: row.project_name,
          year: row.year,
          month: row.month,
          week: row.week,
          percentage: row.percentage,
        });
      } catch (e) {
        failed.push({
          ...row,
          error: e.message,
          reason: 'Database insert failed.',
        });
      }
    }
  });

  txn();

  const recoloredProjectCount = assignUniqueProjectColors(
    [...new Set(imported.map(row => row.project_id).filter(Boolean))]
  );

  res.status(201).json({
    ok: true,
    fiscal_year: fiscalYear,
    replace_fiscal_year: replaceFiscalYear,
    received_rows: rows.length,
    deleted_count: deletedCount,
    imported_count: imported.length,
    recolored_project_count: recoloredProjectCount,
    skipped_count: skipped.length,
    failed_count: failed.length,
    imported,
    skipped,
    failed,
    restore_matching: {
      employee: 'Resource ID, then Resource Name',
      project: 'Backup row ID / old project ID first, then Opportunity Number, Project Name, Product Name, and Product Amount fallback. Duplicates are allowed; first best match is used.',
    },
  });
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

  const allProjects = db.prepare('SELECT id, code, name, account_name, client, end_date, fiscal_period, stage, product_name FROM projects').all();
  const statusMap = calcDealStatuses(allProjects);

  const enriched = rows.map(r => {
    const closingDate = r.project_closing_date || r.end_date;
    const days = closingDate ? Math.round((new Date(closingDate) - today) / 864e5) : null;
    const status = days === null ? '—' : days < 0 ? 'Overdue' : days < 14 ? 'Due Soon' : 'On Track';
    return { ...r, closing_date: closingDate, days, status, deal_status: statusMap[r.id] || 'NEW LOGO' };
  });
  res.json(enriched);
});


/* ─── New Logo bar chart data — grouped strictly by Fiscal Period ─ */
app.get('/api/dashboard/new-logo-chart', (_, res) => {
  const allProjects = db.prepare(
    'SELECT id, code, name, account_name, client, end_date, fiscal_period, stage, product_name, product_family FROM projects'
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
    const subset = allProjects.filter(p => p.stage === 'Closed Won' && getProjectFiscalYear(p) !== null && matchesCategory(p, cat));
    const statusMap = calcDealStatusesForSubset(subset);

    // Sort chronologically
    const cwSorted = subset
      .filter(p => getProjectFiscalYear(p) !== null)
      .sort((a, b) => {
        const fiscalDiff = fiscalSortValue(a) - fiscalSortValue(b);
        if (fiscalDiff !== 0) return fiscalDiff;
        if ((a.end_date || '') !== (b.end_date || '')) return String(a.end_date || '').localeCompare(String(b.end_date || ''));
        return a.id - b.id;
      });

    const acctFYStatus = {}; // [acctKey][fy] = canonical status (locked to first SA code)
    const fySeenCombo = {}; // [fy][status] = Set of "acctKey|prodCat"
    const fyAcctSeen = {}; // [fy] = Set of acctKey
    const fyData = {};
    const fyProjects = {};

    for (const p of cwSorted) {
      const fy = getProjectFiscalYear(p);
      if (fy === null) continue;
      const acctKey = (p.account_name || p.client || '').trim().toLowerCase();
      const acctDisp = (p.account_name || p.client || p.name || p.code || 'Unknown').trim();
      const prodName = (p.product_name || '').trim();
      const prodFam = (p.product_family || '').trim();
      const prodCat = productCategory(prodName, prodFam, p.name);

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

/* ─── Chart 3: PS Support vs PS Implementation — Fiscal Period ── */
app.get('/api/dashboard/ps-type-chart', (_, res) => {
  const rows = db.prepare(`
    SELECT end_date, fiscal_period, product_name, product_family, name, code, stage
    FROM projects
    WHERE stage = 'Closed Won'
  `).all();

  const fyData = {};
  for (const r of rows) {
    const fy = getProjectFiscalYear(r);
    if (fy === null) continue;

    const productText = (r.product_name || '').trim().toUpperCase();
    const nameText = (r.name || '').trim().toUpperCase();
    const combinedText = `${productText} ${nameText}`;
    const family = (r.product_family || '').trim().toUpperCase();

    const isSupport = combinedText.includes('PS SYSTEM SUPPORT') ||
      (family === 'PROFESSIONAL SERVICES' && combinedText.includes('SYSTEM SUPPORT'));
    const isImpl = combinedText.includes('PS PROJECT IMPLEMENTATION') ||
      combinedText.includes('PS PROJECT IMPLEMETATION') ||
      (family === 'PROFESSIONAL SERVICES' && combinedText.includes('PROJECT IMPLEMENT'));

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