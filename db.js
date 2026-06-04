const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'workforce.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_code TEXT    DEFAULT '',
      name          TEXT    NOT NULL,
      dept          TEXT    NOT NULL,
      email         TEXT,
      created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL,
      name        TEXT NOT NULL,
      client      TEXT,
      budget      REAL    DEFAULT 0,
      spent_pct   INTEGER DEFAULT 0,
      end_date    TEXT,
      stage       TEXT    DEFAULT 'Prospect',
      progress    INTEGER DEFAULT 0,
      color       TEXT    DEFAULT '#8B5CF6',
      priority    TEXT    DEFAULT 'Medium',
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      project_id  INTEGER NOT NULL,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      week        INTEGER NOT NULL,
      percentage  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_assignments_period  ON assignments(year, month, week);
    CREATE INDEX IF NOT EXISTS idx_assignments_emp     ON assignments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_project ON assignments(project_id);
  `);

  const newProjectCols = [
    "ALTER TABLE projects ADD COLUMN product_amount    REAL    DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN account_name      TEXT    DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN product_name      TEXT    DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN opportunity_owner TEXT    DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN opp_amount        REAL    DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN probability       INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN created_date      TEXT    DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN project_closing_date TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN product_family      TEXT    DEFAULT ''",
  ];
  for (const sql of newProjectCols) { try { db.exec(sql); } catch (_) { } }
}

/* ── Employees ──────────────────────────────────────────────── */
const REAL_EMPLOYEES = [
  { code: 'SGESA00026', name: 'Debashish Bhowmick', dept: 'Professional Services', email: 'd.bhowmick@esribangladesh.com.bd' },
  { code: 'SGESA00029', name: 'Mohsuddin Shovon', dept: 'Professional Services', email: 'm.shovon@esrisa.com' },
  { code: 'SGESA00033', name: 'S.M Abu Saleh', dept: 'Professional Services', email: 'sm.abusaleh@esribangladesh.com.bd' },
  { code: 'SGESA00040', name: 'Arnob Chakrabarty', dept: 'Professional Services', email: 'c.arnob@esribangladesh.com.bd' },
  { code: 'SGESA00030', name: 'Mahmudul Hasan', dept: 'Professional Services', email: 'h.mahmudul@esribangladesh.com.bd' },
  { code: 'SGESA00039', name: 'Imran Chowdhury', dept: 'Professional Services', email: 'c.imran@esribangladesh.com.bd' },
  { code: 'SGESA00046', name: 'Md. Jahid Hasan Joy', dept: 'Professional Services', email: 'jhasan@esribangladesh.com.bd' },
  { code: 'SGESA00048', name: 'Masud Iqbal', dept: 'Professional Services', email: 'miqbal@esribangladesh.com.bd' },
  { code: 'SGESA00056', name: 'Md. Masuk Mowla Aunkur', dept: 'Professional Services', email: 'maunkur@esribangladesh.com.bd' },
  { code: 'SGESA00055', name: 'Nusrath Jahan Nisha', dept: 'Professional Services', email: 'njnisha@esribangladesh.com.bd' },
  { code: 'SGESA00037', name: 'Pervez Md Nafiz', dept: 'Professional Services', email: 'pm.nafiz@esribangladesh.com.bd' },
  { code: 'SGESA00044', name: 'Shounok Rahman', dept: 'Professional Services', email: 'rshounok@esribangladesh.com.bd' },
  { code: 'SGESA00034', name: 'Sakib Rahman Siddique Shuvo', dept: 'Professional Services', email: 'rs.sakib@esrisa.com' },
  { code: 'SGESA00049', name: 'Shahmin Al Islam Aurnov', dept: 'Professional Services', email: 'saurnov@esribangladesh.com.bd' },
  { code: 'SGESA00032', name: 'Wahid Ibne Zakir', dept: 'Professional Services', email: 'iz.wahid@esribangladesh.com.bd' },
  { code: 'SGESA00035', name: 'Nazia Hassan Choudhury', dept: 'Professional Services', email: 'n.choudhury@esribangladesh.com.bd' },
  { code: 'SGESA00019', name: 'Sakil Ahmed', dept: 'Professional Services', email: 'sahmed@esribangladesh.com.bd' },
];

/* ── Helper ─────────────────────────────────────────────────── */
const C = ['#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF'];
let ci = 0;
const nextColor = () => C[ci++ % C.length];
const fmtDate = s => { const [m, d, y] = s.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const pri = amt => amt >= 50000 ? 'High' : amt >= 10000 ? 'Medium' : 'Low';

function mkp(closeDate, owner, code, productName, name, account, prob, productAmt, amt, stage, productFamily) {
  return {
    code, name, account_name: account, product_name: productName, product_family: productFamily || '',
    opportunity_owner: owner, probability: prob,
    product_amount: productAmt, opp_amount: amt,
    end_date: fmtDate(closeDate), stage,
    progress: stage === 'Closed Won' ? 100 : 0,
    priority: pri(amt), color: nextColor()
  };
}

/* ── FY27 Pipeline projects — loaded verbatim from pipeline_seed.json ──────────
   Generated by Python directly from the Excel file with zero value changes.
   Each record maps 1-to-1 with an Excel row (all 12 columns preserved).       */
const PIPELINE_PROJECTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'pipeline_seed.json'), 'utf-8')
).map(r => ({
  ...r,
  client: r.account_name,
  budget: r.opp_amount,
  spent_pct: 0,
  progress: 0,   // ← always 0; pipeline CW rows are active running projects
  priority: r.opp_amount >= 50000 ? 'High' : r.opp_amount >= 10000 ? 'Medium' : 'Low',
  color: (() => { const C = ['#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF']; return C[Math.abs(r.code.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % C.length]; })(),
  project_closing_date: '',
}));

/* ── Historical projects — loaded verbatim from historical_seed.json ─────────
   Generated by Python directly from the Excel file with zero value changes.
   Each record maps 1-to-1 with an Excel row (all 11 columns preserved).      */
const HISTORICAL_PROJECTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'historical_seed.json'), 'utf-8')
).map(r => ({
  ...r,
  client: r.account_name,                             // alias
  budget: r.opp_amount,                               // fallback
  spent_pct: 0,
  progress: r.stage === 'Closed Won' ? 100 : 0,        // UI-only, not from Excel
  priority: r.opp_amount >= 50000 ? 'High' : r.opp_amount >= 10000 ? 'Medium' : 'Low',
  color: (() => { const C = ['#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF']; return C[Math.abs(r.code.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % C.length]; })(),
  project_closing_date: '',
}));

const ALL_PROJECTS = [...PIPELINE_PROJECTS, ...HISTORICAL_PROJECTS];

function seed(db) {
  console.log('Seeding database…');
  db.exec("DELETE FROM assignments; DELETE FROM projects; DELETE FROM employees;");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('employees','projects','assignments');");

  const insertEmp = db.prepare('INSERT INTO employees (employee_code, name, dept, email) VALUES (?, ?, ?, ?)');
  for (const emp of REAL_EMPLOYEES) insertEmp.run(emp.code, emp.name, emp.dept, emp.email || '');
  console.log(`  ${REAL_EMPLOYEES.length} employees inserted`);

  const insertProj = db.prepare(`
    INSERT INTO projects (
      code, name, client, budget, spent_pct, end_date, stage, progress, color, priority,
      product_amount, account_name, product_name, product_family,
      opportunity_owner, opp_amount, probability, project_closing_date
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const p of ALL_PROJECTS) {
    insertProj.run(
      p.code, p.name, p.account_name, p.opp_amount, 0,
      p.end_date, p.stage,
      p.progress, p.color, p.priority,
      p.product_amount, p.account_name, p.product_name,
      p.product_family || '',
      p.opportunity_owner, p.opp_amount, p.probability,
      p.project_closing_date || ''
    );
  }
  console.log(`  ${ALL_PROJECTS.length} projects inserted (${PIPELINE_PROJECTS.length} pipeline + ${HISTORICAL_PROJECTS.length} historical)`);
  console.log('Seed complete.');
}

module.exports = { getDb, createSchema, seed, DB_PATH };

if (require.main === module) {
  const args = process.argv.slice(2);
  const db = getDb();
  createSchema(db);
  if (args.includes('--reset')) {
    db.exec("DELETE FROM assignments; DELETE FROM projects; DELETE FROM employees;");
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('employees','projects','assignments');");
    console.log('Database reset.');
  }
  if (args.includes('--seed') || args.includes('--reset')) {
    seed(db);
  }
  db.close();
}