const cors = require('cors');
const express = require('express');
const path = require('path');
const { createAuthRouter, requireDashboardAuth } = require('./auth');
const { PUBLIC_DIR } = require('../config');
const routes = require('./routes');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(createAuthRouter());
  app.use(requireDashboardAuth);
  app.use(express.static(PUBLIC_DIR));
  routes.forEach(router => app.use(router));
  app.get('/', (_, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message });
  });
  return app;
}

module.exports = { createApp };
