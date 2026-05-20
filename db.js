/**
 * db.js — SQLite setup, schema, and seed data
 * Schema:
 *   employees   (id, employee_code, name, dept, email, created_at)
 *   projects    (id, code, name, client, budget, spent_pct, end_date, stage, progress, color, priority, created_at)
 *   assignments (id, employee_id, project_id, year, month, week, percentage, created_at)
 */
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
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_code   TEXT    DEFAULT '',
      name            TEXT    NOT NULL,
      dept            TEXT    NOT NULL,
      email           TEXT,
      created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      client      TEXT,
      budget      REAL    DEFAULT 0,
      spent_pct   INTEGER DEFAULT 0,
      end_date    TEXT,
      stage       TEXT    DEFAULT 'Planning',
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

  /* Migration: silently add employee_code if DB was created before this version */
  try { db.exec("ALTER TABLE employees ADD COLUMN employee_code TEXT DEFAULT ''"); }
  catch (_) { }
}

/* =============================================================================
   26 Esri Bangladesh employees (User Information layer)
   ============================================================================= */
const REAL_EMPLOYEES = [
  /* --- Solution --- */
  { code: 'SGESA00014', name: 'Md Abdullah Al Baki', dept: 'Solution' },

  /* --- Professional Services (17) --- */
  { code: 'SGESA00033', name: 'S.M Abu Saleh', dept: 'Professional Services' },
  { code: 'SGESA00034', name: 'Sakib Rahman Siddique Shuvo', dept: 'Professional Services' },
  { code: 'SGESA00046', name: 'Md. Jahid Hasan Joy', dept: 'Professional Services' },
  { code: 'SGESA00048', name: 'Masud Iqbal', dept: 'Professional Services' },
  { code: 'SGESA00055', name: 'Nusrath Jahan Nisha', dept: 'Professional Services' },
  { code: 'SGESA00026', name: 'Debashish Bhowmick', dept: 'Professional Services' },
  { code: 'SGESA00030', name: 'Mahmudul Hasan', dept: 'Professional Services' },
  { code: 'SGESA00035', name: 'Nazia Hassan Choudhury', dept: 'Professional Services' },
  { code: 'SGESA00037', name: 'Pervez Md Nafiz', dept: 'Professional Services' },
  { code: 'SGESA00040', name: 'Arnob Chakrabarty', dept: 'Professional Services' },
  { code: 'SGESA00029', name: 'Mohsuddin Shovon', dept: 'Professional Services' },
  { code: 'SGESA00032', name: 'Wahid Ibne Zakir', dept: 'Professional Services' },
  { code: 'SGESA00039', name: 'Imran Chowdhury', dept: 'Professional Services' },
  { code: 'SGESA00044', name: 'Shounok Rahman', dept: 'Professional Services' },
  { code: 'SGESA00049', name: 'Shahmin Al Islam Aurnov', dept: 'Professional Services' },
  { code: 'SGESA00056', name: 'Md. Masuk Mowla Aunkur', dept: 'Professional Services' },

  /* --- Finance (1) --- */
  { code: 'SGESA00043', name: 'Fatema Tus Sumi', dept: 'Finance' },

  /* --- Sales (5) --- */
  { code: 'SGESA00053', name: 'MD Zobayer Ahmed', dept: 'Sales' },
  { code: 'SGESA00042', name: 'Muhammad Raquibul Baser', dept: 'Sales' },
  { code: 'SGESA00051', name: 'Naiemul Haque Chowdhury', dept: 'Sales' },
  { code: 'SGESA00057', name: 'MD Reaid Alam', dept: 'Sales' },
  { code: 'SGESA00059', name: 'Raisa Kabir Nidha', dept: 'Sales' },

  /* --- Operations (2) --- */
  { code: 'SGESA00020', name: 'Most. Iffat Ara Ila', dept: 'Operations' },
  { code: 'SGESA00054', name: 'Maliha Umme Habiba', dept: 'Operations' },

  /* --- Management (1) --- */
  { code: 'SGESA00011', name: 'Mohammad Abdul Hadi', dept: 'Management' },
];

/* Project colors available when adding projects via the dashboard */
const PROJECT_COLORS = [
  '#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981',
  '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7',
  '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF',
];

const STAGES = ['Planning', 'Design', 'Development', 'Testing', 'Launched'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

function fiscalYearLabel(y) { return `${y}-${String(y + 1).slice(-2)}`; }

function seed(db) {
  console.log('Seeding database…');
  db.exec("DELETE FROM assignments; DELETE FROM projects; DELETE FROM employees;");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('employees','projects','assignments');");

  /* ── Employees only ── projects and assignments are added via the dashboard ── */
  const insertEmp = db.prepare(
    'INSERT INTO employees (employee_code, name, dept, email) VALUES (?, ?, ?, ?)'
  );
  for (const emp of REAL_EMPLOYEES) {
    const email = emp.name.toLowerCase()
      .replace(/[^a-z\s]/g, '').trim()
      .replace(/\s+/g, '.')
      + '@esribd.com';
    insertEmp.run(emp.code, emp.name, emp.dept, email);
  }
  console.log(`  ${REAL_EMPLOYEES.length} employees inserted`);
  console.log('  0 projects    — add via dashboard: + Add → Add Project');
  console.log('  0 assignments — add via dashboard: + Add → Add Assignment');
  console.log('Seed complete.');
}

/* ── CLI ── */
function cli() {
  const arg = process.argv[2];
  if (arg === '--reset') {
    if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); console.log('Database file removed.'); }
    else { console.log('No database file to remove.'); }
    return;
  }
  const db = getDb();
  createSchema(db);
  if (arg === '--seed') seed(db);
  else console.log('Usage: node db.js [--seed | --reset]');
  db.close();
}

module.exports = { getDb, createSchema, seed, DB_PATH, fiscalYearLabel };
if (require.main === module) cli();