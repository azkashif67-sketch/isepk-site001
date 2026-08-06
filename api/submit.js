import { db } from './_lib.js';

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
    const ref = await makeRef(database);

    await database.execute({
      sql: `INSERT INTO leads
            (ref, source, name, company, phone, email, service_type, message, city, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      args: [
        ref,
        b.source || 'contact',
        name,
        b.company || null,
        phone,
        b.email || null,
        b.service_type || null,
        b.message || null,
        b.city || null,
      ],
    });

    // (Optional future: fire Resend email + Telegram alert here)

    return res.status(200).json({ success: true, ref });
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ error: 'Could not save. Please call or email us directly.' });
  }
}
