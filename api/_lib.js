// ───────────────────────────────────────────────────────────
//  Shared helpers: Turso client, session cookie sign/verify
// ───────────────────────────────────────────────────────────
import { createClient } from '@libsql/client';
import crypto from 'crypto';

// ── Turso client (singleton) ──
let _db = null;
export function db() {
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  return _db;
}

// ── Session token: HMAC-signed, contains username + expiry ──
const COOKIE = 'ise_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  return process.env.SESSION_SECRET || 'change-me-in-env';
}

export function signToken(username) {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${username}.${exp}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64');
}

export function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, exp, sig] = decoded.split('.');
    const payload = `${username}.${exp}`;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
    if (sig !== expected) return null;
    if (Date.now() > parseInt(exp, 10)) return null;
    return { username };
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

export function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifyToken(match[1]);
}

// ── Guard: returns true if authed, else sends 401 ──
export function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}
