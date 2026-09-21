// TEMP DIAGNOSTIC - checks DB connectivity + data presence for the dashboard. Delete after.
import { db } from './_lib.js';

export default async function handler(req, res) {
  const out = { env: {}, db: {}, tables: {} };
  out.env.TURSO_URL_present = !!process.env.TURSO_URL;
  out.env.TURSO_TOKEN_present = !!process.env.TURSO_TOKEN;
  out.env.ADMIN_USER_present = !!process.env.ADMIN_USER;
  out.env.SESSION_SECRET_present = !!process.env.SESSION_SECRET;

  try {
    const database = db();
    out.db.connected = true;

    // list tables
    const t = await database.execute("SELECT name FROM sqlite_master WHERE type='table'");
    out.tables.list = t.rows.map(r => r.name);

    // row counts for the key tables
    for (const tbl of ['leads','pageviews','events','sessions']) {
      try {
        const c = await database.execute(`SELECT COUNT(*) AS n FROM ${tbl}`);
        out.tables[tbl] = c.rows[0].n;
      } catch (e) {
        out.tables[tbl] = 'ERR: ' + (e.message||'').slice(0,60);
      }
    }
    // most recent lead + pageview timestamps
    try {
      const l = await database.execute("SELECT created_at FROM leads ORDER BY id DESC LIMIT 1");
      out.tables.latest_lead = l.rows.length ? l.rows[0].created_at : '(none)';
    } catch(e){ out.tables.latest_lead='ERR'; }
    try {
      const p = await database.execute("SELECT ts FROM pageviews ORDER BY ts DESC LIMIT 1");
      out.tables.latest_pageview = p.rows.length ? new Date(p.rows[0].ts).toISOString() : '(none)';
    } catch(e){ out.tables.latest_pageview='ERR: '+(e.message||'').slice(0,50); }

    out.result = 'DB OK';
    return res.status(200).json(out);
  } catch (err) {
    out.db.connected = false;
    out.db.error = err.message || String(err);
    out.result = 'DB CONNECTION FAILED';
    return res.status(200).json(out);
  }
}
