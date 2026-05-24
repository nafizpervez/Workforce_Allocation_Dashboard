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
  ];
  for (const sql of newProjectCols) { try { db.exec(sql); } catch (_) { } }
}

/* ── Employees ──────────────────────────────────────────────── */
const REAL_EMPLOYEES = [
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

function mkp(closeDate, owner, code, productName, name, account, prob, productAmt, amt, stage) {
  return {
    code, name, account_name: account, product_name: productName,
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
const HISTORICAL_PROJECTS = [
  mkp('1/31/2022', 'Basher Muhammad Raquibul Raquibul', 'SA8503', 'PS SYSTEM SUPPORT', 'Esri SW for DESCO - GIS Project', 'Dhaka Electric Supply Company Limited (DESCO)', 100, 5994.03, 94904.53, 'Closed Won'),
  mkp('7/28/2025', 'Most Iffat Ara Ila', 'SA129075', 'PS System Support', 'Esri EduSW MediumLab license 3 year-IRSJU', 'JU-Institute of Remote Sensing and GIS', 100, 190, 3005.52, 'Closed Won'),
  mkp('5/31/2023', 'Most Iffat Ara Ila', 'SA094716', 'PS SYSTEM SUPPORT', 'Inland Water GIS Solution - BIWTA', 'Bangladesh Inland Water Transport Authority (BIWTA)', 100, 1945.79, 51477.18, 'Closed Won'),
  mkp('8/13/2025', 'Most Iffat Ara Ila', 'SA129643', 'PS System Support', 'NPO SW for CCDB', 'Christian Commission for Development in Bangladesh (CCDB)', 0, 285, 2724.6, 'Closed Lost'),
  mkp('8/26/2025', 'Most Iffat Ara Ila', 'SA129810', 'PS System Support', 'NPO SW for FSIF', 'Forest Service International Foundation - Bangladesh', 100, 190, 393.3, 'Closed Won'),
  mkp('9/5/2023', 'Most Iffat Ara Ila', 'SA109452', 'PS SYSTEM SUPPORT', '2nd Renewal of Esri NPO SW for Arannayk', 'Arannayk Foundation', 100, 114.57, 340.28, 'Closed Won'),
  mkp('8/16/2023', 'Most Iffat Ara Ila', 'SA103900', 'PS SYSTEM SUPPORT', 'EsriSW for Planning Commision (IBCX Primax)', 'Planning Commission, Bangladesh', 100, 1647.58, 32309.6, 'Closed Won'),
  mkp('4/10/2023', 'Most Iffat Ara Ila', 'SA32580', 'PS SYSTEM SUPPORT', 'EnviSW for SRDI Cropping Project', 'Soil Resources Development Institute (SRDI)', 100, 4550.15, 24723.82, 'Closed Won'),
  mkp('8/16/2023', 'Most Iffat Ara Ila', 'SA103737', 'PS PROJECT IMPLEMENTATION', 'PS for SRDI Cropping Project', 'Soil Resources Development Institute (SRDI)', 100, 4910.44, 4910.44, 'Closed Won'),
  mkp('5/28/2023', 'Most Iffat Ara Ila', 'SA101415', 'PS SYSTEM SUPPORT', 'EsriSW for SOB Upazila Project Phase 1', 'Survey of Bangladesh (SOB)', 100, 1965.08, 46601.97, 'Closed Won'),
  mkp('12/5/2023', 'Most Iffat Ara Ila', 'SA107908', 'PS SYSTEM SUPPORT', 'GIS Software - Upazila Project of SOB Phase 2', 'Survey of Bangladesh (SOB)', 100, 524.71, 44409.18, 'Closed Won'),
  mkp('5/17/2023', 'Most Iffat Ara Ila', 'SA101414', 'PS SYSTEM SUPPORT', 'EsriSW for BFD', 'Bangladesh Forest Department (BFD)', 100, 282.82, 17192.66, 'Closed Won'),
  mkp('5/17/2023', 'Most Iffat Ara Ila', 'SA101416', 'PS SYSTEM SUPPORT', 'EnviSW for BFD', 'Bangladesh Forest Department (BFD)', 100, 1996.71, 20574.33, 'Closed Won'),
  mkp('7/9/2023', 'Most Iffat Ara Ila', 'SA107278', 'PS SYSTEM SUPPORT', 'Esri EduSW MediumLab license 2 year - 2023_URPKU', 'Urban & Rural Planning Discipline - KU', 100, 119.39, 1008.82, 'Closed Won'),
  mkp('7/28/2025', 'Most Iffat Ara Ila', 'SA129061', 'PS System Support', 'Esri EduSW MediumLab license 2 year - 2025_URPKU', 'Urban & Rural Planning Discipline - KU', 100, 190, 2065.3, 'Closed Won'),
  mkp('7/31/2023', 'Mohammad A. Hadi', 'SA104786', 'PS SYSTEM SUPPORT', 'GIS Software MNT - RCIP Project of LGED', 'Local Government Engineering Department (LGED)', 100, 2015.17, 54736.98, 'Closed Won'),
  mkp('11/15/2023', 'Mohammad A. Hadi', 'SA108645', 'PS SYSTEM SUPPORT', 'GIS Software - Planning Division of DDC', 'Development Design Consultants Limited (DDC)', 100, 317.53, 19887.73, 'Closed Won'),
  mkp('8/16/2023', 'Mohammad A. Hadi', 'SA104960', 'PS SYSTEM SUPPORT', 'EsriSW for UDD City Planning', 'Urban Development Directorate (UDD)', 100, 516.89, 10392.03, 'Closed Won'),
  mkp('9/22/2025', 'Abdullah Al Baki', 'SA123220', 'PS Project Implementation', 'EsriSW for ENC of BIWTA', 'Bangladesh Inland Water Transport Authority (BIWTA)', 100, 400, 59289.6, 'Closed Won'),
  mkp('7/17/2023', 'Mohammad A. Hadi', 'SA107919', 'PS SYSTEM SUPPORT', 'EsriSW for Oxfam Bangladesh (NPO)', 'Oxfam Bangladesh', 100, 183.91, 1425.9, 'Closed Won'),
  mkp('9/18/2023', 'Mohammad A. Hadi', 'SA108226', 'PS SYSTEM SUPPORT', 'EsriSW for CPA', 'Chittagong Port Authority', 100, 257.33, 6514.52, 'Closed Won'),
  mkp('10/29/2025', 'Basher Muhammad Raquibul Raquibul', 'SA131519', 'PS Project Implementation', 'SOB Seamless Tool 2025', 'Survey of Bangladesh (SOB)', 100, 1000, 18000, 'Closed Won'),
  mkp('10/29/2025', 'Basher Muhammad Raquibul Raquibul', 'SA131519', 'PS Project Delivery', 'SOB Seamless Tool 2025 - Delivery', 'Survey of Bangladesh (SOB)', 100, 15000, 18000, 'Closed Won'),
  mkp('11/3/2025', 'Basher Muhammad Raquibul Raquibul', 'SA117235', 'PS Project Implementation', 'GIS SW Maintenance and Upgradation for BREB', 'Bangladesh Rural Electrification Board (BREB)', 100, 3150, 58711.5, 'Closed Won'),
  mkp('1/5/2026', 'Basher Muhammad Raquibul Raquibul', 'SA132728', 'PS System Support', 'Esri EduSW SmallLab license 1 year - 2025 - BAU', 'Bangladesh Agriculture University (BAU)', 100, 190, 658.35, 'Closed Won'),
  mkp('9/28/2025', 'Ahtesham Hyder Nehal (INACTIVE)', 'SA127447', 'PS Project Implementation', 'ArcGIS Solution for bKash Ltd - Perpetual', 'bKash Limited', 100, 5000, 76235.51, 'Closed Won'),
  mkp('8/25/2025', 'Ahtesham Hyder Nehal (INACTIVE)', 'SA127533', 'PS Project Implementation', 'GIS Solution - DWASA', 'Dhaka Water Supply & Sewerage Authority (DWASA)', 100, 2000, 77023.55, 'Closed Won'),
  mkp('2/26/2026', 'Abdullah Al Baki', 'SA124188', 'PS Project Implementation', 'SW for BFD Land Demarcation Project', 'Bangladesh Forest Department (BFD)', 100, 5008, 12314, 'Closed Won'),
  mkp('11/23/2025', 'Abdullah Al Baki', 'SA099221', 'PS Project Implementation', 'GIS SW for BORI', 'Bangladesh Oceanographic Research Institute', 100, 2125, 59745.65, 'Closed Won'),
  mkp('5/2/2024', 'Most Iffat Ara Ila', 'SA099220', 'PS SYSTEM SUPPORT', 'EsriSW for GSB', 'Geological Survey of Bangladesh (GSB)', 0, 277.47, 17200.35, 'Closed Lost'),
  mkp('1/3/2024', 'Most Iffat Ara Ila', 'SA110599', 'PS SYSTEM SUPPORT', 'Basic Mapping Package Solution Update for GDA with DDM', 'Development Design and Management (DDML)', 0, 336.26, 1893.82, 'Closed Lost'),
  mkp('9/3/2024', 'Mohammad A. Hadi', 'SA114136', 'PS SYSTEM SUPPORT', 'GIS Software - NTMC', 'National Telecommunication Monitoring Center (NTMC)', 0, 2860.72, 54896.02, 'Closed Lost'),
  mkp('9/2/2025', 'Ahtesham Hyder Nehal (INACTIVE)', 'SA127446', 'PS Project Implementation', 'ArcGIS Solution for bKash Ltd - Subscription', 'bKash Limited', 0, 1600, 34300, 'Closed Lost'),
  mkp('5/2/2024', 'Abdullah Al Baki', 'SA104883', 'PS SYSTEM SUPPORT', 'Esri Solution for Crop Area Estimation - DAE', 'Department of Agriculture Extensions (DAE)', 0, 1109.88, 75588.31, 'Closed Lost'),
  mkp('5/2/2024', 'Most Iffat Ara Ila', 'SA116890', 'PS SYSTEM SUPPORT', 'GIS Software for BDRCS', 'Bangladesh Red Crescent Society (BDRCS)', 100, 124.05, 734.97, 'Closed Won'),
  mkp('1/30/2024', 'Most Iffat Ara Ila', 'SA114091', 'PS SYSTEM SUPPORT', 'Education SW - IWFM (BUET)', 'Institute of Water and Flood Management - BUET', 100, 118.59, 2327.39, 'Closed Won'),
  mkp('1/30/2024', 'Most Iffat Ara Ila', 'SA114092', 'PS SYSTEM SUPPORT', 'Education SW - Dept of G&E (SUST)', 'SUST-Department of Geography and Environment', 100, 118.59, 1885.63, 'Closed Won'),
  mkp('2/29/2024', 'Most Iffat Ara Ila', 'SA115026', 'PS SYSTEM SUPPORT', 'Education SW - Dept of G & E Studies (RU)', 'RU - Department of Geography and Environmental Studies', 100, 2433.34, 6326.68, 'Closed Won'),
  mkp('6/25/2024', 'Abdullah Al Baki', 'SA116781', 'PS PROJECT IMPLEMENTATION', 'GIS SW for Image Analysis of CCBS Project - SRDI', 'Soil Resources Development Institute (SRDI)', 100, 4522.61, 10569.91, 'Closed Won'),
  mkp('12/19/2024', 'Abdullah Al Baki', 'SA120383', 'PS System Support', 'GIS Solution: 12 Upazila project UDD', 'Urban Development Directorate (UDD)', 100, 2056, 33729.55, 'Closed Won'),
  mkp('11/11/2024', 'Md Ashad Uj Jaman Alif (INACTIVE)', 'SA108310', 'PS PROJECT IMPLEMENTATION', 'GIS Solution - Smart City Planning Lab', 'Rajdhani Unnayan Kartripakkha (RAJUK)', 100, 9870.6, 111420.65, 'Closed Won'),
  mkp('11/11/2024', 'Md Ashad Uj Jaman Alif (INACTIVE)', 'SA108310', 'PS SYSTEM SUPPORT', 'GIS Solution - Smart City Planning Lab (SW)', 'Rajdhani Unnayan Kartripakkha (RAJUK)', 100, 3290.2, 111420.65, 'Closed Won'),
  mkp('6/6/2024', 'Md Ashad Uj Jaman Alif (INACTIVE)', 'SA118600', 'PS SYSTEM SUPPORT', 'NPO Soln for NRC Bangladesh', 'Norwegian Refugee Council (NRC) - Bangladesh', 100, 315.3, 1326.17, 'Closed Won'),
  mkp('1/24/2024', 'Debashish Bhowmick', 'SA114968', 'PS PROJECT IMPLEMENTATION', 'PS Intrasource - Petronas Malaysia FY24 - 2nd part', 'Intrasourcing-Esri Malaysia', 100, 3606.18, 3606.18, 'Closed Won'),
  mkp('9/30/2024', 'Reduanur Rahman (INACTIVE)', 'SA109514', 'PS SYSTEM SUPPORT', 'GIS Software - Dhaka PBS 1', 'Dhaka PBS 1 (Palashbari, Savar)', 100, 588.68, 15661.72, 'Closed Won'),
  mkp('9/3/2024', 'Mohammad A. Hadi', 'SA109971', 'PS SYSTEM SUPPORT', 'EsriSW Extension - Distribution Project of BPDB', 'Bangladesh Power Development Board (BPDB)', 0, 1346.22, 26937.86, 'Closed Lost'),
  mkp('5/26/2024', 'Abdullah Al Baki', 'SA100333', 'PS SYSTEM SUPPORT', 'Basic Mapping Package Solution for DDC', 'Development Design Consultants Limited (DDC)', 0, 7165.97, 9812.6, 'Closed Lost'),
  mkp('12/3/2024', 'Abdullah Al Baki', 'SA116311', 'PS SYSTEM SUPPORT', 'GIS Software for Smart City Project of DNCC', 'Dhaka North City Corporation (DNCC)', 0, 5508.77, 158305.93, 'Closed Lost'),
  mkp('12/3/2024', 'Abdullah Al Baki', 'SA116311', 'PS PROJECT IMPLEMENTATION', 'GIS Software for Smart City Project of DNCC (Impl)', 'Dhaka North City Corporation (DNCC)', 0, 11017.53, 158305.93, 'Closed Lost'),
  mkp('9/3/2024', 'Ahtesham Hyder Nehal (INACTIVE)', 'SA094719', 'PS SYSTEM SUPPORT', 'Esri SW for CDA MasterPlan', 'Chattogram Development Authority (CDA)', 0, 215.4, 5628.28, 'Closed Lost'),
  mkp('11/13/2024', 'Reduanur Rahman (INACTIVE)', 'SA119131', 'PS SYSTEM SUPPORT', 'EsriSW for COXDA consultants', 'Celltron-Mango-Albarakh-Ekarchitects JV', 0, 554.31, 2023.23, 'Closed Lost'),
  mkp('5/27/2024', 'Abdullah Al Baki', 'SA110596', 'PS SYSTEM SUPPORT', 'GIS Software - SOB Rev Budget 23-24', 'Survey of Bangladesh (SOB)', 100, 3322, 60231.68, 'Closed Won'),
  mkp('3/29/2025', 'Abdullah Al Baki', 'SA123972', 'PS System Support', 'SW Maintenance - CEGIS', 'Centre for Environment and Geographic Information Services (CEGIS)', 100, 1143, 28927.8, 'Closed Won'),
  mkp('6/30/2024', 'Abdullah Al Baki', 'SA100221', 'PS PROJECT IMPLEMENTATION', 'Geodata Managed Service for datEx', 'Data Experts (Pvt) Limited (datEx)', 0, 5326.24, 5326.24, 'Closed Lost'),
  mkp('4/20/2025', 'Reduanur Rahman (INACTIVE)', 'SA124654', 'PS System Support', 'Esri SW for COXDA', 'Construction Supervision Consultant (CSC)', 0, 2000, 39263, 'Closed Lost'),
  mkp('1/3/2024', 'Debashish Bhowmick', 'SA113627', 'PS PROJECT IMPLEMENTATION', 'PS Intrasource - PUB Singapore FY24 (1)', 'Intrasourcing - Esri Singapore', 100, 1244.16, 2653.09, 'Closed Won'),
  mkp('1/3/2024', 'Debashish Bhowmick', 'SA113627', 'PS PROJECT IMPLEMENTATION', 'PS Intrasource - PUB Singapore FY24 (2)', 'Intrasourcing - Esri Singapore', 100, 1408.93, 2653.09, 'Closed Won'),
  mkp('9/15/2025', 'Debashish Bhowmick', 'SA129761', 'PS Project Implementation', 'WebGIS portal for BREB', 'Bangladesh Rural Electrification Board (BREB)', 0, 15000, 15000, 'Closed Lost'),
  mkp('11/14/2023', 'Debashish Bhowmick', 'SA103903', 'PS PROJECT IMPLEMENTATION', 'PS Intrasource - Petronas Malaysia FY24 - 1st part', 'Intrasourcing-Esri Malaysia', 100, 3483.26, 3483.26, 'Closed Won'),
  mkp('1/14/2024', 'Debashish Bhowmick', 'SA103905', 'PS PROJECT IMPLEMENTATION', 'PS Intrasource - Jupem Malaysia 2024', 'Intrasourcing-Esri Malaysia', 100, 4682.82, 4682.82, 'Closed Won'),
  mkp('11/14/2022', 'Most Iffat Ara Ila', 'SA099977', 'PS SYSTEM SUPPORT', 'Esri EduSW for CE-DUET', 'DUET - Dhaka University of Engineering & Technology', 100, 180.6, 629.09, 'Closed Won'),
  mkp('12/8/2021', 'Most Iffat Ara Ila', 'SA090635', 'PS SYSTEM SUPPORT', 'EsriSW for PAE', 'Pacific Architects & Engineers (PAE)', 100, 427.97, 3425.17, 'Closed Won'),
  mkp('8/14/2022', 'Most Iffat Ara Ila', 'SA098428', 'PS SYSTEM SUPPORT', 'EsriSW for NKBL', 'Nippon Koei Co., Ltd', 100, 283.8, 13310.41, 'Closed Won'),
  mkp('7/1/2022', 'Most Iffat Ara Ila', 'SA096059', 'PS SYSTEM SUPPORT', 'EsriSW for SUST', 'Shahjalal University of Science & Technology (SUST)', 100, 121.99, 576.42, 'Closed Won'),
  mkp('5/22/2021', 'Most Iffat Ara Ila', 'SA27346', 'PS SYSTEM SUPPORT', 'GIS and RS software for Lab AIUB', 'American International University, Bangladesh', 0, 232.92, 892.86, 'Closed Lost'),
  mkp('5/19/2021', 'Most Iffat Ara Ila', 'SA27800', 'PS SYSTEM SUPPORT', 'Esri SW for SAU Lab', 'Department of Agroforestry & Environmental Science (SAU)', 0, 232.39, 1665.45, 'Closed Lost'),
  mkp('1/28/2021', 'Most Iffat Ara Ila', 'SA30812', 'PS SYSTEM SUPPORT', 'Esri SW for MFCA', 'Metro Five Consultants Association (MFCA)', 100, 216.53, 1082.67, 'Closed Won'),
  mkp('2/21/2022', 'Most Iffat Ara Ila', 'SA093759', 'PS SYSTEM SUPPORT', 'Esri SW for MFCA - Year 2', 'Metro Five Consultants Association (MFCA)', 100, 172.76, 4991.59, 'Closed Won'),
  mkp('4/12/2021', 'Most Iffat Ara Ila', 'SA30986', 'PS SYSTEM SUPPORT', 'Annual Maintenance SW 01/04/2021 - 31/03/2022', 'Deutsche Gesellschaft fur International Climiate Change - GIZ Bangladesh', 100, 762.44, 3395.15, 'Closed Won'),
  mkp('6/8/2022', 'Most Iffat Ara Ila', 'SA095940', 'PS SYSTEM SUPPORT', 'Adaptation of Climate Change Project - 2022', 'Deutsche Gesellschaft fur International Climiate Change - GIZ Bangladesh', 100, 863.9, 3208.68, 'Closed Won'),
  mkp('3/14/2022', 'Most Iffat Ara Ila', 'SA31109', 'PS SYSTEM SUPPORT', 'EsriSW for DSM-DU', 'DU-Department of Disaster Science and Management', 100, 325.82, 2789.4, 'Closed Won'),
  mkp('2/15/2023', 'Most Iffat Ara Ila', 'SA32124', 'PS SYSTEM SUPPORT', 'EsriSW for Planning Commision (IBCX Primax) v2', 'Planning Commission, Bangladesh', 0, 1240.25, 41912.52, 'Closed Lost'),
  mkp('2/28/2023', 'Most Iffat Ara Ila', 'SA094926', 'PS SYSTEM SUPPORT', 'ArcGIS Desktop for CCBS Project - SRDI', 'Soil Resources Development Institute (SRDI)', 100, 1078.06, 22493.54, 'Closed Won'),
  mkp('6/8/2022', 'Most Iffat Ara Ila', 'SA094837', 'PS SYSTEM SUPPORT', 'EsriSW for 9 Upazila Project - UDD', 'Urban Development Directorate (UDD)', 100, 2447.73, 36648.5, 'Closed Won'),
  mkp('11/30/2021', 'Most Iffat Ara Ila', 'SA090476', 'PS SYSTEM SUPPORT', 'AGOL License Renewal for JTI', 'United Dhaka Tobacco Company Limited (JTI)', 100, 486.02, 2996.94, 'Closed Won'),
  mkp('11/14/2022', 'Mohammad A. Hadi', 'SA100223', 'PS SYSTEM SUPPORT', 'Esri NPO Single license for 3 years - FAO', 'FAO Bangladesh', 100, 334.44, 647.49, 'Closed Won'),
  mkp('7/7/2022', 'Mohammad A. Hadi', 'SA094084', 'PS SYSTEM SUPPORT', 'EsriSW for KDA Masterplan', 'Khulna Development Authority (KDA)', 100, 232.56, 7981.46, 'Closed Won'),
  mkp('4/15/2021', 'Mohammad A. Hadi', 'SA24329', 'PS SYSTEM SUPPORT', 'Esri SW for RRI', 'River Research Institute (RRI)', 0, 387.43, 61858.66, 'Closed Lost'),
  mkp('1/28/2021', 'Mohammad A. Hadi', 'SA27090', 'PS SYSTEM SUPPORT', 'Esri SW for IDCB Project Phase-2', 'River Research Institute (RRI)', 100, 774.97, 40834.75, 'Closed Won'),
  mkp('4/2/2023', 'Most Iffat Ara Ila', 'SA099379', 'PS SYSTEM SUPPORT', 'ArcGIS Desktop for GCA Project of DPHE', 'Department of Public Health Engineering (DPHE)', 0, 267.4, 16308.48, 'Closed Lost'),
  mkp('6/6/2022', 'Most Iffat Ara Ila', 'SA094907', 'PS SYSTEM SUPPORT', 'Esri Adv SW for PhotoUnit (SOB)', 'Survey of Bangladesh (SOB)', 100, 614.28, 14748.09, 'Closed Won'),
  mkp('6/9/2022', 'Most Iffat Ara Ila', 'SA094911', 'PS SYSTEM SUPPORT', 'EsriSW for SOB Carto', 'Survey of Bangladesh (SOB)', 100, 304.69, 85217.2, 'Closed Won'),
  mkp('12/29/2022', 'Most Iffat Ara Ila', 'SA29655', 'PS SYSTEM SUPPORT', 'Esri SW for Sufol Project', 'Bangladesh Forest Department (BFD)', 0, 268.59, 15051.9, 'Closed Lost'),
  mkp('6/26/2021', 'Most Iffat Ara Ila', 'SA30965', 'PS SYSTEM SUPPORT', 'EsriSW for IDM-DU', 'Institute of Disaster Management and Vulnerability Studies - DU', 100, 341.95, 2927.48, 'Closed Won'),
  mkp('2/28/2023', 'Most Iffat Ara Ila', 'SA100277', 'PS SYSTEM SUPPORT', 'EsriSW Extensions for SPARRSO', 'Bangladesh Space Research and Remote Sensing Organisation (SPARRSO)', 100, 107.81, 6013.44, 'Closed Won'),
  mkp('6/12/2022', 'Most Iffat Ara Ila', 'SA095943', 'PS SYSTEM SUPPORT', 'EsriSW for URP-KU', 'Urban & Rural Planning Discipline - KU', 100, 128.26, 606.03, 'Closed Won'),
  mkp('9/29/2022', 'Most Iffat Ara Ila', 'SA094909', 'PS SYSTEM SUPPORT', 'Basic Mapping Package Solution for GCC with DDM', 'Development Design and Management (DDML)', 100, 259.14, 5772, 'Closed Won'),
  mkp('9/29/2022', 'Most Iffat Ara Ila', 'SA094909', 'PS PROJECT IMPLEMENTATION', 'Basic Mapping Package Solution for GCC with DDM (Impl)', 'Development Design and Management (DDML)', 100, 2838.06, 5772, 'Closed Won'),
  mkp('8/3/2023', 'Most Iffat Ara Ila', 'SA32112', 'PS PROJECT IMPLEMENTATION', 'Esri Solution for GIS/RS Smart City Planning Lab of RAJUK', 'Rajdhani Unnayan Kartripakkha (RAJUK)', 0, 9921.5, 77151.73, 'Closed Lost'),
  mkp('8/3/2022', 'Most Iffat Ara Ila', 'SA095410', 'PS SYSTEM SUPPORT', 'EsriSW for TOD Project', 'Rajdhani Unnayan Kartripakkha (RAJUK)', 100, 277.75, 15020.06, 'Closed Won'),
  mkp('2/28/2023', 'Most Iffat Ara Ila', 'SA100276', 'PS SYSTEM SUPPORT', 'EsriSW Mnt and upgrade for SMEC', 'SMEC International Pty. Ltd', 0, 673.79, 12246.13, 'Closed Lost'),
  mkp('9/30/2021', 'Most Iffat Ara Ila', 'SA30115', 'PS CONSULTING AND ADVISORY', 'DPS Development for Bangladesh NSDI (JICA) Part 2', 'Japan International Corporation Agency (JICA)', 100, 5231.62, 17942.33, 'Closed Won'),
  mkp('9/30/2021', 'Most Iffat Ara Ila', 'SA30115', 'PS CONSULTING AND ADVISORY', 'DPS Development for Bangladesh NSDI (JICA) Part 2 (B)', 'Japan International Corporation Agency (JICA)', 100, 11079.07, 17942.33, 'Closed Won'),
  mkp('9/30/2021', 'Most Iffat Ara Ila', 'SA32383', 'PS SYSTEM SUPPORT', 'EsriSW for Dept of FPM', 'Bangladesh Agriculture University (BAU)', 100, 97.12, 590.5, 'Closed Won'),
  mkp('11/28/2022', 'Mohammad A. Hadi', 'SA100753', 'PS SYSTEM SUPPORT', 'Basic Mapping Solution - Renewal 1', 'United Dhaka Tobacco Company Limited (JTI)', 100, 428.37, 2641.44, 'Closed Won'),
  mkp('4/15/2021', 'Mohammad A. Hadi', 'SA27434', 'PS CONSULTING AND ADVISORY', 'EsriSW Solution for NBR', 'National Board of Revenue (NBR)', 0, 13172.62, 93005.71, 'Closed Lost'),
  mkp('4/15/2021', 'Mohammad A. Hadi', 'SA27434', 'PS SYSTEM SUPPORT', 'EsriSW Solution for NBR (SW)', 'National Board of Revenue (NBR)', 0, 9879.47, 93005.71, 'Closed Lost'),
  mkp('6/11/2019', 'Mohammad A. Hadi', 'SA8568', 'PS SYSTEM SUPPORT', 'Enterprise training for LGED GIS officials', 'Local Government Engineering Department (LGED)', 100, 2993.64, 10573.58, 'Closed Won'),
  mkp('2/15/2022', 'Mohammad A. Hadi', 'SA32573', 'PS CONSULTING AND ADVISORY', 'Basic Mapping Package Solution for ACI Motors', 'Advanced Chemical Industries Limited (ACI)', 100, 4908.45, 5605.37, 'Closed Won'),
  mkp('2/10/2021', 'Mohammad A. Hadi', 'SA24499', 'PS SYSTEM SUPPORT', 'BUP 2nd Lab Esri SW', 'Bangladesh University of Professionals (BUP)', 0, 265.17, 3087.75, 'Closed Lost'),
  mkp('4/1/2020', 'Mohammad A. Hadi', 'SA25294', 'PS SYSTEM SUPPORT', 'Annual Maintenance SW 22/02/2020 - 22/02/2021', 'Deutsche Gesellschaft fur International Climiate Change - GIZ Bangladesh', 100, 447.06, 2548.47, 'Closed Won'),
  mkp('11/9/2022', 'Mohammad A. Hadi', 'SA099187', 'PS SYSTEM SUPPORT', 'PS System Support for GIZ', 'Deutsche Gesellschaft fur International Climiate Change - GIZ Bangladesh', 100, 1292.18, 1292.18, 'Closed Won'),
  mkp('3/30/2023', 'Mohammad A. Hadi', 'SA28322', 'PS SYSTEM SUPPORT', 'Esri SW gap as per BPDB Tender', 'Bangladesh Power Development Board (BPDB)', 100, 2914.17, 107258.84, 'Closed Won'),
  mkp('9/6/2022', 'Mohammad A. Hadi', 'SA8567', 'PS SYSTEM SUPPORT', 'EsriSW for BMD by WB', 'Bangladesh Meteorological Department (BMD)', 0, 2303.94, 26543.61, 'Closed Lost'),
  mkp('4/23/2020', 'Mohammad A. Hadi', 'SA27021', 'PS SYSTEM SUPPORT', 'EsriSW 2yr extension of 1 license', 'UNICEF Bangladesh', 100, 57.3, 236.1, 'Closed Won'),
  mkp('12/22/2022', 'Mohammad A. Hadi', 'SA101371', 'PS SYSTEM SUPPORT', 'NPO_SW for Unicef - Dhaka 2022', 'UNICEF Bangladesh', 100, 121.1, 1059.66, 'Closed Won'),
  mkp('2/15/2021', 'Mohammad A. Hadi', 'SA27058', 'PS SYSTEM SUPPORT', 'Esri SW for BRAC - DRP Assist ID 5116', 'BRAC', 0, 6996.6, 9686.48, 'Closed Lost'),
  mkp('5/26/2022', 'Mohammad A. Hadi', 'SA30028', 'PS CONSULTING AND ADVISORY', 'Esri SW and Data Migration Support', 'Roads and Highways Department (RHD)', 100, 21535.53, 123924.19, 'Closed Won'),
  mkp('7/20/2022', 'Mohammad A. Hadi', 'SA094651', 'PS SYSTEM SUPPORT', 'Basic Mapping Package Solution for NACOM', 'Nature Conservation Management (NACOM)', 100, 4143.96, 6215.94, 'Closed Won'),
  mkp('3/24/2022', 'Mohammad A. Hadi', 'SA30990', 'PS CONSULTING AND ADVISORY', 'EsrSW for UIIPF', 'Narayanganj City Corporation', 0, 11226.45, 16599.43, 'Closed Lost'),
  mkp('6/17/2020', 'Mohammad A. Hadi', 'SA26527', 'PS SYSTEM SUPPORT', 'GIS and RS software for Meteorology Department Lab DU', 'Department of Meteorology - DU', 100, 186.14, 717, 'Closed Won'),
  mkp('12/22/2021', 'Mohammad A. Hadi', 'SA27056', 'PS SYSTEM SUPPORT', 'Esri SW for a2i for DRP AsssitID 6541', 'Access to information in Bangladesh (a2i)', 0, 6454.44, 25553.38, 'Closed Lost'),
  mkp('10/5/2023', 'Mohammad A. Hadi', 'SA099612', 'PS SYSTEM SUPPORT', 'Basic Mapping Package Solution for a2i', 'Access to information in Bangladesh (a2i)', 0, 253.94, 6340.98, 'Closed Lost'),
  mkp('10/20/2020', 'Mohammad A. Hadi', 'SA27074', 'PS SYSTEM SUPPORT', 'Esri SW for Group Mapper - DRP Assist ID 6434', 'GroupMappers', 0, 126.53, 459.29, 'Closed Lost'),
  mkp('1/20/2021', 'Mohammad A. Hadi', 'SA27062', 'PS SYSTEM SUPPORT', 'Esri SW for UIU - DRP Assist ID 6670', 'United International University (UIU)', 0, 347.6, 904.14, 'Closed Lost'),
  mkp('10/15/2020', 'Mohammad A. Hadi', 'SA27064', 'PS SYSTEM SUPPORT', 'Esri SW for SODEP Assist ID 6504', 'Social Development Programme (SODEP)', 0, 318, 485.26, 'Closed Lost'),
  mkp('8/25/2020', 'Mohammad A. Hadi', 'SA27718', 'PS SYSTEM SUPPORT', 'Esri NPO SW for Arannayk', 'Arannayk Foundation', 100, 193.65, 416.7, 'Closed Won'),
  mkp('8/31/2021', 'Mohammad A. Hadi', 'SA32162', 'PS SYSTEM SUPPORT', 'Renewal of Esri NPO SW for Arannayk', 'Arannayk Foundation', 100, 189.86, 395.54, 'Closed Won'),
  mkp('7/7/2022', 'Mohammad A. Hadi', 'SA32577', 'PS SYSTEM SUPPORT', 'EsriSW for Land Zoning', 'Ministry of Land (Bangladesh)', 100, 324.9, 25517.65, 'Closed Won'),
  mkp('2/17/2021', 'Mohammad A. Hadi', 'SA27279', 'PS SYSTEM SUPPORT', 'EsriSW for Smart Agriculture Monitoring', 'BARC - Bangladesh Agricultural Research Council', 0, 5575.82, 56533.74, 'Closed Lost'),
  mkp('9/29/2020', 'Mohammad A. Hadi', 'SA23854', 'PS SYSTEM SUPPORT', 'EsriSW for BBS-CEGIS Project', 'Bangladesh Bureau Statistics (BBS)', 100, 5704.08, 67112.78, 'Closed Won'),
  mkp('2/28/2020', 'Mohammad A. Hadi', 'SA26160', 'PS SYSTEM SUPPORT', 'Esri SW licenses for Photogrammetric Solution for datEx', 'Data Experts (Pvt) Limited (datEx)', 100, 325.25, 10855.64, 'Closed Won'),
  mkp('3/24/2022', 'Mohammad A. Hadi', 'SA26528', 'PS SYSTEM SUPPORT', 'Esri SW for RDA', 'Rajshahi Development Authority (RDA)', 100, 598.74, 68134.97, 'Closed Won'),
  mkp('4/1/2020', 'Mohammad A. Hadi', 'SA25687', 'PS SYSTEM SUPPORT', 'Esri SW for Nippon Koei Project', 'Nippon Koei Co. Ltd - Bangladesh Projects', 100, 908.66, 3483.18, 'Closed Won'),
  mkp('4/28/2021', 'Mohammad A. Hadi', 'SA31331', 'PS SYSTEM SUPPORT', 'SW for Nippon Koei Bangladesh Project', 'Nippon Koei Co. Ltd - Bangladesh Projects', 100, 929.89, 3812.56, 'Closed Won'),
  mkp('6/30/2021', 'Mohammad A. Hadi', 'SA31796', 'PS SYSTEM SUPPORT', 'PS service for BREB', 'Eptisa India Pvt. Ltd.', 0, 2248.92, 2248.92, 'Closed Lost'),
  mkp('1/27/2023', 'Mohammad A. Hadi', 'SA094030', 'PS SYSTEM SUPPORT', 'Esri SW for DNCC geodata integration', 'Dhaka North City Corporation (DNCC)', 100, 2842.56, 34618.69, 'Closed Won'),
  mkp('11/30/2021', 'Mohammad A. Hadi', 'SA27218', 'PS SYSTEM SUPPORT', 'Esri SW for SRDI', 'Soil Resources Development Institute (SRDI)', 100, 3216.33, 55877.02, 'Closed Won'),
  mkp('11/30/2021', 'Mohammad A. Hadi', 'SA27218', 'PS PROJECT IMPLEMENTATION', 'Esri SW for SRDI (Impl)', 'Soil Resources Development Institute (SRDI)', 100, 18011.45, 55877.02, 'Closed Won'),
  mkp('6/8/2020', 'Mohammad A. Hadi', 'SA8505', 'PS SYSTEM SUPPORT', 'SW for UDD HQ', 'Urban Development Directorate (UDD)', 100, 356.24, 18140.57, 'Closed Won'),
  mkp('6/10/2020', 'Mohammad A. Hadi', 'SA23842', 'PS SYSTEM SUPPORT', 'Web based Dashboard for UDD', 'Urban Development Directorate (UDD)', 0, 3506.45, 54642.48, 'Closed Lost'),
  mkp('7/15/2020', 'Mohammad A. Hadi', 'SA25922', 'PS PROJECT IMPLEMENTATION', 'Training for UDD officials 2020', 'Urban Development Directorate (UDD)', 0, 4003.62, 4003.62, 'Closed Lost'),
  mkp('5/26/2022', 'Mohammad A. Hadi', 'SA30528', 'PS SYSTEM SUPPORT', 'EsriSW for UDD 2nd License', 'Urban Development Directorate (UDD)', 100, 300.87, 10424.7, 'Closed Won'),
  mkp('11/30/2020', 'Mohammad A. Hadi', 'SA25855', 'PS SYSTEM SUPPORT', 'Tobacco BI system for JTI', 'United Dhaka Tobacco Company Limited (JTI)', 100, 1050.81, 4915.69, 'Closed Won'),
  mkp('7/12/2021', 'Mohammad A. Hadi', 'SA31657', 'PS SYSTEM SUPPORT', 'EsriSW AGOL Credits and additional viewer', 'United Dhaka Tobacco Company Limited (JTI)', 100, 317.04, 1483.73, 'Closed Won'),
  mkp('4/15/2021', 'Mohammad A. Hadi', 'SA30249', 'PS SYSTEM SUPPORT', 'EsriSW for PWD through OIC', 'Public Works Department (PWD)', 0, 2324.58, 8701.68, 'Closed Lost'),
  mkp('1/25/2023', 'Mohammad A. Hadi', 'SA26893', 'PS SYSTEM SUPPORT', 'Advance GIS SW for PGCB', 'Power Grid Company of Bangladesh (PGCB)', 0, 300.99, 12469.1, 'Closed Lost'),
  mkp('12/20/2021', 'Mohammad A. Hadi', 'SA30729', 'PS SYSTEM SUPPORT', 'Esri Education Lab SW for Geography JU', 'JU - Department of Geography and Environment', 100, 191.97, 2611.18, 'Closed Won'),
  mkp('2/28/2021', 'Mohammad A. Hadi', 'SA26529', 'PS SYSTEM SUPPORT', 'Webmapping SW for SOB', 'Survey of Bangladesh (SOB)', 100, 3961.37, 33729.93, 'Closed Won'),
  mkp('4/20/2022', 'Mohammad A. Hadi', 'SA093987', 'PS SYSTEM SUPPORT', 'EsriSW for 3D data processing (SOB)', 'Survey of Bangladesh (SOB)', 100, 742.75, 42168.15, 'Closed Won'),
  mkp('5/31/2021', 'Mohammad A. Hadi', 'SA30982', 'PS SYSTEM SUPPORT', 'MNT EsriSW for WARPO', 'Water Resource Planning Organisation (WARPO)', 100, 328.71, 20329.64, 'Closed Won'),
  mkp('6/25/2020', 'Mohammad A. Hadi', 'SA26542', 'PS SYSTEM SUPPORT', 'Esri SW for GSB GIS Lab', 'Geological Survey of Bangladesh (GSB)', 0, 2607.67, 20079.6, 'Closed Lost'),
  mkp('7/5/2022', 'Mohammad A. Hadi', 'SA26373', 'PS SYSTEM SUPPORT', 'EsriSW for WB Project (IWM)', 'Bangladesh Water Development Board (BWDB)', 100, 3389.35, 56826.52, 'Closed Won'),
  mkp('6/12/2022', 'Mohammad A. Hadi', 'SA26707', 'PS SYSTEM SUPPORT', 'Esri SW for AgriLab of SPARRSO', 'Bangladesh Space Research and Remote Sensing Organisation (SPARRSO)', 100, 302.84, 12125.53, 'Closed Won'),
  mkp('8/25/2020', 'Mohammad A. Hadi', 'SA24352', 'PS SYSTEM SUPPORT', 'Underground Distribution Network Project for Narayanganj PBS 2', 'Palli Bidyut Samity (PBS)', 100, 152.41, 12052.42, 'Closed Won'),
  mkp('5/8/2023', 'Mohammad A. Hadi', 'SA094650', 'PS SYSTEM SUPPORT', 'Esri Solution for Crop Area Estimation - DAE v2', 'Department of Agriculture Extensions (DAE)', 0, 16986.25, 104757.6, 'Closed Lost'),
  mkp('3/29/2022', 'Mohammad A. Hadi', 'SA094706', 'PS SYSTEM SUPPORT', 'Esri NPO SW for Waste Concern', 'Waste Concern', 100, 134.86, 1186.8, 'Closed Won'),
  mkp('7/28/2022', 'Mohammad A. Hadi', 'SA096017', 'PS SYSTEM SUPPORT', 'EsriSW for DAI Agri Project in Bangladesh', 'DAI Bangladesh Project', 0, 118.39, 1362.03, 'Closed Lost'),
  mkp('2/8/2023', 'Mohammad A. Hadi', 'SA101894', 'PS SYSTEM SUPPORT', 'AGOL Basic Map Package for GSBD', 'Global Sources BD', 100, 278.54, 1425.01, 'Closed Won'),
  mkp('11/6/2020', 'Mohammad A. Hadi', 'SA30398', 'PS SYSTEM SUPPORT', 'Renewal of AGOL Lvl 1 license Year 2', 'Public Works Department (PWD)', 100, 181.4, 972.29, 'Closed Won'),
  mkp('11/6/2020', 'Mohammad A. Hadi', 'SA30399', 'PS SYSTEM SUPPORT', 'EsriSW MNT of PWD renew 1', 'Public Works Department (PWD)', 100, 725.59, 1972.88, 'Closed Won'),
  mkp('11/3/2021', 'Mohammad A. Hadi', 'SA32645', 'PS SYSTEM SUPPORT', 'EsriSW basic license for SMEC', 'SMEC International Pty. Ltd', 100, 148.68, 3259.15, 'Closed Won'),
  mkp('9/29/2022', 'Mohammad A. Hadi', 'SA096060', 'PS SYSTEM SUPPORT', 'EsriSW Basic for SMEC 2022', 'SMEC International Pty. Ltd', 0, 129.57, 2840.13, 'Closed Lost'),
  mkp('12/11/2022', 'Mohammad A. Hadi', 'SA100923', 'PS SYSTEM SUPPORT', 'Esri SW Education MediumLab license 1 year - 2022', 'Patuakhali Science and Technology University (PSTU)', 100, 122.2, 577.4, 'Closed Won'),
  mkp('10/28/2020', 'Mohammad A. Hadi', 'SA30114', 'PS CONSULTING AND ADVISORY', 'DPS development for Bangladesh NSDI (JICA) Part 1', 'Japan International Corporation Agency (JICA)', 100, 4661.71, 4661.71, 'Closed Won'),
  mkp('7/21/2022', 'Mohammad A. Hadi', 'SA097918', 'PS SYSTEM SUPPORT', 'Esri EduSW for IUB 2022', 'Independent University Bangladesh', 100, 123.64, 1044.76, 'Closed Won'),
  mkp('1/31/2022', 'Mohammad A. Hadi', 'SA25880', 'PS SYSTEM SUPPORT', 'Esri SW gap for DPDC Tender', 'Dhaka Power Distribution Company Limited (DPDC)', 0, 719.28, 30528.19, 'Closed Lost'),
  mkp('10/20/2020', 'Mohammad A. Hadi', 'SA23849', 'PS CONSULTING AND ADVISORY', 'PS - Police Control Room Real-time Dashboard (CA)', 'Bangladesh Police', 0, 140586, 702930, 'Closed Lost'),
  mkp('10/20/2020', 'Mohammad A. Hadi', 'SA23849', 'PS PROJECT IMPLEMENTATION', 'PS - Police Control Room Real-time Dashboard (PI)', 'Bangladesh Police', 0, 421758, 702930, 'Closed Lost'),
  mkp('10/20/2020', 'Mohammad A. Hadi', 'SA23849', 'PS SYSTEM SUPPORT', 'PS - Police Control Room Real-time Dashboard (SW)', 'Bangladesh Police', 0, 140586, 702930, 'Closed Lost'),
  mkp('1/10/2022', 'Mohammad A. Hadi', 'SA9184', 'PS SYSTEM SUPPORT', 'SW - Police Control Room Real-time Dashboard', 'Bangladesh Police', 0, 35875.5, 353480.51, 'Closed Lost'),
  mkp('11/18/2023', 'Abdullah Al Baki', 'SA32047', 'PS SYSTEM SUPPORT', 'Basic Mapping Package Solution for datEx', 'Data Experts (Pvt) Limited (datEx)', 0, 832.86, 3139.87, 'Closed Lost'),
  mkp('4/30/2024', 'Mohammad A. Hadi', 'SA115769', 'PS SYSTEM SUPPORT', 'GIS SW for CPA Estate', 'Chittagong Port Authority', 0, 326.32, 14530.1, 'Closed Lost'),
  mkp('5/2/2024', 'Most Iffat Ara Ila', 'SA103902', 'PS PROJECT IMPLEMENTATION', 'EsriSW for Land Capacity Building Project', 'Ministry of Land (Bangladesh)', 0, 130574, 195861, 'Closed Lost'),
  mkp('5/2/2024', 'Most Iffat Ara Ila', 'SA103902', 'PS CONSULTING AND ADVISORY', 'EsriSW for Land Capacity Building Project (CA)', 'Ministry of Land (Bangladesh)', 0, 19586.1, 195861, 'Closed Lost'),
  mkp('2/3/2026', 'Md Naiemul Haque Chowdhury', 'SA132283', 'PS Project Implementation', 'Esri SW for Information System Audit', 'Enter Technologies Limited', 0, 1500, 8363, 'Closed Lost'),
  mkp('10/5/2025', 'Basher Muhammad Raquibul Raquibul', 'SA127165', 'PS Project Implementation', 'GIS SW maintenance for RHD', 'Roads and Highways Department (RHD)', 0, 2000, 91907.5, 'Closed Lost'),
  mkp('1/25/2026', 'Basher Muhammad Raquibul Raquibul', 'SA133128', 'PS Project Delivery', 'NPO SW for BRAC HCMP Office', 'BRAC', 100, 190, 799.9, 'Closed Won'),
  mkp('3/30/2026', 'Basher Muhammad Raquibul Raquibul', 'SA130926', 'PS Project Implementation', 'ArcGIS_Annual_Subscription_PKSF', 'Palli Karma Sahayak Foundation (PKSF)', 0, 2880, 62780, 'Closed Lost'),
  mkp('6/30/2025', 'Most Iffat Ara Ila', 'SA128075', 'PS System Support', 'NPO SW for NRC Bangladesh', 'Norwegian Refugee Council (NRC) - Bangladesh', 100, 190, 653.6, 'Closed Won'),
  mkp('6/26/2025', 'Most Iffat Ara Ila', 'SA128272', 'PS System Support', 'NPO SW for World Vision Bangladesh', 'World Vision Bangladesh', 100, 190, 393.3, 'Closed Won'),
  mkp('7/20/2025', 'Ahtesham Hyder Nehal (INACTIVE)', 'SA122002', 'PS System Support', 'EsriSW for Rajuk Cloud', 'Rajdhani Unnayan Kartripakkha (RAJUK)', 0, 5000, 42263, 'Closed Lost'),
  mkp('4/16/2025', 'Reduanur Rahman (INACTIVE)', 'SA123349', 'PS System Support', 'GIS SW for BRRI', 'Bangladesh Rice Research Institute (BRRI)', 100, 425, 11385.75, 'Closed Won'),
  mkp('6/4/2025', 'Abdullah Al Baki', 'SA126235', 'PS Project Implementation', 'GIS SW for 3D mapping - DLRS', 'Department of Land Records and Survey (DLRS)', 100, 3000, 24764.25, 'Closed Won'),
];

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
      product_amount, account_name, product_name, opportunity_owner, opp_amount, probability, project_closing_date
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const p of ALL_PROJECTS) {
    insertProj.run(
      p.code, p.name, p.account_name, p.opp_amount, 0,
      p.end_date, p.stage,
      p.progress, p.color, p.priority,
      p.product_amount, p.account_name, p.product_name,
      p.opportunity_owner, p.opp_amount, p.probability,
      p.project_closing_date || ''
    );
  }
  console.log(`  ${ALL_PROJECTS.length} projects inserted (${PIPELINE_PROJECTS.length} pipeline + ${HISTORICAL_PROJECTS.length} historical)`);
  console.log('Seed complete.');
}

function cli() {
  const arg = process.argv[2];
  if (arg === '--reset') {
    if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); console.log('Database file removed.'); }
    else console.log('No database file to remove.');
    return;
  }
  const db = getDb(); createSchema(db);
  if (arg === '--seed') seed(db);
  else console.log('Usage: node db.js [--seed | --reset]');
  db.close();
}

function fiscalYearLabel(y) { return `${y}-${String(y + 1).slice(-2)}`; }
module.exports = { getDb, createSchema, seed, DB_PATH, fiscalYearLabel };
if (require.main === module) cli();