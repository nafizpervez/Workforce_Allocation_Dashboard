const crypto = require('crypto');
const express = require('express');
const {
  AUTH_COOKIE_NAME,
  AUTH_MAX_AGE_SECONDS,
  AUTH_SECRET,
  DASHBOARD_PASSWORD,
} = require('../config');
const { renderLoginPage } = require('./login-page');

function parseCookies(header = '') {
  return String(header).split(';').map(value => value.trim()).filter(Boolean).reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator !== -1) cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    return cookies;
  }, {});
}

const signPayload = payload => crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
function createToken() {
  const payload = String(Date.now() + AUTH_MAX_AGE_SECONDS * 1000);
  return `${payload}.${signPayload(payload)}`;
}

function isValidToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!Number.isFinite(Number(payload)) || Number(payload) < Date.now()) return false;
  const actual = Buffer.from(signature || '', 'hex');
  const expected = Buffer.from(signPayload(payload), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isAuthenticated(req) {
  return isValidToken(parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME]);
}

function secureCookieFlag(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || protocol === 'https' ? '; Secure' : '';
}

function sendLoginPage(res, errorMessage = '') {
  return res.type('html').send(renderLoginPage(errorMessage));
}

function createAuthRouter() {
  const router = express.Router();
  router.get('/login', (req, res) => isAuthenticated(req) ? res.redirect('/') : sendLoginPage(res));
  router.post('/login', (req, res) => {
    if (String(req.body?.password || '') !== DASHBOARD_PASSWORD) return sendLoginPage(res.status(401), 'Incorrect password.');
    const cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(createToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${AUTH_MAX_AGE_SECONDS}${secureCookieFlag(req)}`;
    res.setHeader('Set-Cookie', cookie);
    return res.redirect('/');
  });
  router.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookieFlag(req)}`);
    return res.redirect('/login');
  });
  return router;
}

function requireDashboardAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return req.path.startsWith('/api/')
    ? res.status(401).json({ error: 'Authentication required' })
    : res.redirect('/login');
}

module.exports = { createAuthRouter, isAuthenticated, requireDashboardAuth };
