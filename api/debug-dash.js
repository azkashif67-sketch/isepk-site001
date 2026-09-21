// TEMP DIAGNOSTIC v2 - probe why leads/pageviews COUNT 502s. Delete after.
import { db } from './_lib.js';

export default async function handler(req, res) {
  const out = { probes: {} };
  const database = db();

  // Try different query strategies to isolate the 502
  const tests = {
    // Does a bare SELECT with LIMIT work (vs full COUNT)?
    'pageviews_limit1': "SELECT id FROM pageviews LIMIT 1",
    'pageviews_recent': "SELECT COUNT(*) AS n FROM pageviews WHERE ts > (strftime('%s','now')-86400)*1000",
    'pageviews_count': "SELECT COUNT(*) AS n FROM pageviews",
    'leads_limit1': "SELECT id FROM leads LIMIT 1",
    'leads_count': "SELECT COUNT(*) AS n FROM leads",
    'leads_recent10': "SELECT id FROM leads ORDER BY id DESC LIMIT 10",
    // approximate row estimate via max id
    'pageviews_maxid': "SELECT MAX(id) AS m FROM pageviews",
    'leads_maxid': "SELECT MAX(id) AS m FROM leads",
  };

  for (const [name, sql] of Object.entries(tests)) {
    const t0 = Date.now();
    try {
      const r = await database.execute(sql);
      out.probes[name] = { ok: true, ms: Date.now()-t0, rows: r.rows.length, val: r.rows[0] ? JSON.stringify(r.rows[0]).slice(0,60) : null };
    } catch (e) {
      out.probes[name] = { ok: false, ms: Date.now()-t0, err: (e.message||String(e)).slice(0,80) };
    }
  }
  return res.status(200).json(out);
}
