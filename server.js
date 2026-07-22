const { createApp } = require('./server/app');
const { HOST, PORT } = require('./server/config');

const app = createApp();

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Workforce Dashboard running at http://localhost:${PORT}`);
    if (HOST === '0.0.0.0') {
      console.log(`LAN access enabled on port ${PORT}. Open http://<this-computer-ip>:${PORT}`);
    } else {
      console.log(`Server bound to ${HOST}:${PORT}`);
    }
  });
}

module.exports = app;
