const { DEFAULT_ANNUAL_WORKDAYS } = require('../../config');
const { ensureRevenueRatesTable } = require('../services/revenue-rates');
const { ensureCommittedTargetsTable } = require('../services/committed-targets');
const { ensurePreSaleProductsTable } = require('../services/presale-products');
const { ensurePsTeamAssignmentsTable } = require('../services/ps-team-assignments');
const { getFiscalPeriodFromDate } = require('../services/fiscal');
const {
  PERSON_IDENTITY_ALIASES,
  canonicalPersonName,
  personIdentityKey,
} = require('../services/person-identity');

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function addColumn(db, sql) {
  try { db.prepare(sql).run(); } catch (_) { /* already present */ }
}

function getTableColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all().find(column => (
    column.name === columnName
  )) || null;
}

function numericColumnDefault(column, fallback) {
  const value = Number(String(column?.dflt_value ?? '').replace(/[()'"]/g, '').trim());
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function ensureDuplicateProjectCodes(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (!table?.sql) return;

  const hasUniqueCodeIndex = db.prepare("PRAGMA index_list('projects')").all().some(index => {
    if (!index.unique) return false;
    const columns = db.prepare(`PRAGMA index_info(${quoteIdent(index.name)})`).all().map(column => column.name);
    return columns.length === 1 && columns[0] === 'code';
  });
  const inlineUnique = /\bcode\b[^,)]*\bUNIQUE\b/i.test(table.sql);
  const tableUnique = /UNIQUE\s*\(\s*code\s*\)/i.test(table.sql);
  if (!hasUniqueCodeIndex && !inlineUnique && !tableUnique) return;

  const backup = `projects_code_unique_backup_${Date.now()}`;
  const createSql = table.sql
    .replace(/\bcode\b\s+TEXT\s+NOT\s+NULL\s+UNIQUE/ig, 'code TEXT NOT NULL')
    .replace(/\bcode\b\s+TEXT\s+UNIQUE/ig, 'code TEXT')
    .replace(/,\s*UNIQUE\s*\(\s*code\s*\)/ig, '')
    .replace(/UNIQUE\s*\(\s*code\s*\)\s*,/ig, '');
  const columns = db.prepare("PRAGMA table_info('projects')").all().map(column => column.name);
  const columnList = columns.map(quoteIdent).join(', ');

  db.transaction(() => {
    db.prepare('PRAGMA foreign_keys = OFF').run();
    db.prepare(`ALTER TABLE projects RENAME TO ${quoteIdent(backup)}`).run();
    db.prepare(createSql).run();
    db.prepare(`INSERT INTO projects (${columnList}) SELECT ${columnList} FROM ${quoteIdent(backup)}`).run();
    db.prepare(`DROP TABLE ${quoteIdent(backup)}`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(code)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_import_key ON projects(code, product_name)').run();
    db.prepare('PRAGMA foreign_keys = ON').run();
  })();
}

function ensureTimesheetTable(db) {
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
  db.prepare('CREATE INDEX IF NOT EXISTS idx_timesheet_entries_month ON timesheet_entries(month)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_timesheet_entries_worker ON timesheet_entries(worker)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_timesheet_entries_work_type ON timesheet_entries(work_type)').run();
}

function ensureTimesheetDetailTable(db) {
  db.prepare(`
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
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_timesheet_detail_month ON timesheet_detail_entries(month)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_timesheet_detail_project ON timesheet_detail_entries(month, project_name)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_timesheet_detail_worker_date ON timesheet_detail_entries(worker, work_date)').run();
}


function canonicalizeKnownPeople(db) {
  const employeeRows = db.prepare('SELECT id, name FROM employees').all();
  const updateEmployee = db.prepare('UPDATE employees SET name = ? WHERE id = ?');

  for (const employee of employeeRows) {
    const canonicalName = canonicalPersonName(employee.name);
    if (canonicalName && canonicalName !== employee.name) {
      updateEmployee.run(canonicalName, employee.id);
    }
  }

  const canonicalNameByKey = new Map(
    PERSON_IDENTITY_ALIASES.map(identity => [
      personIdentityKey(identity.canonicalName),
      identity.canonicalName,
    ]),
  );
  const timeRows = db.prepare(`
    SELECT
      id,
      month,
      worker,
      work_type,
      project_name,
      qty,
      source_file,
      sheet_name,
      uploaded_at,
      updated_at
    FROM timesheet_entries
  `).all();
  const groups = new Map();

  for (const row of timeRows) {
    const identityKey = personIdentityKey(row.worker);
    const canonicalName = canonicalNameByKey.get(identityKey);
    if (!canonicalName) continue;

    const groupKey = [row.month, identityKey, row.work_type, row.project_name].join('\u001F');
    if (!groups.has(groupKey)) groups.set(groupKey, { canonicalName, rows: [] });
    groups.get(groupKey).rows.push(row);
  }

  const updateTimeWorker = db.prepare('UPDATE timesheet_entries SET worker = ? WHERE id = ?');
  const deleteRow = db.prepare('DELETE FROM timesheet_entries WHERE id = ?');
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const group of groups.values()) {
      const needsRewrite = group.rows.length > 1 || group.rows.some(row => (
        row.worker !== group.canonicalName
      ));
      if (!needsRewrite) continue;

      if (group.rows.length === 1) {
        updateTimeWorker.run(group.canonicalName, group.rows[0].id);
        continue;
      }

      const rowsByMostRecent = [...group.rows].sort((a, b) => (
        String(b.updated_at || '').localeCompare(String(a.updated_at || '')) ||
        Number(b.id) - Number(a.id)
      ));
      const source = rowsByMostRecent[0];
      const quantity = group.rows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
      const uploadedAt = group.rows
        .map(row => row.uploaded_at)
        .filter(Boolean)
        .sort()[0] || source.updated_at || new Date().toISOString();
      const updatedAt = source.updated_at || uploadedAt;

      for (const row of group.rows) deleteRow.run(row.id);

      insertRow.run(
        source.month,
        group.canonicalName,
        source.work_type,
        source.project_name,
        +quantity.toFixed(4),
        source.source_file || null,
        source.sheet_name || null,
        uploadedAt,
        updatedAt,
      );
    }
  })();

  const detailRows = db.prepare('SELECT id, worker FROM timesheet_detail_entries').all();
  const updateDetailWorker = db.prepare('UPDATE timesheet_detail_entries SET worker = ? WHERE id = ?');
  db.transaction(() => {
    for (const row of detailRows) {
      const canonicalName = canonicalPersonName(row.worker);
      if (canonicalName && canonicalName !== row.worker) {
        updateDetailWorker.run(canonicalName, row.id);
      }
    }
  })();
}

function repairProjectFiscalPeriods(db) {
  const rows = db.prepare(`
    SELECT id, end_date, fiscal_period
    FROM projects
    WHERE end_date IS NOT NULL AND TRIM(end_date) != ''
  `).all();
  const update = db.prepare('UPDATE projects SET fiscal_period=? WHERE id=?');
  let updated = 0;

  db.transaction(() => {
    for (const row of rows) {
      const calculated = getFiscalPeriodFromDate(row.end_date);
      if (!calculated || calculated === String(row.fiscal_period || '').trim()) continue;
      update.run(calculated, row.id);
      updated += 1;
    }
  })();

  return updated;
}

function runMigrations(db) {
  const existingWorkdaysColumn = getTableColumn(db, 'employees', 'workdays');
  const existingWorkdaysCustomColumn = getTableColumn(db, 'employees', 'workdays_is_custom');
  const previousDefaultWorkdays = numericColumnDefault(
    existingWorkdaysColumn,
    DEFAULT_ANNUAL_WORKDAYS,
  );

  addColumn(db, 'ALTER TABLE employees ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  addColumn(db, "ALTER TABLE employees ADD COLUMN designation TEXT DEFAULT ''");
  addColumn(
    db,
    `ALTER TABLE employees ADD COLUMN workdays INTEGER NOT NULL DEFAULT ${DEFAULT_ANNUAL_WORKDAYS}`,
  );
  addColumn(db, 'ALTER TABLE employees ADD COLUMN workdays_is_custom INTEGER NOT NULL DEFAULT 0');

  if (!existingWorkdaysCustomColumn) {
    db.prepare(`
      UPDATE employees
      SET workdays_is_custom = CASE
        WHEN workdays IS NULL OR workdays = ? THEN 0
        ELSE 1
      END
    `).run(previousDefaultWorkdays);
  }

  db.prepare(`
    UPDATE employees
    SET workdays = ?
    WHERE COALESCE(workdays_is_custom, 0) = 0
  `).run(DEFAULT_ANNUAL_WORKDAYS);
  addColumn(db, "ALTER TABLE assignments ADD COLUMN customer_name TEXT DEFAULT ''");
  addColumn(db, "ALTER TABLE assignments ADD COLUMN product_name TEXT DEFAULT ''");
  addColumn(db, 'ALTER TABLE projects ADD COLUMN fiscal_period TEXT');
  addColumn(db, 'ALTER TABLE projects ADD COLUMN import_row_no INTEGER');
  addColumn(db, 'ALTER TABLE projects ADD COLUMN not_local_project INTEGER NOT NULL DEFAULT 0');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_fiscal_period ON projects(fiscal_period)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_import_row_no ON projects(import_row_no)').run();

  try {
    const repaired = repairProjectFiscalPeriods(db);
    if (repaired > 0) console.log(`Corrected Fiscal Period for ${repaired} project row${repaired === 1 ? '' : 's'}.`);
  } catch (error) { console.error('Project Fiscal Period correction migration failed:', error); }
  try { ensureDuplicateProjectCodes(db); }
  catch (error) { console.error('Project duplicate-code compatibility migration failed:', error); }
  try { ensureTimesheetTable(db); }
  catch (error) { console.error('Time Sheet table migration failed:', error); }
  try { ensureTimesheetDetailTable(db); }
  catch (error) { console.error('Time Sheet detail table migration failed:', error); }
  try { ensureRevenueRatesTable(db); }
  catch (error) { console.error('Revenue rate table migration failed:', error); }
  try { ensureCommittedTargetsTable(db); }
  catch (error) { console.error('Committed target table migration failed:', error); }
  try { ensurePreSaleProductsTable(db); }
  catch (error) { console.error('PreSale Product table migration failed:', error); }
  try { ensurePsTeamAssignmentsTable(db); }
  catch (error) { console.error('PS team assignment table migration failed:', error); }
  try { canonicalizeKnownPeople(db); }
  catch (error) { console.error('Person identity canonicalization migration failed:', error); }
}

module.exports = { repairProjectFiscalPeriods, runMigrations };
