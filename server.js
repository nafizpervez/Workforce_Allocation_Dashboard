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

app.use(cors());
app.use(express.json());
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

/* ─── Display cutoff: only show projects from Oct 2025 onwards ── */
const DISPLAY_CUTOFF = '2025-10-01';


function getFiscalYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const month = d.getMonth() + 1;
  return month >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}
function fyLabel(fy) { return String(fy + 1); }

function calcDealStatuses(allProjects) {
  /* ── 1. Build Closed Won history keyed by account_name ─────── */
  const acctMap = {};
  for (const p of allProjects) {
    if (p.stage !== 'Closed Won') continue;
    const fy = getFiscalYear(p.end_date);
    if (fy === null) continue;
    const key = (p.account_name || p.client || '').trim().toLowerCase();
    if (!key) continue;
    (acctMap[key] || (acctMap[key] = [])).push({ fy, id: p.id });
  }
  /* sort each account's appearances chronologically */
  for (const k of Object.keys(acctMap)) acctMap[k].sort((a, b) => a.fy - b.fy || a.id - b.id);

  const out = {};

  /* ── 2. Assign status to CLOSED WON projects sequentially ──── */
  for (const key of Object.keys(acctMap)) {
    let prevStatus = null, prevFY = null;
    for (const occ of acctMap[key]) {
      let status;
      if (prevStatus === null) {
        /* First-ever Closed Won for this account */
        status = 'NEW LOGO';
      } else if (prevFY === occ.fy) {
        /* Same fiscal year as previous occurrence:
           prev=NEW LOGO → REPEAT (two lines in first-ever deal year)
           prev=REPEAT/REACTIVE → REACTIVE (3rd+ in same year or after repeat) */
        status = prevStatus === 'NEW LOGO' ? 'REPEAT' : 'REACTIVE';
      } else if (prevFY === occ.fy - 1) {
        /* Consecutive FY — came back next year */
        status = 'REPEAT';
      } else {
        /* Gap of ≥1 FY skipped — reactivated */
        status = 'REACTIVE';
      }
      out[occ.id] = status;
      prevStatus = status;
      prevFY = occ.fy;
    }
  }

  /* ── 3. Prospective status for NON-Closed Won (pipeline) ────── */
  for (const p of allProjects) {
    if (p.stage === 'Closed Won') continue;
    const fy = getFiscalYear(p.end_date) || new Date().getFullYear();
    const key = (p.account_name || p.client || '').trim().toLowerCase();
    const hist = acctMap[key] || [];
    if (hist.length === 0) {
      out[p.id] = 'NEW LOGO';
    } else {
      const lastFY = hist[hist.length - 1].fy;
      /* If last win was this FY or previous FY → REPEAT; else REACTIVE */
      out[p.id] = (lastFY >= fy - 1) ? 'REPEAT' : 'REACTIVE';
    }
  }

  /* ── 4. Fallback (no account_name / no date) ─────────────────── */
  for (const p of allProjects) {
    if (!(p.id in out)) out[p.id] = 'NEW LOGO';
  }

  return out;
}
const safeNum = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

/* ─── employees ───────────────────────────────────────────────── */
app.get('/api/employees', (_, res) =>
  res.json(db.prepare('SELECT id, employee_code, name, dept, email, created_at FROM employees ORDER BY id').all())
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

app.delete('/api/employees/:id', (req, res) => {
  const info = db.prepare('DELETE FROM employees WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/* ─── projects ────────────────────────────────────────────────── */
const PROJECT_FIELDS = [
  'code', 'name', 'client', 'budget', 'spent_pct', 'end_date', 'stage', 'progress', 'color', 'priority',
  'product_amount', 'account_name', 'product_name', 'opportunity_owner', 'opp_amount', 'probability',
  'created_date', 'project_closing_date',
];

app.get('/api/projects', (_, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const statusMap = calcDealStatuses(rows);  // rows have account_name, client, stage
  res.json(rows.map(r => ({ ...r, deal_status: statusMap[r.id] || 'NEW LOGO' })));
});

app.post('/api/projects', (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name are required' });
  try {
    const info = db.prepare(`
      INSERT INTO projects (code,name,client,budget,spent_pct,end_date,stage,progress,color,priority,
        product_amount,account_name,product_name,opportunity_owner,opp_amount,probability,
        created_date,project_closing_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.code, b.name, b.client || b.account_name || null,
      safeNum(b.budget ?? b.opp_amount, 0), safeNum(b.spent_pct, 0),
      b.end_date || null, b.stage || 'Prospect', safeNum(b.progress, 0),
      b.color || '#8B5CF6', b.priority || 'Medium',
      safeNum(b.product_amount, 0), b.account_name || null, b.product_name || null,
      b.opportunity_owner || null, safeNum(b.opp_amount, 0), safeNum(b.probability, 0),
      b.created_date || null, b.project_closing_date || null
    );
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'project code must be unique' });
    throw e;
  }
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
           p.code AS project_code, p.name AS project_name, p.color AS project_color
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

app.delete('/api/assignments/:id', (req, res) => {
  const info = db.prepare('DELETE FROM assignments WHERE id=?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/* ─── dashboard stats ─────────────────────────────────────────── */
app.get('/api/dashboard/stats', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());

  const activeEmployees = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
  const activeProjects = db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE stage != 'Closed Won'`).get().c;
  // Assigned Projects: distinct projects that have at least one assignment this FY
  const assignedProjects = db.prepare(`SELECT COUNT(DISTINCT project_id) AS c FROM assignments WHERE ${FISCAL_WHERE}`).get(...fiscalParams(fy)).c;

  const avgUtil = db.prepare(`
    SELECT AVG(weekly_total) AS u FROM (
      SELECT employee_id,year,month,week,SUM(percentage) AS weekly_total
        FROM assignments WHERE ${FISCAL_WHERE} GROUP BY employee_id,year,month,week
    )
  `).get(...fiscalParams(fy)).u || 0;

  const psCount = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE dept='Professional Services'`).get().c || 1;
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
     GROUP BY e.dept ORDER BY assignment_count DESC
  `).all(...fiscalParams(fy)));
});

app.get('/api/dashboard/utilization', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const rows = db.prepare(`
    SELECT e.id, e.name, e.dept, COALESCE(AVG(weekly_total),0) AS avg_util
      FROM employees e
      LEFT JOIN (
        SELECT employee_id,year,month,week,SUM(percentage) AS weekly_total
          FROM assignments WHERE ${FISCAL_WHERE}
         GROUP BY employee_id,year,month,week
      ) w ON w.employee_id=e.id
     GROUP BY e.id ORDER BY avg_util ASC
  `).all(...fiscalParams(fy));
  const cleaned = rows.map(r => ({ id: r.id, name: r.name, dept: r.dept, utilization: +Number(r.avg_util).toFixed(1) }));
  res.json({ all: cleaned, top_available: cleaned.slice(0, 5), high_workload: [...cleaned].reverse().slice(0, 5) });
});

app.get('/api/dashboard/pipeline', (_, res) => {
  const rows = db.prepare(`SELECT stage,COUNT(*) AS count,SUM(budget) AS total_budget,AVG(progress) AS avg_progress FROM projects GROUP BY stage`).all();
  const order = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won'];
  rows.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  res.json(rows);
});

/* Running Projects: Closed Won projects, sorted by project_closing_date (fallback end_date) */
app.get('/api/dashboard/deadlines', (_, res) => {
  const today = new Date();
  const rows = db.prepare(`
    SELECT id, code, name, end_date, project_closing_date, product_name,
           progress, priority, opp_amount, account_name, stage, color, opportunity_owner
      FROM projects
     WHERE stage = 'Closed Won'
       AND end_date >= ?
     ORDER BY CASE
       WHEN project_closing_date IS NOT NULL AND project_closing_date != '' THEN project_closing_date
       ELSE COALESCE(end_date, '9999-12-31')
     END ASC
  `).all(DISPLAY_CUTOFF);

  const allProjects = db.prepare('SELECT id, code, account_name, client, end_date, stage FROM projects').all();
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
  const allProjects = db.prepare('SELECT id, code, account_name, client, end_date, stage FROM projects').all();
  const statusMap = calcDealStatuses(allProjects);
  const fyData = {};
  for (const p of allProjects) {
    if (p.stage !== 'Closed Won') continue;   // chart: Closed Won only
    if (!p.end_date) continue;
    const fy = getFiscalYear(p.end_date);
    if (fy === null) continue;
    const st = statusMap[p.id] || 'NEW LOGO';
    if (!fyData[fy]) fyData[fy] = { 'NEW LOGO': 0, 'REPEAT': 0, 'REACTIVE': 0 };
    fyData[fy][st]++;
  }
  const result = Object.entries(fyData)
    .sort((a, b) => +a[0] - +b[0])
    .map(([fy, c]) => ({ fy: +fy, label: fyLabel(+fy), 'NEW LOGO': c['NEW LOGO'], 'REPEAT': c['REPEAT'], 'REACTIVE': c['REACTIVE'] }));
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