const crypto = require('crypto');
const path = require('path');

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const HOST = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const PORT = Number(process.env.PORT) || 9002;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Esr!@9122';
const MODAL_ACCESS_PASSWORD = process.env.MODAL_ACCESS_PASSWORD || 'Esr!@9122';

// Global default annual capacity for a resource.
// Change this single value to update every resource that still uses the default Workdays setting.
const DEFAULT_ANNUAL_WORKDAYS = 220;

// Capacity-planning inputs used by the Pipeline Target Summary.
// These are planning constants, not calculated from projects or committed revenue targets.
const PIPELINE_MULTIPLIER = 2.5;
const CURRENT_REALIZED_REVENUE = 50000;

const AUTH_COOKIE_NAME = 'wa_auth';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 12;
const AUTH_SECRET = process.env.DASHBOARD_AUTH_SECRET ||
  crypto.createHash('sha256').update(`${DASHBOARD_PASSWORD}:${ROOT_DIR}`).digest('hex');

if (!Number.isInteger(DEFAULT_ANNUAL_WORKDAYS) || DEFAULT_ANNUAL_WORKDAYS < 0) {
  throw new Error('DEFAULT_ANNUAL_WORKDAYS in config.js must be a non-negative whole number.');
}

if (!Number.isFinite(PIPELINE_MULTIPLIER) || PIPELINE_MULTIPLIER < 0) {
  throw new Error('PIPELINE_MULTIPLIER in config.js must be zero or a positive number.');
}

if (!Number.isFinite(CURRENT_REALIZED_REVENUE) || CURRENT_REALIZED_REVENUE < 0) {
  throw new Error('CURRENT_REALIZED_REVENUE in config.js must be zero or a positive number.');
}

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_MAX_AGE_SECONDS,
  AUTH_SECRET,
  CURRENT_REALIZED_REVENUE,
  DASHBOARD_PASSWORD,
  DEFAULT_ANNUAL_WORKDAYS,
  HOST,
  MODAL_ACCESS_PASSWORD,
  PIPELINE_MULTIPLIER,
  PORT,
  PUBLIC_DIR,
  ROOT_DIR,
};
