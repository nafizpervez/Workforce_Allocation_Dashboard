/**
 * server.js — Express API for Workforce Allocation Dashboard
 *
 * REST endpoints:
 *
 *   GET    /api/employees
 *   POST   /api/employees                 { name, dept, email }
 *   PUT    /api/employees/:id             { name?, dept?, email? }
 *   DELETE /api/employees/:id
 *
 *   GET    /api/projects
 *   POST   /api/projects                  { code, name, client, budget, end_date, stage, progress, color, priority }
 *   PUT    /api/projects/:id
 *   DELETE /api/projects/:id
 *
 *   GET    /api/assignments?fiscalYear=2026
 *   POST   /api/assignments               { employee_id, project_id, year, month, week, percentage }
 *   PUT    /api/assignments/:id           { percentage?, year?, month?, week?, project_id? }
 *   DELETE /api/assignments/:id
 *
 *   GET    /api/dashboard/stats?fiscalYear=2026
 *   GET    /api/dashboard/trends?fiscalYear=2026
 *   GET    /api/dashboard/workload?fiscalYear=2026
 *   GET    /api/dashboard/utilization?fiscalYear=2026
 *   GET    /api/dashboard/pipeline
 *   GET    /api/dashboard/deadlines
 *
 * A "fiscal year" Y means: April Y through March Y+1.
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

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Returns [{year, month}, ...] for the 12 months of a fiscal year, in display order. */
function fiscalMonths(fiscalYear) {
  return [
    { year: fiscalYear, month: 4 },
    { year: fiscalYear, month: 5 },
    { year: fiscalYear, month: 6 },
    { year: fiscalYear, month: 7 },
    { year: fiscalYear, month: 8 },
    { year: fiscalYear, month: 9 },
    { year: fiscalYear, month: 10 },
    { year: fiscalYear, month: 11 },
    { year: fiscalYear, month: 12 },
    { year: fiscalYear + 1, month: 1 },
    { year: fiscalYear + 1, month: 2 },
    { year: fiscalYear + 1, month: 3 },
  ];
}

/** Returns SQL fragment for "matches the given fiscal year". */
const FISCAL_WHERE = `
  (
    (year = ? AND month >= 4)
    OR
    (year = ? AND month <= 3)
  )
`;
function fiscalParams(fy) {
  return [fy, fy + 1];
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* -------------------------------------------------------------------------- */
/*  Employees                                                                 */
/* -------------------------------------------------------------------------- */

app.get('/api/employees', (req, res) => {
  const rows = db
    .prepare('SELECT id, employee_code, name, dept, email, created_at FROM employees ORDER BY id')
    .all();
  res.json(rows);
});

app.post('/api/employees', (req, res) => {
  const { employee_code, name, dept, email } = req.body || {};
  if (!name || !dept) {
    return res.status(400).json({ error: 'name and dept are required' });
  }
  const info = db
    .prepare('INSERT INTO employees (employee_code, name, dept, email) VALUES (?, ?, ?, ?)')
    .run(employee_code || '', name, dept, email || null);
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'employee not found' });

  const { employee_code, name, dept, email } = req.body || {};
  db.prepare(`
    UPDATE employees
       SET employee_code = COALESCE(?, employee_code),
           name  = COALESCE(?, name),
           dept  = COALESCE(?, dept),
           email = COALESCE(?, email)
     WHERE id = ?
  `).run(employee_code ?? null, name ?? null, dept ?? null, email ?? null, id);

  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(id));
});

app.delete('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'employee not found' });
  res.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/*  Projects                                                                  */
/* -------------------------------------------------------------------------- */

app.get('/api/projects', (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  res.json(rows);
});

app.post('/api/projects', (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name are required' });

  try {
    const info = db.prepare(`
      INSERT INTO projects (
        code, name, client, budget, spent_pct, end_date, stage, progress, color, priority,
        product_amount, account_name, product_name, opportunity_owner,
        sales_price_currency, sales_price, amount_currency, opp_amount,
        probability, quantity, product_date, product_month, product_description,
        list_price_currency, list_price, vendor_product_code, active_product,
        owner_role, product_family, close_month
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.code, b.name, b.client || null,
      safeNum(b.budget, 0), safeNum(b.spent_pct, 0),
      b.end_date || null, b.stage || 'Prospect',
      safeNum(b.progress, 0), b.color || '#8B5CF6', b.priority || 'Medium',
      safeNum(b.product_amount, 0), b.account_name || null, b.product_name || null,
      b.opportunity_owner || null, b.sales_price_currency || 'USD', safeNum(b.sales_price, 0),
      b.amount_currency || 'USD', safeNum(b.opp_amount, 0),
      safeNum(b.probability, 0), safeNum(b.quantity, 1),
      b.product_date || null, b.product_month || null, b.product_description || null,
      b.list_price_currency || 'USD', safeNum(b.list_price, 0),
      b.vendor_product_code || null, b.active_product !== undefined ? (b.active_product ? 1 : 0) : 1,
      b.owner_role || null, b.product_family || 'Professional Services', b.close_month || null
    );
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'project code must be unique' });
    throw e;
  }
});

app.put('/api/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'project not found' });

  const fields = [
    'code', 'name', 'client', 'budget', 'spent_pct', 'end_date', 'stage', 'progress', 'color', 'priority',
    'product_amount', 'account_name', 'product_name', 'opportunity_owner',
    'sales_price_currency', 'sales_price', 'amount_currency', 'opp_amount',
    'probability', 'quantity', 'product_date', 'product_month', 'product_description',
    'list_price_currency', 'list_price', 'vendor_product_code', 'active_product',
    'owner_role', 'product_family', 'close_month',
  ];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (updates.length) {
    params.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

app.delete('/api/projects/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'project not found' });
  res.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/*  Assignments                                                               */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/assignments?fiscalYear=2026
 * Returns assignments for the fiscal year, joined with project data.
 */
app.get('/api/assignments', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const rows = db.prepare(`
    SELECT a.id, a.employee_id, a.project_id, a.year, a.month, a.week, a.percentage,
           p.code AS project_code, p.name AS project_name, p.color AS project_color
      FROM assignments a
      JOIN projects p ON p.id = a.project_id
     WHERE ${FISCAL_WHERE}
  `).all(...fiscalParams(fy));
  res.json(rows);
});

app.post('/api/assignments', (req, res) => {
  const { employee_id, project_id, year, month, week, percentage } = req.body || {};
  if (!employee_id || !project_id || !year || !month || !week) {
    return res.status(400).json({
      error: 'employee_id, project_id, year, month, week are required',
    });
  }
  if (month < 1 || month > 12) return res.status(400).json({ error: 'month must be 1..12' });
  if (week < 1 || week > 4) return res.status(400).json({ error: 'week must be 1..4' });

  const info = db.prepare(`
    INSERT INTO assignments (employee_id, project_id, year, month, week, percentage)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(employee_id, project_id, year, month, week, safeNum(percentage, 0));

  const row = db.prepare(`
    SELECT a.*, p.code AS project_code, p.name AS project_name, p.color AS project_color
      FROM assignments a JOIN projects p ON p.id = a.project_id
     WHERE a.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/assignments/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'assignment not found' });

  const fields = ['employee_id', 'project_id', 'year', 'month', 'week', 'percentage'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (updates.length) {
    params.push(id);
    db.prepare(`UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`
    SELECT a.*, p.code AS project_code, p.name AS project_name, p.color AS project_color
      FROM assignments a JOIN projects p ON p.id = a.project_id
     WHERE a.id = ?
  `).get(id);
  res.json(row);
});

app.delete('/api/assignments/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'assignment not found' });
  res.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard aggregations                                                    */
/* -------------------------------------------------------------------------- */

/** Top stat cards */
app.get('/api/dashboard/stats', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());

  /* ── base counts ── */
  const activeEmployees = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
  const activeProjects = db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE stage != 'Closed Won'`).get().c;

  const totalAssignments = db.prepare(`
    SELECT COUNT(*) AS c FROM assignments WHERE ${FISCAL_WHERE}
  `).get(...fiscalParams(fy)).c;

  const avgUtil = db.prepare(`
    SELECT AVG(weekly_total) AS avg_util
      FROM (
        SELECT employee_id, year, month, week, SUM(percentage) AS weekly_total
          FROM assignments
         WHERE ${FISCAL_WHERE}
         GROUP BY employee_id, year, month, week
      )
  `).get(...fiscalParams(fy)).avg_util || 0;

  const productivity = Math.min(10, +(avgUtil / 10).toFixed(1));
  const onTime = db.prepare(`
    SELECT ROUND(100.0 * SUM(CASE WHEN progress >= 80 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS ontime
      FROM projects
  `).get().ontime || 0;

  /* ── trends: current calendar month vs previous calendar month ── */
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const prevM = curM === 1 ? 12 : curM - 1;
  const prevY = curM === 1 ? curY - 1 : curY;
  const curMStr = String(curM).padStart(2, '0');
  const prevMStr = String(prevM).padStart(2, '0');

  // assignments delta
  const asgCur = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE year=? AND month=?').get(curY, curM).c;
  const asgPrev = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE year=? AND month=?').get(prevY, prevM).c;
  const asgDelta = asgCur - asgPrev;

  // utilization delta
  const utilCur = db.prepare(`
    SELECT AVG(wt) AS u FROM (SELECT SUM(percentage) AS wt FROM assignments WHERE year=? AND month=? GROUP BY employee_id, week)
  `).get(curY, curM).u || 0;
  const utilPrev = db.prepare(`
    SELECT AVG(wt) AS u FROM (SELECT SUM(percentage) AS wt FROM assignments WHERE year=? AND month=? GROUP BY employee_id, week)
  `).get(prevY, prevM).u || 0;
  const utilDelta = +(utilCur - utilPrev).toFixed(1);

  // new employees / projects added this month
  const newEmps = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;
  const newProjs = db.prepare(`SELECT COUNT(*) AS c FROM projects  WHERE strftime('%Y',created_at)=? AND strftime('%m',created_at)=?`).get(String(curY), curMStr).c;

  const prodDelta = +(utilDelta / 10).toFixed(1);
  const onTimeDelta = +(onTime - (db.prepare(`SELECT ROUND(100.0 * SUM(CASE WHEN progress >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS o FROM projects`).get().o || 0)).toFixed(1);

  function sign(n) { return n >= 0 ? `+${n}` : `${n}`; }
  function signF(n) { return n >= 0 ? `+${n}%` : `${n}%`; }

  res.json({
    active_employees: activeEmployees,
    active_projects: activeProjects,
    avg_utilization: +avgUtil.toFixed(1),
    total_assignments: totalAssignments,
    productivity,
    on_time_pct: onTime,
    trends: {
      employees: { value: newEmps > 0 ? `+${newEmps} this month` : 'No change this month', up: newEmps >= 0 },
      projects: { value: newProjs > 0 ? `+${newProjs} new` : 'No new this month', up: newProjs >= 0 },
      utilization: { value: `${signF(utilDelta)} vs last month`, up: utilDelta >= 0 },
      assignments: { value: `${sign(asgDelta)} vs last month`, up: asgDelta >= 0 },
      productivity: { value: `${sign(prodDelta)} vs last month`, up: prodDelta >= 0 },
      on_time: { value: `${signF(onTimeDelta)} vs last month`, up: onTimeDelta >= 0 },
    },
  });
});

/** Trends: monthly assignment counts and average utilization for the fiscal year */
app.get('/api/dashboard/trends', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const months = fiscalMonths(fy);

  const data = months.map(({ year, month }) => {
    const count = db.prepare(
      'SELECT COUNT(*) AS c FROM assignments WHERE year = ? AND month = ?'
    ).get(year, month).c;

    const util = db.prepare(`
      SELECT AVG(weekly_total) AS u
        FROM (
          SELECT employee_id, week, SUM(percentage) AS weekly_total
            FROM assignments
           WHERE year = ? AND month = ?
           GROUP BY employee_id, week
        )
    `).get(year, month).u || 0;

    const label = new Date(year, month - 1, 1)
      .toLocaleString('en-US', { month: 'short' });
    return {
      label,
      year,
      month,
      assignments: count,
      utilization: +util.toFixed(1),
    };
  });
  res.json(data);
});

/** Workload per department */
app.get('/api/dashboard/workload', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());
  const rows = db.prepare(`
    SELECT e.dept, COUNT(a.id) AS assignment_count
      FROM employees e
      LEFT JOIN assignments a
        ON a.employee_id = e.id AND ${FISCAL_WHERE.replace(/year/g, 'a.year').replace(/month/g, 'a.month')}
     GROUP BY e.dept
     ORDER BY assignment_count DESC
  `).all(...fiscalParams(fy));
  res.json(rows);
});

/** Utilization: per-employee avg utilization for the fiscal year + top/bottom 5 */
app.get('/api/dashboard/utilization', (req, res) => {
  const fy = safeNum(req.query.fiscalYear, new Date().getFullYear());

  const rows = db.prepare(`
    SELECT e.id, e.name, e.dept,
           COALESCE(AVG(weekly_total), 0) AS avg_util
      FROM employees e
      LEFT JOIN (
        SELECT employee_id, year, month, week, SUM(percentage) AS weekly_total
          FROM assignments
         WHERE ${FISCAL_WHERE}
         GROUP BY employee_id, year, month, week
      ) w ON w.employee_id = e.id
     GROUP BY e.id
     ORDER BY avg_util ASC
  `).all(...fiscalParams(fy));

  const cleaned = rows.map(r => ({
    id: r.id, name: r.name, dept: r.dept,
    utilization: +Number(r.avg_util).toFixed(1),
  }));
  const top_available = cleaned.slice(0, 5);
  const high_workload = [...cleaned].reverse().slice(0, 5);

  res.json({ all: cleaned, top_available, high_workload });
});

/** Project pipeline: count + budget per stage */
app.get('/api/dashboard/pipeline', (req, res) => {
  const rows = db.prepare(`
    SELECT stage,
           COUNT(*) AS count,
           SUM(budget) AS total_budget,
           AVG(progress) AS avg_progress
      FROM projects
     GROUP BY stage
  `).all();

  const order = ['Prospect', 'Qualify', 'Validate', 'Presentation - Solve', 'Proposal', 'Negotiate', 'Closed Won'];
  rows.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  res.json(rows);
});

/** Upcoming deadlines */
app.get('/api/dashboard/deadlines', (req, res) => {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT id, code, name, end_date, progress, priority
      FROM projects
     WHERE end_date IS NOT NULL AND end_date >= ?
     ORDER BY end_date ASC
     LIMIT 6
  `).all(isoToday);

  const enriched = rows.map(r => {
    const due = new Date(r.end_date);
    const days = Math.max(0, Math.round((due - today) / (1000 * 60 * 60 * 24)));
    const status =
      r.progress >= 80 ? 'On Track' :
        days < 14 && r.progress < 50 ? 'Delayed' :
          'At Risk';
    return { ...r, days, status };
  });
  res.json(enriched);
});

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */

// Available fiscal years (years that contain at least one assignment)
app.get('/api/fiscal-years', (req, res) => {
  // a fiscal year FY contains months {(FY, 4..12), (FY+1, 1..3)}.
  // Derive distinct fiscal years from assignments table.
  const rows = db.prepare(`
    SELECT DISTINCT
      CASE WHEN month >= 4 THEN year ELSE year - 1 END AS fiscal_year
    FROM assignments
    ORDER BY fiscal_year ASC
  `).all();
  res.json(rows.map(r => r.fiscal_year));
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Generic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Serve index.html for the root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Workforce Dashboard server running at http://localhost:${PORT}`);
});