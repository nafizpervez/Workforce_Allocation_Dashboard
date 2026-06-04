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

/* ── 28 Active / Prospect pipeline projects (PSreport.xlsx current) ── */
const PIPELINE_PROJECTS = [
  { code: 'SA136664', product_amount: 1500, account_name: 'Institute of Water Modelling (IWM)', product_name: 'PS Project Implementation', name: 'Desktop SW for IWM 2026', end_date: '2026-07-15', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 16380, probability: 10, stage: 'Prospect', priority: 'Low', color: '#8B5CF6' },
  { code: 'SA133040', product_amount: 8000, account_name: "Cox's Bazar Development Authority (COXDA)", product_name: 'PS Project Delivery', name: 'ENT STD for COXDA', end_date: '2026-10-29', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 52514, probability: 10, stage: 'Prospect', priority: 'Low', color: '#14B8A6' },
  { code: 'SA131887', product_amount: 3000, account_name: 'Bangladesh Forest Department (BFD)', product_name: 'PS Project Implementation', name: 'GIS SW for RIMS Department of Forest', end_date: '2026-11-25', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 118657, probability: 10, stage: 'Prospect', priority: 'Low', color: '#EC4899' },
  { code: 'SA123377', product_amount: 0, account_name: 'Bangladesh Railway', product_name: 'PS System Support', name: 'GIS Software for Railway', end_date: '2026-12-30', opportunity_owner: 'Zobayer Ahmed', opp_amount: 74368, probability: 10, stage: 'Prospect', priority: 'Low', color: '#F59E0B' },
  { code: 'SA127332', product_amount: 5000, account_name: 'Dhaka Electric Supply Company Limited (DESCO)', product_name: 'PS Project Implementation', name: 'GIS SW MNT project of DESCO', end_date: '2027-01-19', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 128652.5, probability: 10, stage: 'Prospect', priority: 'Low', color: '#10B981' },
  { code: 'SA130515', product_amount: 3500, account_name: 'Bangladesh Bureau Statistics (BBS)', product_name: 'PS Project Implementation', name: 'MNT of ArcGIS Enterprise License', end_date: '2026-06-30', opportunity_owner: 'Zobayer Ahmed', opp_amount: 75039.45, probability: 20, stage: 'Qualify', priority: 'Low', color: '#6366F1' },
  { code: 'SA129036', product_amount: 2000, account_name: 'Survey of Bangladesh (SOB)', product_name: 'PS Project Implementation', name: 'GIS SW - Enterprise MNT', end_date: '2026-07-15', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 49757.65, probability: 20, stage: 'Qualify', priority: 'Low', color: '#06B6D4' },
  { code: 'SA129876', product_amount: 190, account_name: 'Pabna University of Science & Technology (PUST)', product_name: 'PS System Support', name: 'Esri EduSW SmallLab license 1 year - 2025 - URPPUST', end_date: '2026-09-30', opportunity_owner: 'Most Iffat Ara Ila', opp_amount: 658.35, probability: 20, stage: 'Qualify', priority: 'Low', color: '#F43F5E' },
  { code: 'SA136729', product_amount: 35000, account_name: 'Grameenphone (GP)', product_name: 'PS Project Implementation', name: 'ArcGIS Solution for Grameenphone (GP)', end_date: '2026-09-30', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 60000, probability: 20, stage: 'Qualify', priority: 'High', color: '#84CC16' },
  { code: 'SA126709', product_amount: 20000, account_name: 'Survey of Bangladesh (SOB)', product_name: 'PS Project Implementation', name: 'Cartographic Generalization Tool', end_date: '2026-10-15', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 20000, probability: 20, stage: 'Qualify', priority: 'Medium', color: '#A855F7' },
  { code: 'SA129392', product_amount: 190, account_name: 'Department of Urban & Regional Planning - BUET', product_name: 'PS System Support', name: 'Esri EduSW MediumLab license 2 year - 2025_URPBUET', end_date: '2026-10-25', opportunity_owner: 'Most Iffat Ara Ila', opp_amount: 2065.3, probability: 20, stage: 'Qualify', priority: 'Low', color: '#0EA5E9' },
  { code: 'SA129391', product_amount: 190, account_name: 'Aviation and Aerospace University, Bangladesh (AAUB)', product_name: 'PS System Support', name: 'Esri EduSW MediumLab license 2 year - 2025_AeroEnginering', end_date: '2026-11-30', opportunity_owner: 'Most Iffat Ara Ila', opp_amount: 2065.3, probability: 20, stage: 'Qualify', priority: 'Low', color: '#EAB308' },
  { code: 'SA132162', product_amount: 190, account_name: 'Arannayk Foundation', product_name: 'PS System Support', name: 'Esri NPO SW for Arannayk 2025', end_date: '2026-11-19', opportunity_owner: 'Most Iffat Ara Ila', opp_amount: 856.9, probability: 20, stage: 'Qualify', priority: 'Low', color: '#22C55E' },
  { code: 'SA135695', product_amount: 1000, account_name: 'Directorate of Technical Education', product_name: 'PS Project Implementation', name: 'DTE_ArcGIS_Pro_Advanced_Phase 2', end_date: '2026-12-24', opportunity_owner: 'Zobayer Ahmed', opp_amount: 102116, probability: 20, stage: 'Qualify', priority: 'Medium', color: '#3B82F6' },
  { code: 'SA124747', product_amount: 3200, account_name: 'Urban Development Directorate (UDD)', product_name: 'PS Project Implementation', name: 'UDD Urban Planning Solution', end_date: '2026-06-25', opportunity_owner: 'Abdullah Al Baki', opp_amount: 120766, probability: 40, stage: 'Validate', priority: 'High', color: '#D946EF' },
  { code: 'SA136880', product_amount: 4450, account_name: 'Data Experts (Pvt) Limited (datEx)', product_name: 'PS Project Implementation', name: 'Service Work for Datex', end_date: '2026-07-31', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 4450, probability: 40, stage: 'Validate', priority: 'Medium', color: '#8B5CF6' },
  { code: 'SA119655', product_amount: 10000, account_name: 'West Zone Power Distribution Company Ltd (WZPDCL)', product_name: 'PS System Support', name: 'ArcGIS SW for WZPDCL - GIS & SCADA based ADMS project', end_date: '2026-12-10', opportunity_owner: 'Abdullah Al Baki', opp_amount: 140249, probability: 40, stage: 'Validate', priority: 'High', color: '#14B8A6' },
  { code: 'SA125314', product_amount: 2880, account_name: 'Palli Karma Sahayak Foundation (PKSF)', product_name: 'PS Project Implementation', name: 'SW for Centralized GIS Platform of PKSF', end_date: '2026-07-14', opportunity_owner: 'Zobayer Ahmed', opp_amount: 118537, probability: 45, stage: 'Presentation - Solve', priority: 'High', color: '#EC4899' },
  { code: 'SA119653', product_amount: 2500, account_name: 'Bangladesh Petroleum Exploration Company (BAPEX)', product_name: 'PS Project Implementation', name: 'Esri SW for BAPEX', end_date: '2026-07-09', opportunity_owner: 'Abdullah Al Baki', opp_amount: 76314, probability: 45, stage: 'Presentation - Solve', priority: 'High', color: '#F59E0B' },
  { code: 'SA129156', product_amount: 36000, account_name: 'Omera Petroleum Limited', product_name: 'PS Project Implementation', name: 'Omera Fleet Management', end_date: '2026-08-30', opportunity_owner: 'Md Naiemul Haque Chowdhury', opp_amount: 120857, probability: 45, stage: 'Presentation - Solve', priority: 'High', color: '#10B981' },
  { code: 'SA129792', product_amount: 190, account_name: 'Chittagong University of Engineering and Technology (CUET)', product_name: 'PS System Support', name: 'Esri EduSW MediumLab license 5 year - 2025 - CUET', end_date: '2026-09-16', opportunity_owner: 'Most Iffat Ara Ila', opp_amount: 4880.82, probability: 45, stage: 'Presentation - Solve', priority: 'Low', color: '#6366F1' },
  { code: 'SA131666', product_amount: 1350, account_name: 'Bangladesh Power Development Board (BPDB)', product_name: 'PS System Support', name: 'BPDB SW Maintenance 2026', end_date: '2026-05-14', opportunity_owner: 'Mohammad A. Hadi', opp_amount: 57857.4, probability: 60, stage: 'Proposal', priority: 'High', color: '#06B6D4' },
  { code: 'SA131817', product_amount: 190, account_name: 'Department of Geology - DU', product_name: 'PS System Support', name: 'Esri EduSW MediumLab license 3 years - 2025 - GeoDU', end_date: '2026-06-24', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 3002.95, probability: 60, stage: 'Proposal', priority: 'Low', color: '#F43F5E' },
  { code: 'SA133734', product_amount: 246, account_name: 'Gas Transmission Company Limited (GTCL)', product_name: 'PS Project Implementation', name: 'Upgradation to ArcGIS Online Creator User Type Annual Subscription', end_date: '2026-06-30', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 1760, probability: 80, stage: 'Negotiate', priority: 'Medium', color: '#84CC16' },
  { code: 'SA136260', product_amount: 190, account_name: 'Independent University Bangladesh', product_name: 'PS System Support', name: 'ArcGIS Medium Lab: 2026-2027', end_date: '2026-04-09', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 1127.65, probability: 100, stage: 'Closed Won', priority: 'Low', color: '#A855F7', project_closing_date: '' },
  { code: 'SA129008', product_amount: 5320, account_name: '24 Engineer Construction Brigade', product_name: 'PS System Support', name: 'Esri SW for BD Army 24 Engineers', end_date: '2026-04-30', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 45699.8, probability: 100, stage: 'Closed Won', priority: 'High', color: '#0EA5E9', project_closing_date: '' },
  { code: 'SA137026', product_amount: 190, account_name: 'BRAC', product_name: 'PS System Support', name: 'AGOL PRO PLUS for BRAC', end_date: '2026-05-17', opportunity_owner: 'Basher Muhammad Raquibul Raquibul', opp_amount: 799.9, probability: 100, stage: 'Closed Won', priority: 'Low', color: '#EAB308', project_closing_date: '' },
  { code: 'SA132317', product_amount: 3005, account_name: 'Directorate of Technical Education', product_name: 'PS Project Implementation', name: 'DTE_ArcGIS_Pro_Advance', end_date: '2026-05-20', opportunity_owner: 'Zobayer Ahmed', opp_amount: 245283.4, probability: 100, stage: 'Closed Won', priority: 'High', color: '#22C55E', project_closing_date: '' },
];

/* ── Historical projects from PSreport full data ────────────────
   mkp(closeDate, owner, code, productName, name, account, prob, productAmt, amt, stage)
   ─────────────────────────────────────────────────────────────── */
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

module.exports = { getDb, createSchema, seed, DB_PATH, fiscalYearLabel };
if (require.main === module) cli();