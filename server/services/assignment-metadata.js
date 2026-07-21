const PRE_SALE_PROJECT_PATTERN = /pre[\s‐‑‒–—−_-]*sales?\b/i;

function normalizeAssignmentText(value) {
  const text = String(value ?? '').trim();
  return !text || text === '—' ? null : text;
}

function isPreSaleProjectName(projectName) {
  return PRE_SALE_PROJECT_PATTERN.test(String(projectName || ''));
}

function getAssignmentProject(db, projectId) {
  return db.prepare(`
    SELECT id, name, account_name, client, product_name
    FROM projects
    WHERE id = ?
  `).get(Number(projectId));
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function resolveAssignmentMetadata(project, body = {}, fallback = {}) {
  if (!project || !isPreSaleProjectName(project.name)) {
    return { customerName: null, productName: null };
  }

  const customerName = hasOwn(body, 'customer_name')
    ? normalizeAssignmentText(body.customer_name)
    : normalizeAssignmentText(fallback.customer_name) ||
      normalizeAssignmentText(project.account_name) ||
      normalizeAssignmentText(project.client) ||
      normalizeAssignmentText(project.name);

  const productName = hasOwn(body, 'product_name')
    ? normalizeAssignmentText(body.product_name)
    : normalizeAssignmentText(fallback.product_name) ||
      normalizeAssignmentText(project.product_name);

  return { customerName, productName };
}

module.exports = {
  getAssignmentProject,
  isPreSaleProjectName,
  normalizeAssignmentText,
  resolveAssignmentMetadata,
};
