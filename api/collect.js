// ───────────────────────────────────────────────────────────
//  /api/collect — public event beacon receiver (v2)
//  Handles: pageview, click, session-end (duration)
//  Privacy-friendly: session id is client-generated, ephemeral,
//  not a cookie, not cross-site. No PII, no IP stored.
// ───────────────────────────────────────────────────────────
import { db } from './_lib.js';

let _ready = false;
async function ensureTables(database) {
  if (_ready) return;
  await database.execute(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      path TEXT NOT NULL,
      referrer TEXT,
      ref_domain TEXT,
      device TEXT,
      country TEXT,
      city TEXT,
      visitor TEXT,
      session TEXT
    )`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_pv_ts ON pageviews(ts)`);
  // add session column if table pre-existed without it
  try { await database.execute(`ALTER TABLE pageviews ADD COLUMN session TEXT`); } catch (e) {}

  await database.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,          -- 'click'
      label TEXT,                  -- e.g. 'WhatsApp', 'Call', 'Get a Quote'
      path TEXT,
      session TEXT
    )`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_ev_ts ON events(ts)`);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      session TEXT PRIMARY KEY,
      started INTEGER NOT NULL,
      last_ts INTEGER NOT NULL,
      duration INTEGER DEFAULT 0,  -- ms
      pages INTEGER DEFAULT 1,
      device TEXT,
      country TEXT,
      entry_path TEXT
    )`);
  _ready = true;
}

function deviceFromUA(ua = '') {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return 'tablet';
  if (/mobi|iphone|android.*mobile|phone/.test(s)) return 'mobile';
  return 'desktop';
}
function refDomain(referrer = '') {
  try { if (!referrer) return null; const h = new URL(referrer).hostname.replace(/^www\./, ''); return h || null; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = req.body || {};
    const type = b.type || 'pageview';
    const path = (b.path || '/').slice(0, 300);
    if (path.startsWith('/admin') || path.startsWith('/api')) return res.status(200).json({ ok: true, skipped: true });

    const ua = req.headers['user-agent'] || '';
    if (/bot|crawler|spider|slurp|bingpreview|monitor|lighthouse|headless/i.test(ua)) return res.status(200).json({ ok: true, bot: true });

    const device = deviceFromUA(ua);
    const country = req.headers['x-vercel-ip-country'] || null;
    const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null;
    const session = (b.sid || '').slice(0, 40) || null;
    const database = db();
    await ensureTables(database);

    // ── CLICK event ──
    if (type === 'click') {
      await database.execute({
        sql: `INSERT INTO events (ts, type, label, path, session) VALUES (?, 'click', ?, ?, ?)`,
        args: [Date.now(), (b.label || 'unknown').slice(0, 60), path, session],
      });
      return res.status(200).json({ ok: true });
    }

    // ── SESSION heartbeat / end (duration update) ──
    if (type === 'session') {
      const dur = Math.max(0, Math.min(b.duration || 0, 4 * 60 * 60 * 1000)); // cap 4h
      const pages = Math.max(1, b.pages || 1);
      if (session) {
        await database.execute({
          sql: `INSERT INTO sessions (session, started, last_ts, duration, pages, device, country, entry_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session) DO UPDATE SET last_ts=excluded.last_ts, duration=excluded.duration, pages=excluded.pages`,
          args: [session, Date.now() - dur, Date.now(), dur, pages, device, country, path],
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ── PAGEVIEW (default) ──
    const referrer = (b.referrer || '').slice(0, 300);
    const day = new Date().toISOString().slice(0, 10);
    const crypto = await import('crypto');
    const visitor = crypto.createHash('sha256').update(ua + '|' + (country || '') + '|' + day).digest('hex').slice(0, 16);

    await database.execute({
      sql: `INSERT INTO pageviews (ts, path, referrer, ref_domain, device, country, city, visitor, session)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [Date.now(), path, referrer || null, refDomain(referrer), device, country, city, visitor, session],
    });

    // upsert session with a first page
    if (session) {
      await database.execute({
        sql: `INSERT INTO sessions (session, started, last_ts, duration, pages, device, country, entry_path)
              VALUES (?, ?, ?, 0, 1, ?, ?, ?)
              ON CONFLICT(session) DO UPDATE SET last_ts=?, pages=pages+1`,
        args: [session, Date.now(), Date.now(), device, country, path, Date.now()],
      });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
