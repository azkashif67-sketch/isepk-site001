// TEMP DIAGNOSTIC v4 - runs the EXACT submit handler logic, captures the real throw.
import { db } from './_lib.js';
import { sendLeadEmails } from './_email.js';

async function makeRef(database) {
  const year = new Date().getFullYear();
  const r = await database.execute('SELECT COUNT(*) AS n FROM leads');
  const n = (r.rows[0].n || 0) + 1;
  return `DIAG-${year}-${String(n).padStart(4, '0')}`;
}

export default async function handler(req, res) {
  const out = { steps: [] };
  try {
    const b = (req.method === 'POST' && req.body) ? req.body : { name:'DIAGTEST', phone:'0300', email:'diag@example.com', designation:'Mgr', company:'DiagCo', site_type:'Corporate Office', site_address:'addr', message:'diag' };
    out.gotBody = typeof req.body;

    const name = (b.name||'').trim(), phone=(b.phone||'').trim();
    out.steps.push('validate');
    if (!name || !phone) { out.result='400 name/phone'; return res.status(200).json(out); }

    const database = db();
    out.steps.push('migrate');
    try { await database.execute(`ALTER TABLE leads ADD COLUMN designation TEXT`); } catch (e) {}
    try { await database.execute(`ALTER TABLE leads ADD COLUMN site_address TEXT`); } catch (e) {}

    out.steps.push('makeRef');
    const ref = await makeRef(database);
    out.ref = ref;

    out.steps.push('INSERT');
    await database.execute({
      sql: `INSERT INTO leads
            (ref, source, name, company, designation, phone, email, service_type, site_address, message, city, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      args: [ ref, b.source||'contact', name, b.company||null, b.designation||null, phone,
              b.email||null, b.service_type||b.site_type||null, b.site_address||null, b.message||null, b.city||null ],
    });
    out.steps.push('INSERT ok');

    out.steps.push('sendLeadEmails');
    await sendLeadEmails({
      ref, name, phone, email: b.email||null, company: b.company||null, designation: b.designation||null,
      service_type: b.service_type||b.site_type||null, site_address: b.site_address||null,
      message: b.message||null, city: b.city||null, source: b.source||'contact',
    });
    out.steps.push('email ok');

    // cleanup the diag row
    await database.execute({ sql:`DELETE FROM leads WHERE ref = ?`, args:[ref] });
    out.result = 'FULL HANDLER SUCCEEDED';
    return res.status(200).json(out);
  } catch (err) {
    out.result = 'THREW at step: ' + (out.steps[out.steps.length-1]||'start');
    out.error = err.message || String(err);
    out.stack = (err.stack||'').split('\n').slice(0,4).join(' | ');
    return res.status(200).json(out);
  }
}
