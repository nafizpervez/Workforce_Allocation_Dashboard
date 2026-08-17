const { canonicalPersonName } = require('./person-identity');

const PS_TEAM_LOCAL = 'Local PS';
const PS_TEAM_INTRA = 'Intra-Sourcing';
const VALID_PS_TEAMS = new Set([PS_TEAM_LOCAL, PS_TEAM_INTRA]);

function createPsTeamAssignmentsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS employee_ps_team_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      effective_month TEXT NOT NULL,
      assigned_to TEXT NOT NULL CHECK (assigned_to IN ('Local PS', 'Intra-Sourcing', 'Unassigned')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, effective_month),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `).run();
}

function ensurePsTeamAssignmentsTable(db) {
  const existing = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'employee_ps_team_assignments'
  `).get();

  if (!existing) {
    createPsTeamAssignmentsTable(db);
  } else if (!/Unassigned/.test(String(existing.sql || ''))) {
    // Older builds allowed only Local PS / Intra-Sourcing.  Carry-forward
    // semantics require an explicit unassigned event so a resource can be
    // removed from a previously inherited team without rewriting history.
    db.transaction(() => {
      db.exec('ALTER TABLE employee_ps_team_assignments RENAME TO employee_ps_team_assignments_legacy');
      createPsTeamAssignmentsTable(db);
      db.exec(`
        INSERT INTO employee_ps_team_assignments(
          id, employee_id, effective_month, assigned_to, created_at, updated_at
        )
        SELECT id, employee_id, effective_month, assigned_to, created_at, updated_at
        FROM employee_ps_team_assignments_legacy
      `);
      db.exec('DROP TABLE employee_ps_team_assignments_legacy');
    })();
  }

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_employee_ps_team_assignments_effective
    ON employee_ps_team_assignments(employee_id, effective_month)
  `).run();
}

function pad(value) {
  return String(Number(value) || 0).padStart(2, '0');
}

function monthKey(year, month) {
  return `${Number(year)}-${pad(month)}`;
}

function monthStart(year, month) {
  return `${monthKey(year, month)}-01`;
}

function normalizeMonth(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1900 || year > 9998 || month < 1 || month > 12) return null;
  return { year, month, key: monthKey(year, month), start: monthStart(year, month) };
}

function getEmployees(db) {
  return db.prepare(`
    SELECT id, name, designation, COALESCE(active, 1) AS active
    FROM employees
    ORDER BY id
  `).all().map(row => ({
    ...row,
    name: canonicalPersonName(row.name),
  }));
}

function getManualAssignments(db) {
  ensurePsTeamAssignmentsTable(db);
  return db.prepare(`
    SELECT employee_id, effective_month, assigned_to, created_at, updated_at
    FROM employee_ps_team_assignments
    ORDER BY employee_id, effective_month
  `).all();
}

function assignmentEffectiveForMonth(assignments, employeeId, targetMonthStart) {
  let resolved = null;
  for (const row of assignments || []) {
    if (Number(row.employee_id) !== Number(employeeId)) continue;
    const effectiveMonth = String(row.effective_month || '');
    if (!effectiveMonth || effectiveMonth > targetMonthStart) continue;
    if (!resolved || effectiveMonth > String(resolved.effective_month || '')) resolved = row;
  }
  return resolved;
}

function effectiveMonthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function buildAssignmentForEmployee({ employee, target, assignments }) {
  const manual = assignmentEffectiveForMonth(assignments, employee.id, target.start);
  const explicitUnassigned = manual?.assigned_to === 'Unassigned';
  const assignedTo = explicitUnassigned ? null : (manual?.assigned_to || null);
  const originMonth = effectiveMonthKey(manual?.effective_month);
  const exactMonth = Boolean(manual && String(manual.effective_month || '') === target.start);
  let source = 'unassigned';
  if (manual) {
    if (explicitUnassigned) source = exactMonth ? 'manual-unassigned' : 'carried-forward-unassigned';
    else source = exactMonth ? 'manual' : 'carried-forward';
  }

  return {
    employeeId: Number(employee.id),
    employeeName: employee.name,
    designation: employee.designation || '',
    active: Number(employee.active) !== 0,
    monthKey: target.key,
    effectiveMonth: originMonth || null,
    assignedTo,
    source,
  };
}

function buildAssignmentSnapshot(db, year, month, context = null) {
  const target = normalizeMonth(`${year}-${month}`);
  if (!target) throw new Error('Invalid assignment month.');
  const data = context || {
    employees: getEmployees(db),
    assignments: getManualAssignments(db),
  };
  return {
    monthKey: target.key,
    assignments: data.employees.map(employee => buildAssignmentForEmployee({
      employee,
      target,
      assignments: data.assignments,
    })),
  };
}

function fiscalMonths(fiscalYear) {
  const start = Number(fiscalYear);
  if (!Number.isInteger(start) || start < 1900 || start > 9998) throw new Error('Invalid fiscal year.');
  return [4,5,6,7,8,9,10,11,12].map(month => ({ year: start, month }))
    .concat([1,2,3].map(month => ({ year: start + 1, month })));
}

function buildFiscalAssignmentCalendar(db, fiscalYear, now = new Date()) {
  ensurePsTeamAssignmentsTable(db);
  const context = {
    employees: getEmployees(db),
    assignments: getManualAssignments(db),
  };
  const months = {};
  for (const item of fiscalMonths(fiscalYear)) {
    const snapshot = buildAssignmentSnapshot(db, item.year, item.month, context);
    months[snapshot.monthKey] = snapshot;
  }
  const currentSnapshot = buildAssignmentSnapshot(
    db,
    now.getFullYear(),
    now.getMonth() + 1,
    context,
  );
  return {
    fiscalYear: Number(fiscalYear),
    months,
    current: currentSnapshot,
  };
}

function saveManualAssignment(db, employeeId, assignedTo, effectiveMonth) {
  ensurePsTeamAssignmentsTable(db);
  const employee = db.prepare('SELECT id, name FROM employees WHERE id = ?').get(Number(employeeId));
  if (!employee) throw new Error('Employee not found.');
  const target = normalizeMonth(effectiveMonth);
  if (!target) throw new Error('A valid effective month is required.');

  const normalizedTeam = String(assignedTo || '').trim();
  if (normalizedTeam && !VALID_PS_TEAMS.has(normalizedTeam)) {
    throw new Error('Assigned To must be blank, Local PS or Intra-Sourcing.');
  }

  // Blank is an explicit effective-dated unassignment.  Storing it as an
  // event (instead of deleting the row) stops any earlier team assignment
  // from carrying forward past this month.
  const storedTeam = normalizedTeam || 'Unassigned';
  db.prepare(`
    INSERT INTO employee_ps_team_assignments(employee_id, effective_month, assigned_to, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id, effective_month)
    DO UPDATE SET assigned_to = excluded.assigned_to, updated_at = CURRENT_TIMESTAMP
  `).run(Number(employeeId), target.start, storedTeam);

  return {
    employeeId: Number(employeeId),
    employeeName: canonicalPersonName(employee.name),
    effectiveMonth: target.key,
    assignedTo: normalizedTeam || null,
    source: normalizedTeam ? 'manual' : 'manual-unassigned',
  };
}

module.exports = {
  PS_TEAM_INTRA,
  PS_TEAM_LOCAL,
  VALID_PS_TEAMS,
  buildAssignmentSnapshot,
  buildFiscalAssignmentCalendar,
  ensurePsTeamAssignmentsTable,
  monthKey,
  normalizeMonth,
  saveManualAssignment,
};
