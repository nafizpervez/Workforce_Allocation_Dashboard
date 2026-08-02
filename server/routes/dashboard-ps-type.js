const express = require('express');
const { getAppDb } = require('../database');
const { fyLabel, getProjectFiscalYear } = require('../services/fiscal');
const { getPSEngagementType, isPSOnlyProject } = require('../services/project-analytics');
const router = express.Router();
const db = getAppDb();

router.get('/api/dashboard/ps-type-chart', (_, res) => {
  const rows = db.prepare(`
    SELECT id, end_date, fiscal_period, product_name, product_family, name, code, stage
    FROM projects
    WHERE LOWER(TRIM(stage)) = 'closed won'
  `).all();

  const fyData = {};
  for (const project of rows) {
    const fy = getProjectFiscalYear(project);
    if (fy === null || !isPSOnlyProject(project)) continue;

    const engagementType = getPSEngagementType(project);
    if (!engagementType) continue;

    if (!fyData[fy]) {
      fyData[fy] = {
        support: 0,
        impl: 0,
        supportProjects: [],
        implProjects: [],
      };
    }

    const projectDetails = {
      id: Number(project.id),
      code: String(project.code || '').trim(),
      name: String(project.name || project.code || 'Unknown').trim(),
      product_name: String(project.product_name || '').trim(),
      product_family: String(project.product_family || '').trim(),
    };

    if (engagementType === 'SUPPORT') {
      fyData[fy].support += 1;
      fyData[fy].supportProjects.push(projectDetails);
    } else if (engagementType === 'IMPLEMENTATION') {
      fyData[fy].impl += 1;
      fyData[fy].implProjects.push(projectDetails);
    }
  }

  const byProjectName = (left, right) => left.name.localeCompare(right.name);
  const result = Object.entries(fyData)
    .sort((a, b) => +a[0] - +b[0])
    .map(([fy, data]) => ({
      fy: +fy,
      label: fyLabel(+fy),
      support: data.support,
      impl: data.impl,
      supportProjects: data.supportProjects.sort(byProjectName),
      implProjects: data.implProjects.sort(byProjectName),
    }));

  res.json(result);
});

module.exports = router;
