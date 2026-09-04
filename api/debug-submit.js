// TEMPORARY DIAGNOSTIC — safe, no secrets leaked. Delete after fixing.
// Reproduces exactly what /api/submit does with the DB, and returns the real error.
import { db } from './_lib.js';

export default async function handler(req, res) {
  const out = { steps: [] };
  try {
    out.steps.push('db() init');
    const database = db();

    // 1. Can we connect + read the table schema?
    out.steps.push('read schema');
    const info = await database.execute("PRAGMA table_info(leads)");
    out.columns = info.rows.map(r => ({ name: r.name, type: r.type, notnull: r.notnull, dflt: r.dflt_value }));

    // 2. Try the migrations (same as submit)
    out.steps.push('migrate designation');
    try { await database.execute(`ALTER TABLE leads ADD COLUMN designation TEXT`); out.mig_designation = 'added'; }
    catch (e) { out.mig_designation = 'skip: ' + (e.message || '').slice(0, 80); }
    out.steps.push('migrate site_address');
    try { await database.execute(`ALTER TABLE leads ADD COLUMN site_address TEXT`); out.mig_site_address = 'added'; }
    catch (e) { out.mig_site_address = 'skip: ' + (e.message || '').slice(0, 80); }

    // 3. Try the EXACT insert submit uses (then roll it back by deleting)
    out.steps.push('test insert');
    const testRef = 'DIAG-' + Date.now();
    await database.execute({
      sql: `INSERT INTO leads
            (ref, source, name, company, designation, phone, email, service_type, site_address, message, city, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      args: [testRef, 'diagnostic', 'DIAG', null, null, '0000', null, null, null, null, null],
    });
    out.insert = 'ok';

    // 4. Clean up the test row
    await database.execute({ sql: `DELETE FROM leads WHERE ref = ?`, args: [testRef] });
    out.cleanup = 'ok';

    out.result = 'ALL DB OPERATIONS SUCCEEDED — problem is likely NOT the database';
    return res.status(200).json(out);
  } catch (err) {
    out.result = 'FAILED';
    out.error = err.message || String(err);
    out.error_code = err.code || null;
    return res.status(200).json(out); // 200 so we can read it easily
  }
}
