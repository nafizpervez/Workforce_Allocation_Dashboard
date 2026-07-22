const crypto = require('crypto');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PORT = Number(process.env.PORT) || 9002;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Esr!@9122';
const MODAL_ACCESS_PASSWORD = process.env.MODAL_ACCESS_PASSWORD || 'Esr!@9122';
const AUTH_COOKIE_NAME = 'wa_auth';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 12;
const AUTH_SECRET = process.env.DASHBOARD_AUTH_SECRET ||
  crypto.createHash('sha256').update(`${DASHBOARD_PASSWORD}:${ROOT_DIR}`).digest('hex');

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_MAX_AGE_SECONDS,
  AUTH_SECRET,
  DASHBOARD_PASSWORD,
  MODAL_ACCESS_PASSWORD,
  PORT,
  PUBLIC_DIR,
  ROOT_DIR,
};
