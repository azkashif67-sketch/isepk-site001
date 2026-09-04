// TEMPORARY DIAGNOSTIC v2 — tests makeRef + the REAL sendLeadEmails path.
import { db } from './_lib.js';
import { sendLeadEmails } from './_email.js';

export default async function handler(req, res) {
  const out = { steps: [], env: {} };
  // env presence (no secrets)
  out.env.RESEND_API_KEY_present = !!process.env.RESEND_API_KEY;
  out.env.RESEND_FROM = process.env.RESEND_FROM || '(default noreply@)';
  out.env.TEAM_EMAIL = process.env.TEAM_EMAIL || '(default info@)';

  try {
    const database = db();

    // 1. makeRef (the SELECT COUNT the real handler runs)
    out.steps.push('makeRef');
    const year = new Date().getFullYear();
    const r = await database.execute('SELECT COUNT(*) AS n FROM leads');
    const ref = `DIAG-${year}-${(r.rows[0].n||0)+1}`;
    out.ref = ref;

    // 2. The REAL sendLeadEmails — this is the untested piece
    out.steps.push('sendLeadEmails');
    let emailThrew = false;
    try {
      await sendLeadEmails({
        ref, name: 'DIAG Test', phone: '0000',
        email: null,               // no confirmation email, only team alert
        company: null, designation: null, service_type: null,
        site_address: null, message: 'diagnostic', city: null, source: 'diagnostic',
      });
      out.sendLeadEmails = 'returned without throwing';
    } catch (e) {
      emailThrew = true;
      out.sendLeadEmails = 'THREW: ' + (e.message || String(e));
    }
    out.emailThrew = emailThrew;

    out.result = emailThrew
      ? 'sendLeadEmails THREW — this is the bug'
      : 'Everything ran clean. If the form still fails, the error is elsewhere (body parsing?).';
    return res.status(200).json(out);
  } catch (err) {
    out.result = 'FAILED at: ' + (out.steps[out.steps.length-1] || 'start');
    out.error = err.message || String(err);
    return res.status(200).json(out);
  }
}
