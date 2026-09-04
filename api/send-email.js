import { requireAuth, db } from './_lib.js';
import { Resend } from 'resend';

let _resend = null;
function client() {
  if (!_resend && process.env.RESEND_API_KEY) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const BLUE = '#34AAFB';
const INK = '#0b0b0c';

// Wraps the staff's plain-text message in the ISE branded shell
function brandedHtml(bodyText) {
  const safe = String(bodyText || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `
  <div style="background:${INK};padding:40px 20px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#141416;border-radius:10px;overflow:hidden;border:1px solid #26262a">
      <div style="padding:26px 32px;border-bottom:1px solid #26262a">
        <div style="font-size:22px;font-weight:900;color:#f6f5f2;letter-spacing:-.5px">
          ISE<span style="color:${BLUE}">·PK</span>
        </div>
        <div style="font-size:11px;letter-spacing:2px;color:#888890;text-transform:uppercase;margin-top:3px">
          Integrated Security Engineering
        </div>
      </div>
      <div style="padding:30px 32px;color:#d8d8d6;font-size:15px;line-height:1.65">
        ${safe}
      </div>
      <div style="padding:18px 32px;border-top:1px solid #26262a;background:${INK}">
        <p style="color:#a3a3a6;font-size:13px;line-height:1.7;margin:0">
          📞 <a href="tel:+923007017786" style="color:${BLUE};text-decoration:none">+92 300 7017786</a> &nbsp;·&nbsp;
          ✉️ <a href="mailto:info@isepk.com.pk" style="color:${BLUE};text-decoration:none">info@isepk.com.pk</a><br>
          <span style="color:#6c6c70;font-size:12px">Fire · CCTV · Access · Intrusion · Gas · Automation — Karachi, Pakistan</span>
        </p>
      </div>
    </div>
  </div>`;
}

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resend = client();
  if (!resend) {
    return res.status(500).json({ error: 'Email not configured (RESEND_API_KEY missing)' });
  }

  try {
    const { id, to, subject, body } = req.body || {};
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject and body are required' });
    }

    const from = process.env.RESEND_FROM || 'ISE PK <noreply@isepk.com.pk>';
    const team = process.env.TEAM_EMAIL || 'info@isepk.com.pk';

    const result = await resend.emails.send({
      from,
      to,
      replyTo: team,
      subject,
      html: brandedHtml(body),
    });

    if (result.error) {
      console.error('send-email error:', result.error);
      return res.status(502).json({ error: result.error.message || 'Send failed' });
    }

    // Append a log line to the lead's notes (best-effort)
    if (id) {
      try {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const logLine = `\n[${stamp}] Email sent by ${session.username}: "${subject}"`;
        await db().execute({
          sql: `UPDATE leads SET notes = COALESCE(notes, '') || ? WHERE id = ?`,
          args: [logLine, id],
        });
      } catch (e) {
        console.error('note log failed:', e?.message);
      }
    }

    return res.status(200).json({ ok: true, id: result.data?.id });
  } catch (err) {
    console.error('send-email exception:', err);
    return res.status(500).json({ error: 'Server error sending email' });
  }
}
