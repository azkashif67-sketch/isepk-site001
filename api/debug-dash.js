// TEMP - dump analytics response shape to find the render mismatch. Delete after.
import analyticsHandler from './analytics.js';

export default async function handler(req, res) {
  // Call the real analytics handler but bypass auth by faking a session cookie check:
  // Instead, replicate its data return by calling it with a mock that captures json.
  let captured = null;
  const mockRes = {
    status: () => mockRes,
    json: (o) => { captured = o; return mockRes; },
    setHeader: () => {},
  };
  // Fake an authed request: analytics uses requireAuth which reads cookie.
  // We can't easily fake the HMAC cookie here, so instead just report the SHAPE
  // by calling with the real req (if you're logged in, cookie passes through).
  try {
    await analyticsHandler({ ...req, query: { range: '7d' } }, mockRes);
    if (captured) {
      const shape = {};
      for (const k of Object.keys(captured)) {
        const v = captured[k];
        shape[k] = Array.isArray(v) ? `array[${v.length}]` : (v===null?'null':typeof v);
      }
      return res.status(200).json({ ok:true, topLevelKeys: Object.keys(captured), shape, live: captured.live, totals: captured.totals });
    }
    return res.status(200).json({ ok:false, note:'handler did not call json (likely auth returned 401 - are you logged in?)' });
  } catch (e) {
    return res.status(200).json({ ok:false, error: e.message, stack:(e.stack||'').split('\n').slice(0,4).join(' | ') });
  }
}
