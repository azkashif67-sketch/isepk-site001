import { db, requireAuth } from './_lib.js';

export default async function handler(req, res) {
  // All operations require a valid session
  const session = requireAuth(req, res);
  if (!session) return;

  const database = db();

  try {
    // ── LIST leads (with optional filters) ──
    if (req.method === 'GET') {
      const { status, q } = req.query;
      let sql = 'SELECT * FROM leads';
      const args = [];
      const where = [];

      if (status && status !== 'all') {
        where.push('status = ?');
        args.push(status);
      }
      if (q) {
        where.push('(name LIKE ? OR company LIKE ? OR phone LIKE ? OR email LIKE ? OR ref LIKE ?)');
        const like = `%${q}%`;
        args.push(like, like, like, like, like);
      }
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      sql += ' ORDER BY created_at DESC';

      const result = await database.execute({ sql, args });

      // Summary counts for the stat bar
      const counts = await database.execute(
        `SELECT status, COUNT(*) AS n FROM leads GROUP BY status`
      );
      const summary = {};
      counts.rows.forEach(r => { summary[r.status] = r.n; });

      return res.status(200).json({ leads: result.rows, summary });
    }

    // ── UPDATE a lead (status / assigned_to / notes / follow_up) ──
    if (req.method === 'PATCH') {
      const { id, status, assigned_to, notes, follow_up_date } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const fields = [];
      const args = [];
      if (status !== undefined)         { fields.push('status = ?');         args.push(status); }
      if (assigned_to !== undefined)    { fields.push('assigned_to = ?');    args.push(assigned_to); }
      if (notes !== undefined)          { fields.push('notes = ?');          args.push(notes); }
      if (follow_up_date !== undefined) { fields.push('follow_up_date = ?'); args.push(follow_up_date); }

      if (!fields.length) return res.status(400).json({ error: 'nothing to update' });

      args.push(id);
      await database.execute({
        sql: `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`,
        args,
      });
      return res.status(200).json({ ok: true });
    }

    // ── DELETE a lead ──
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await database.execute({ sql: 'DELETE FROM leads WHERE id = ?', args: [id] });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('leads error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
