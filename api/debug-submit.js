// TEMP DIAGNOSTIC v3 - tests the actual POST + body parsing path.
import { db } from './_lib.js';
import { sendLeadEmails } from './_email.js';

export default async function handler(req, res) {
  const out = { method: req.method, steps: [] };
  out.contentType = req.headers['content-type'] || '(none)';
  out.bodyType = typeof req.body;
  out.bodyIsNull = req.body === null || req.body === undefined;
  try { out.bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : '(not an object)'; }
  catch(e){ out.bodyKeys = 'err'; }

  if (req.method !== 'POST') {
    out.note = 'GET request - POST JSON here to test body parsing.';
    out.result = 'Send a POST with JSON to fully test.';
    return res.status(200).json(out);
  }
  try {
    const b = req.body || {};
    out.parsed_name = b.name || '(empty)';
    out.parsed_phone = b.phone || '(empty)';
    if (b._gotcha) { out.result='honeypot'; return res.status(200).json(out); }
    const name = (b.name||'').trim(), phone=(b.phone||'').trim();
    if (!name || !phone) { out.result='WOULD 400: name/phone empty - body not parsed'; return res.status(200).json(out); }
    out.result = 'Body parsed fine; name+phone present. Real handler would succeed.';
    return res.status(200).json(out);
  } catch (err) {
    out.error = err.message; out.result='threw';
    return res.status(200).json(out);
  }
}
