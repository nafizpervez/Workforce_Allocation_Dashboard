const { loadSeedData } = require('./seed-data');

function resetDatabase(db) {
  db.exec('DELETE FROM assignments; DELETE FROM projects; DELETE FROM employees;');
  try { db.exec("DELETE FROM sqlite_sequence WHERE name IN ('employees','projects','assignments');"); } catch (_) { /* optional */ }
}

function seed(db) {
  const data = loadSeedData(); // Validate input before deleting existing data.
  console.log('Seeding database…');
  resetDatabase(db);

  const insertEmployee = db.prepare('INSERT INTO employees (employee_code, name, dept, email) VALUES (?, ?, ?, ?)');
  for (const employee of data.employees) insertEmployee.run(employee.code, employee.name, employee.dept, employee.email || '');

  const insertProject = db.prepare(`
    INSERT INTO projects (
      code, name, client, budget, spent_pct, end_date, stage, progress, color, priority,
      product_amount, account_name, product_name, product_family,
      opportunity_owner, opp_amount, probability, project_closing_date
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const project of data.projects) {
    insertProject.run(
      project.code, project.name, project.account_name, project.opp_amount, 0,
      project.end_date, project.stage, project.progress, project.color, project.priority,
      project.product_amount, project.account_name, project.product_name, project.product_family || '',
      project.opportunity_owner, project.opp_amount, project.probability, project.project_closing_date || ''
    );
  }

  console.log(`  ${data.employees.length} employees inserted`);
  console.log(`  ${data.projects.length} projects inserted (${data.pipeline.length} pipeline + ${data.historical.length} historical)`);
  console.log('Seed complete.');
}

module.exports = { resetDatabase, seed };
