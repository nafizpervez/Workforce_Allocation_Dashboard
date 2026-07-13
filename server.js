const { createApp } = require('./server/app');
const { PORT } = require('./server/config');

const app = createApp();

if (require.main === module) {
  app.listen(PORT, () => console.log(`Workforce Dashboard running at http://localhost:${PORT}`));
}

module.exports = app;
