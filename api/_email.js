// ───────────────────────────────────────────────────────────
//  Email via Resend — confirmation to lead + alert to team.
//  All failures are swallowed: email must NEVER block a lead save.
// ───────────────────────────────────────────────────────────
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

// ── Confirmation email to the person who enquired ──
function confirmationHtml(name, ref) {
  const first = (name || '').split(' ')[0] || 'there';
  return `
  <div style="background:${INK};padding:40px 20px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#141416;border-radius:10px;overflow:hidden;border:1px solid #26262a">
      <div style="padding:28px 32px;border-bottom:1px solid #26262a">
        <div style="font-size:22px;font-weight:900;color:#f6f5f2;letter-spacing:-.5px">
          ISE<span style="color:${BLUE}">·PK</span>
        </div>
        <div style="font-size:11px;letter-spacing:2px;color:#888890;text-transform:uppercase;margin-top:3px">
          Integrated Security Engineering
        </div>
      </div>
      <div style="padding:32px">
        <p style="color:#f6f5f2;font-size:17px;margin:0 0 16px">Thank you, ${first}.</p>
        <p style="color:#a3a3a6;font-size:15px;line-height:1.6;margin:0 0 20px">
          We've received your enquiry and a member of our engineering team will
          get back to you within <strong style="color:${BLUE}">1–3 business days</strong>.
        </p>
        <div style="background:${INK};border:1px solid #26262a;border-radius:6px;padding:14px 18px;margin:0 0 24px">
          <span style="color:#888890;font-size:12px;letter-spacing:1px;text-transform:uppercase">Your reference</span><br>
          <span style="color:${BLUE};font-size:16px;font-family:monospace;letter-spacing:1px">${ref}</span>
        </div>
        <p style="color:#a3a3a6;font-size:14px;line-height:1.6;margin:0 0 8px">
          If it's urgent, reach us directly:
        </p>
        <p style="color:#f6f5f2;font-size:14px;line-height:1.7;margin:0">
          📞 <a href="tel:+923007017786" style="color:${BLUE};text-decoration:none">+92 300 7017786</a><br>
          ✉️ <a href="mailto:ise@isepk.com.pk" style="color:${BLUE};text-decoration:none">ise@isepk.com.pk</a>
        </p>
      </div>
      <div style="padding:18px 32px;border-top:1px solid #26262a;background:${INK}">
        <p style="color:#6c6c70;font-size:12px;margin:0;line-height:1.5">
          Fire · CCTV · Access Control · Intrusion · Gas Detection · Automation<br>
          Karachi, Pakistan
        </p>
      </div>
    </div>
  </div>`;
}

// ── Internal alert to the team ──
function teamAlertHtml(lead) {
  const row = (k, v) => v
    ? `<tr><td style="padding:6px 12px;color:#888;font-size:13px">${k}</td><td style="padding:6px 12px;color:#111;font-size:13px"><strong>${v}</strong></td></tr>`
    : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#0b0b0c;font-size:18px">New lead — ${lead.ref}</h2>
    <table style="border-collapse:collapse;width:100%;background:#f7f7f5;border-radius:6px">
      ${row('Name', lead.name)}
      ${row('Company', lead.company)}
      ${row('Phone', lead.phone)}
      ${row('Email', lead.email)}
      ${row('Service', lead.service_type)}
      ${row('City', lead.city)}
      ${row('Message', lead.message)}
      ${row('Source', lead.source)}
    </table>
    <p style="margin-top:16px">
      <a href="https://isepk.com.pk/admin" style="color:#34AAFB">Open in CRM →</a>
    </p>
  </div>`;
}

export async function sendLeadEmails(lead) {
  const resend = client();
  if (!resend) return; // Resend not configured — skip silently

  const from = process.env.RESEND_FROM || 'ISE PK <noreply@isepk.com.pk>';
  const team = process.env.TEAM_EMAIL || 'ise@isepk.com.pk';

  const tasks = [];

  // Confirmation to the lead (only if they gave an email)
  if (lead.email) {
    tasks.push(
      resend.emails.send({
        from,
        to: lead.email,
        subject: `We've received your enquiry — ${lead.ref}`,
        html: confirmationHtml(lead.name, lead.ref),
      }).catch(e => console.error('confirmation email failed:', e?.message))
    );
  }

  // Alert to the team
  tasks.push(
    resend.emails.send({
      from,
      to: team,
      replyTo: lead.email || undefined,
      subject: `New lead: ${lead.name}${lead.company ? ' — ' + lead.company : ''} (${lead.ref})`,
      html: teamAlertHtml(lead),
    }).catch(e => console.error('team alert email failed:', e?.message))
  );

  await Promise.allSettled(tasks);
}
