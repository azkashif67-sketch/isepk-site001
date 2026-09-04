// rebuild: 2026-09-04 11:44
import { db } from './_lib.js';
import { sendLeadEmails } from './_email.js';

// Generates a reference like ISE-2026-0042 (sequential-ish via count)
async function makeRef(database) {
  const year = new Date().getFullYear();
  const r = await database.execute('SELECT COUNT(*) AS n FROM leads');
  const n = (r.rows[0].n || 0) + 1;
  return `ISE-${year}-${String(n).padStart(4, '0')}`;
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
