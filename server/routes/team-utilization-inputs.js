const express = require('express');
const { getAppDb } = require('../database');
const {
  listTeamUtilizationInputs,
  saveTeamUtilizationInput,
} = require('../services/team-utilization-inputs');

const router = express.Router();
const db = getAppDb();

router.get('/api/ps-team-utilization-inputs', (req, res) => {
  try {
    const fiscalYear = Number(req.query.fiscalYear);
    res.json({
      fiscalYear,
      inputs: listTeamUtilizationInputs(db, fiscalYear),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/ps-team-utilization-inputs/:team/:month', (req, res) => {
  try {
    res.json(saveTeamUtilizationInput(
      db,
      req.params.team,
      req.params.month,
      {
        utilizationPercent: req.body?.utilizationPercent,
        comments: req.body?.comments,
      },
    ));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
