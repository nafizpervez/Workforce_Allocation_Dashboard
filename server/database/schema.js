const { DEFAULT_ANNUAL_WORKDAYS } = require('../../config');
const { ensureRevenueRatesTable } = require('../services/revenue-rates');

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_code TEXT DEFAULT '',
      name TEXT NOT NULL,
      dept TEXT NOT NULL,
      designation TEXT DEFAULT '',
      workdays INTEGER NOT NULL DEFAULT ${DEFAULT_ANNUAL_WORKDAYS},
      workdays_is_custom INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      client TEXT,
      budget REAL DEFAULT 0,
      spent_pct INTEGER DEFAULT 0,
      end_date TEXT,
      stage TEXT DEFAULT 'Prospect',
      progress INTEGER DEFAULT 0,
      color TEXT DEFAULT '#8B5CF6',
      priority TEXT DEFAULT 'Medium',
      not_local_project INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      week INTEGER NOT NULL,
      percentage INTEGER NOT NULL DEFAULT 0,
      customer_name TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_assignments_period ON assignments(year, month, week);
    CREATE INDEX IF NOT EXISTS idx_assignments_emp ON assignments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_project ON assignments(project_id);
    CREATE TABLE IF NOT EXISTS timesheet_detail_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      work_date TEXT NOT NULL,
      worker TEXT NOT NULL,
      work_type TEXT NOT NULL,
      worker_cost_center TEXT DEFAULT '',
      qty REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT '',
      time_entry_code TEXT DEFAULT '',
      billable TEXT DEFAULT '',
      project_hierarchy TEXT DEFAULT '',
      project_id TEXT DEFAULT '',
      external_project_reference TEXT DEFAULT '',
      project_name TEXT DEFAULT '',
      customer TEXT DEFAULT '',
      project_phase_name TEXT DEFAULT '',
      project_task TEXT DEFAULT '',
      custom_task_name TEXT DEFAULT '',
      project_role TEXT DEFAULT '',
      comment TEXT DEFAULT '',
      source_row_no INTEGER NOT NULL DEFAULT 0,
      source_file TEXT,
      sheet_name TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_timesheet_detail_month ON timesheet_detail_entries(month);
    CREATE INDEX IF NOT EXISTS idx_timesheet_detail_project ON timesheet_detail_entries(month, project_name);
    CREATE INDEX IF NOT EXISTS idx_timesheet_detail_worker_date ON timesheet_detail_entries(worker, work_date);
  `);

  const projectColumns = [
    "ALTER TABLE projects ADD COLUMN product_amount REAL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN account_name TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN product_name TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN opportunity_owner TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN opp_amount REAL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN probability INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN created_date TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN project_closing_date TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN product_family TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN not_local_project INTEGER NOT NULL DEFAULT 0",
  ];

  for (const sql of projectColumns) {
    try { db.exec(sql); } catch (_) { /* already present */ }
  }

  ensureRevenueRatesTable(db);
}

module.exports = { createSchema };
