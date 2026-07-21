const { ensureRevenueRatesTable } = require('../services/revenue-rates');
const { ensureCommittedTargetsTable } = require('../services/committed-targets');
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
}

function runMigrations(db) {
  addColumn(db, 'ALTER TABLE employees ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  addColumn(db, "ALTER TABLE employees ADD COLUMN designation TEXT DEFAULT ''");
  addColumn(db, 'ALTER TABLE employees ADD COLUMN workdays INTEGER NOT NULL DEFAULT 220');
  addColumn(db, "ALTER TABLE assignments ADD COLUMN customer_name TEXT DEFAULT ''");
  addColumn(db, "ALTER TABLE assignments ADD COLUMN product_name TEXT DEFAULT ''");
  addColumn(db, 'ALTER TABLE projects ADD COLUMN fiscal_period TEXT');
  addColumn(db, 'ALTER TABLE projects ADD COLUMN import_row_no INTEGER');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_fiscal_period ON projects(fiscal_period)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_import_row_no ON projects(import_row_no)').run();

  try { ensureDuplicateProjectCodes(db); }
  catch (error) { console.error('Project duplicate-code compatibility migration failed:', error); }
  try { ensureTimesheetTable(db); }
  catch (error) { console.error('Time Sheet table migration failed:', error); }
  try { ensureRevenueRatesTable(db); }
  catch (error) { console.error('Revenue rate table migration failed:', error); }
  try { ensureCommittedTargetsTable(db); }
  catch (error) { console.error('Committed target table migration failed:', error); }
  try { canonicalizeKnownPeople(db); }
  catch (error) { console.error('Person identity canonicalization migration failed:', error); }
}

module.exports = { runMigrations };
