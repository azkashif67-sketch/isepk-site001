// ───────────────────────────────────────────────────────────
//  /api/analytics — authenticated dashboard data (Wix-style)
//  ?range=live|today|24h|7d|30d   → aggregated stats + time series
// ───────────────────────────────────────────────────────────
import { db, requireAuth } from './_lib.js';

const RANGES = {
  live:  5 * 60 * 1000,          // last 5 minutes (for the "right now" number)
  today: null,                    // since local midnight (computed)
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

async function tableExists(database) {
  try {
    const r = await database.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='pageviews'`);
    return r.rows.length > 0;
  } catch { return false; }
}

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  // ── One-time cleanup: purge any admin/api rows (owner can POST ?action=clean) ──
  if (req.method === 'POST' && req.query.action === 'clean') {
    try {
      const database0 = db();
      const r1 = await database0.execute(`DELETE FROM pageviews WHERE path LIKE '/admin%' OR path LIKE '/api%'`);
      let r2 = { rowsAffected: 0 };
      try { r2 = await database0.execute(`DELETE FROM events WHERE path LIKE '/admin%' OR path LIKE '/api%'`); } catch(e){}
      return res.status(200).json({ cleaned: true, pageviews_removed: r1.rowsAffected || 0, events_removed: r2.rowsAffected || 0 });
    } catch (e) {
      return res.status(500).json({ error: 'clean_failed', detail: String(e).slice(0,150) });
    }
  }

  const database = db();
  const range = (req.query.range || '7d');
  const now = Date.now();

  try {
    if (!(await tableExists(database))) {
      return res.status(200).json({ empty: true, range });
    }

    // Window start
    let start;
    if (range === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0); start = d.getTime();
    } else {
      start = now - (RANGES[range] || RANGES['7d']);
    }

    // Live visitors: distinct visitors in last 5 minutes
    const liveRes = await database.execute({
      sql: `SELECT COUNT(DISTINCT visitor) AS n FROM pageviews WHERE ts > ? AND path NOT LIKE '/admin%' AND path NOT LIKE '/api%'`,
      args: [now - RANGES.live],
    });
    const liveVisitors = liveRes.rows[0].n || 0;

    // Live pages: what those people are viewing right now
    const livePagesRes = await database.execute({
      sql: `SELECT path, COUNT(*) AS n FROM pageviews
            WHERE ts > ? GROUP BY path ORDER BY n DESC LIMIT 8`,
      args: [now - RANGES.live],
    });

    // Totals for the range
    const totalsRes = await database.execute({
      sql: `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM pageviews WHERE ts > ? AND path NOT LIKE '/admin%' AND path NOT LIKE '/api%'`,
      args: [start],
    });
    const totals = totalsRes.rows[0];

    // Time series — bucket size depends on range
    const bucketMs = range === 'live' ? 30 * 1000
      : range === 'today' || range === '24h' ? 60 * 60 * 1000   // hourly
      : 24 * 60 * 60 * 1000;                                     // daily
    const seriesRes = await database.execute({
      sql: `SELECT (ts / ?) AS bucket, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
            FROM pageviews WHERE ts > ? AND path NOT LIKE '/admin%' AND path NOT LIKE '/api%' GROUP BY bucket ORDER BY bucket ASC`,
      args: [bucketMs, start],
    });
    const series = seriesRes.rows.map(r => ({
      t: Number(r.bucket) * bucketMs, views: r.views, visitors: r.visitors,
    }));

    // Top pages
    const pagesRes = await database.execute({
      sql: `SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
            FROM pageviews WHERE ts > ? AND path NOT LIKE '/admin%' AND path NOT LIKE '/api%' GROUP BY path ORDER BY views DESC LIMIT 12`,
      args: [start],
    });

    // Top referrers (exclude direct/null)
    const refRes = await database.execute({
      sql: `SELECT ref_domain, COUNT(*) AS views FROM pageviews
            WHERE ts > ? AND path NOT LIKE '/admin%' AND ref_domain IS NOT NULL AND ref_domain != ''
            GROUP BY ref_domain ORDER BY views DESC LIMIT 10`,
      args: [start],
    });
    // Direct count
    const directRes = await database.execute({
      sql: `SELECT COUNT(*) AS n FROM pageviews WHERE ts > ? AND path NOT LIKE '/admin%' AND path NOT LIKE '/api%' AND (ref_domain IS NULL OR ref_domain = '')`,
      args: [start],
    });

    // Countries
    const countryRes = await database.execute({
      sql: `SELECT country, COUNT(DISTINCT visitor) AS visitors FROM pageviews
            WHERE ts > ? AND path NOT LIKE '/admin%' AND country IS NOT NULL GROUP BY country ORDER BY visitors DESC LIMIT 10`,
      args: [start],
    });

    // Devices
    const deviceRes = await database.execute({
      sql: `SELECT device, COUNT(DISTINCT visitor) AS visitors FROM pageviews
            WHERE ts > ? GROUP BY device`,
      args: [start],
    });


    // ── Time-of-day heatmap: day-of-week (0=Sun) × hour (0-23) ──
    const heatRes = await database.execute({
      sql: `SELECT CAST(strftime('%w', ts/1000, 'unixepoch') AS INTEGER) AS dow,
                   CAST(strftime('%H', ts/1000, 'unixepoch') AS INTEGER) AS hour,
                   COUNT(*) AS n
            FROM pageviews WHERE ts > ? AND path NOT LIKE '/admin%' AND path NOT LIKE '/api%' GROUP BY dow, hour`,
      args: [start],
    });
    const heat = Array.from({length:7}, ()=>new Array(24).fill(0));
    heatRes.rows.forEach(r=>{ if(r.dow!=null&&r.hour!=null) heat[r.dow][r.hour] = r.n; });

    // ── Click tracking ──
    let clicks = [];
    try {
      const clickRes = await database.execute({
        sql: `SELECT label, COUNT(*) AS n FROM events WHERE type='click' AND ts > ? GROUP BY label ORDER BY n DESC LIMIT 12`,
        args: [start],
      });
      clicks = clickRes.rows;
    } catch (e) { clicks = []; }

    // ── Session engagement ──
    let engagement = { avgDuration: 0, avgPages: '0', sessions: 0, bounceRate: 0 };
    try {
      const engRes = await database.execute({
        sql: `SELECT COUNT(*) AS sessions, AVG(duration) AS avgDur, AVG(pages) AS avgPages,
                     SUM(CASE WHEN pages <= 1 THEN 1 ELSE 0 END) AS bounces
              FROM sessions WHERE last_ts > ?`,
        args: [start],
      });
      const e = engRes.rows[0];
      engagement = {
        sessions: e.sessions || 0,
        avgDuration: Math.round(e.avgDur || 0),
        avgPages: e.avgPages ? Number(e.avgPages).toFixed(1) : '0',
        bounceRate: e.sessions ? Math.round((e.bounces / e.sessions) * 100) : 0,
      };
    } catch (e) {}

    // ── Lead funnel (joins CRM leads table) ──
    let funnel = { visitors: totals.visitors || 0, sessions: engagement.sessions || 0, leads: 0, stages: {} };
    try {
      const leadRes = await database.execute({
        sql: `SELECT status, COUNT(*) AS n FROM leads WHERE created_at > datetime(?, 'unixepoch') GROUP BY status`,
        args: [Math.floor(start/1000)],
      });
      const stages = {}; let totalLeads = 0;
      leadRes.rows.forEach(r=>{ stages[r.status] = r.n; totalLeads += r.n; });
      funnel = { visitors: totals.visitors || 0, sessions: engagement.sessions, leads: totalLeads, stages };
    } catch (e) {}

    return res.status(200).json({
      range, start, now,
      live: { visitors: liveVisitors, pages: livePagesRes.rows },
      totals: { views: totals.views || 0, visitors: totals.visitors || 0 },
      series,
      topPages: pagesRes.rows,
      referrers: refRes.rows,
      direct: directRes.rows[0].n || 0,
      countries: countryRes.rows,
      devices: deviceRes.rows,
      heat,
      clicks,
      engagement,
      funnel,
    });
  } catch (e) {
    return res.status(500).json({ error: 'analytics_failed', detail: String(e).slice(0, 200) });
  }
}
