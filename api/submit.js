import { db } from './_lib.js';
import { sendLeadEmails } from './_email.js';

// Generates a reference like ISE-2026-0042.
// Derives the next number from the highest existing ref for the year (not COUNT,
// which collides when rows are deleted), then verifies uniqueness with a fallback.
async function makeRef(database) {
  const year = new Date().getFullYear();
  const prefix = `ISE-${year}-`;
  // Highest existing suffix for this year
  const r = await database.execute({
    sql: `SELECT ref FROM leads WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1`,
    args: [prefix + '%'],
  });
  let next = 1;
  if (r.rows.length && r.rows[0].ref) {
    const m = String(r.rows[0].ref).match(/(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  let ref = `${prefix}${String(next).padStart(4, '0')}`;
  // Safety: if that ref somehow exists, bump until free (handles any drift/gaps)
  for (let i = 0; i < 50; i++) {
    const exists = await database.execute({ sql: `SELECT 1 FROM leads WHERE ref = ? LIMIT 1`, args: [ref] });
    if (!exists.rows.length) break;
    next += 1;
    ref = `${prefix}${String(next).padStart(4, '0')}`;
  }
  return ref;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const b = req.body || {};

    // Honeypot spam trap — if filled, silently accept but discard
    if (b._gotcha) return res.status(200).json({ success: true });

    const name = (b.name || '').trim();
    const phone = (b.phone || '').trim();
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const database = db();

    // Auto-migrate: add new columns if they don't exist yet (safe to run repeatedly)
    try { await database.execute(`ALTER TABLE leads ADD COLUMN designation TEXT`); } catch (e) {}
    try { await database.execute(`ALTER TABLE leads ADD COLUMN site_address TEXT`); } catch (e) {}

    const ref = await makeRef(database);

    await database.execute({
      sql: `INSERT INTO leads
            (ref, source, name, company, designation, phone, email, service_type, site_address, message, city, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      args: [
        ref,
        b.source || 'contact',
        name,
        b.company || null,
        b.designation || null,
        phone,
        b.email || null,
        b.service_type || b.site_type || null,
        b.site_address || null,
        b.message || null,
        b.city || null,
      ],
    });

    // Send confirmation + team alert (non-blocking — never fails the save)
    await sendLeadEmails({
      ref, name, phone,
      email: b.email || null,
      company: b.company || null,
      designation: b.designation || null,
      service_type: b.service_type || b.site_type || null,
      site_address: b.site_address || null,
      message: b.message || null,
      city: b.city || null,
      source: b.source || 'contact',
    });

    return res.status(200).json({ success: true, ref });
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ error: 'Could not save. Please call or email us directly.' });
  }
}
