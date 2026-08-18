const TEAM_UTILIZATION_INPUT_TEAMS = Object.freeze(['local', 'intra']);
const TEAM_UTILIZATION_INPUT_TEAM_SET = new Set(TEAM_UTILIZATION_INPUT_TEAMS);

function ensureTeamUtilizationInputsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ps_team_utilization_inputs (
      team TEXT NOT NULL,
      month TEXT NOT NULL,
      project_days REAL,
      utilization_percent REAL,
      comments TEXT NOT NULL DEFAULT '',
      updated_at TEXT,
      PRIMARY KEY (team, month),
      CHECK (team IN ('local', 'intra')),
      CHECK (project_days IS NULL OR project_days >= 0),
      CHECK (utilization_percent IS NULL OR utilization_percent >= 0)
    )
  `).run();

  const columns = db.prepare(`PRAGMA table_info(ps_team_utilization_inputs)`).all();
  if (!columns.some(column => column.name === 'utilization_percent')) {
    db.prepare(`ALTER TABLE ps_team_utilization_inputs ADD COLUMN utilization_percent REAL`).run();
  }

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ps_team_utilization_inputs_month
    ON ps_team_utilization_inputs(month)
  `).run();
}

function normalizeTeam(value) {
  const team = String(value || '').trim().toLowerCase();
  if (!TEAM_UTILIZATION_INPUT_TEAM_SET.has(team)) {
    throw new Error('Team must be local or intra.');
  }
  return team;
}

function normalizeMonth(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error('Month must use YYYY-MM format.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1900 || year > 9998 || month < 1 || month > 12) {
    throw new Error('A valid month is required.');
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function normalizeUtilizationPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error('Next Month Project Utilization must be zero or a positive percentage.');
  }
  return +number.toFixed(2);
}

function normalizeComments(value) {
  const comments = String(value ?? '');
  if (comments.length > 2000) throw new Error('Comments cannot exceed 2000 characters.');
  return comments;
}

function serializeRow(row) {
  return {
    team: row.team,
    month: row.month,
    utilizationPercent: row.utilization_percent === null || row.utilization_percent === undefined
      ? null
      : Number(row.utilization_percent),
    comments: row.comments || '',
    updatedAt: row.updated_at || null,
  };
}

function fiscalMonthBounds(fiscalYear) {
  const start = Number(fiscalYear);
  if (!Number.isInteger(start) || start < 1900 || start > 9998) {
    throw new Error('A valid fiscalYear is required.');
  }
  return {
    start: `${start}-04`,
    end: `${start + 1}-03`,
  };
}

function listTeamUtilizationInputs(db, fiscalYear) {
  ensureTeamUtilizationInputsTable(db);
  const bounds = fiscalMonthBounds(fiscalYear);
  return db.prepare(`
    SELECT team, month, utilization_percent, comments, updated_at
    FROM ps_team_utilization_inputs
    WHERE month >= ? AND month <= ?
    ORDER BY month, team
  `).all(bounds.start, bounds.end).map(serializeRow);
}

function saveTeamUtilizationInput(db, teamValue, monthValue, input = {}) {
  ensureTeamUtilizationInputsTable(db);
  const team = normalizeTeam(teamValue);
  const month = normalizeMonth(monthValue);
  const utilizationPercent = normalizeUtilizationPercent(input.utilizationPercent);
  const comments = normalizeComments(input.comments);

  db.prepare(`
    INSERT INTO ps_team_utilization_inputs (
      team,
      month,
      utilization_percent,
      comments,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(team, month) DO UPDATE SET
      utilization_percent = excluded.utilization_percent,
      comments = excluded.comments,
      updated_at = CURRENT_TIMESTAMP
  `).run(team, month, utilizationPercent, comments);

  return serializeRow(db.prepare(`
    SELECT team, month, utilization_percent, comments, updated_at
    FROM ps_team_utilization_inputs
    WHERE team = ? AND month = ?
  `).get(team, month));
}

module.exports = {
  TEAM_UTILIZATION_INPUT_TEAMS,
  ensureTeamUtilizationInputsTable,
  listTeamUtilizationInputs,
  normalizeMonth,
  normalizeTeam,
  saveTeamUtilizationInput,
};
