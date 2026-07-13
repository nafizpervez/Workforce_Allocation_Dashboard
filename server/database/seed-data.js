const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const COLORS = ['#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308', '#22C55E', '#3B82F6', '#D946EF'];

const REAL_EMPLOYEES = [
  ['SGESA00026', 'Debashish Bhowmick', 'd.bhowmick@esribangladesh.com.bd'],
  ['SGESA00029', 'Mohsuddin Shovon', 'm.shovon@esrisa.com'],
  ['SGESA00033', 'S.M Abu Saleh', 'sm.abusaleh@esribangladesh.com.bd'],
  ['SGESA00040', 'Arnob Chakrabarty', 'c.arnob@esribangladesh.com.bd'],
  ['SGESA00030', 'Mahmudul Hasan', 'h.mahmudul@esribangladesh.com.bd'],
  ['SGESA00039', 'Imran Chowdhury', 'c.imran@esribangladesh.com.bd'],
  ['SGESA00046', 'Md. Jahid Hasan Joy', 'jhasan@esribangladesh.com.bd'],
  ['SGESA00048', 'Masud Iqbal', 'miqbal@esribangladesh.com.bd'],
  ['SGESA00056', 'Md. Masuk Mowla Aunkur', 'maunkur@esribangladesh.com.bd'],
  ['SGESA00055', 'Nusrath Jahan Nisha', 'njnisha@esribangladesh.com.bd'],
  ['SGESA00037', 'Pervez Md Nafiz', 'pm.nafiz@esribangladesh.com.bd'],
  ['SGESA00044', 'Shounok Rahman', 'rshounok@esribangladesh.com.bd'],
  ['SGESA00034', 'Sakib Rahman Siddique Shuvo', 'rs.sakib@esrisa.com'],
  ['SGESA00049', 'Shahmin Al Islam Aurnov', 'saurnov@esribangladesh.com.bd'],
  ['SGESA00032', 'Wahid Ibne Zakir', 'iz.wahid@esribangladesh.com.bd'],
  ['SGESA00035', 'Nazia Hassan Choudhury', 'n.choudhury@esribangladesh.com.bd'],
  ['SGESA00019', 'Sakil Ahmed', 'sahmed@esribangladesh.com.bd'],
].map(([code, name, email]) => ({ code, name, dept: 'Professional Services', email }));

function readSeedFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) throw new Error(`Missing seed file: ${name}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function colorForCode(code) {
  const score = String(code).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return COLORS[Math.abs(score) % COLORS.length];
}

function enrichProject(row, historical = false) {
  return {
    ...row,
    client: row.account_name,
    budget: row.opp_amount,
    spent_pct: 0,
    progress: historical && row.stage === 'Closed Won' ? 100 : 0,
    priority: row.opp_amount >= 50000 ? 'High' : row.opp_amount >= 10000 ? 'Medium' : 'Low',
    color: colorForCode(row.code),
    project_closing_date: '',
  };
}

function loadSeedData() {
  const pipeline = readSeedFile('pipeline_seed.json').map(row => enrichProject(row, false));
  const historical = readSeedFile('historical_seed.json').map(row => enrichProject(row, true));
  const seen = new Set();
  const projects = [...pipeline, ...historical].filter(project => {
    if (seen.has(project.code)) return false;
    seen.add(project.code);
    return true;
  });
  return { employees: REAL_EMPLOYEES, pipeline, historical, projects };
}

module.exports = { loadSeedData };
