// ───────────────────────────────────────────────────────────
//  /api/collect — public pageview beacon receiver
//  Privacy-friendly: no cookies, no cross-site tracking, no PII.
//  Stores one row per pageview in Turso. Auto-creates table.
// ───────────────────────────────────────────────────────────
import { db } from './_lib.js';

let _ready = false;
async function ensureTable(database) {
  if (_ready) return;
  await database.execute(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,            -- epoch ms
      path TEXT NOT NULL,
      referrer TEXT,
      ref_domain TEXT,
      device TEXT,                    -- mobile | tablet | desktop
      country TEXT,                   -- ISO country from Vercel geo
      city TEXT,
      visitor TEXT                    -- daily-rotating anonymous hash (not a cookie)
    )`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_pv_ts ON pageviews(ts)`);
  _ready = true;
}

function deviceFromUA(ua = '') {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return 'tablet';
  if (/mobi|iphone|android.*mobile|phone/.test(s)) return 'mobile';
  return 'desktop';
}

function refDomain(referrer = '') {
  try {
    if (!referrer) return null;
    const h = new URL(referrer).hostname.replace(/^www\./, '');
    return h || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  // Only POST beacons accepted
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const b = req.body || {};
    const path = (b.path || '/').slice(0, 300);

    // Ignore admin + obvious noise
    if (path.startsWith('/admin') || path.startsWith('/api')) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const ua = req.headers['user-agent'] || '';
    // Basic bot filter
    if (/bot|crawler|spider|slurp|bingpreview|monitor|lighthouse|headless/i.test(ua)) {
      return res.status(200).json({ ok: true, bot: true });
    }

    const referrer = (b.referrer || '').slice(0, 300);
    const device = deviceFromUA(ua);

    // Vercel provides geo headers automatically (no IP stored)
    const country = req.headers['x-vercel-ip-country'] || null;
    const city = req.headers['x-vercel-ip-city']
      ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null;

    // Anonymous daily visitor hash: (ua + country + date) — rotates daily, not a cookie, non-identifying
    const day = new Date().toISOString().slice(0, 10);
    const crypto = await import('crypto');
    const visitor = crypto.createHash('sha256')
      .update(ua + '|' + (country || '') + '|' + day).digest('hex').slice(0, 16);

    const database = db();
    await ensureTable(database);
    await database.execute({
      sql: `INSERT INTO pageviews (ts, path, referrer, ref_domain, device, country, city, visitor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [Date.now(), path, referrer || null, refDomain(referrer), device, country, city, visitor],
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    // Never break the page over analytics — always 200
    return res.status(200).json({ ok: false });
  }
}
