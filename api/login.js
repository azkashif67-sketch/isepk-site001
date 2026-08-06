import { signToken, setSessionCookie, clearSessionCookie } from './_lib.js';
import crypto from 'crypto';

// Constant-time string compare to prevent timing attacks
function safeEqual(a, b) {
  const ba = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req, res) {
  // Logout
  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;

  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const okUser = safeEqual(username, ADMIN_USER);
  const okPass = safeEqual(password, ADMIN_PASS);

  if (!okUser || !okPass) {
    // Small delay to further blunt brute-force
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(username);
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true });
}
