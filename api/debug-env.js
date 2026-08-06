// TEMPORARY DEBUG — delete after fixing Turso.
// Reveals whether env vars are present + their shape, WITHOUT leaking secrets.
export default function handler(req, res) {
  const url = process.env.TURSO_URL || '';
  const token = process.env.TURSO_TOKEN || '';

  res.status(200).json({
    TURSO_URL_present: !!url,
    TURSO_URL_scheme: url.split('://')[0] || '(none)',
    TURSO_URL_hasTrailingSpace: url !== url.trim(),
    TURSO_URL_endsWithSlash: url.trim().endsWith('/'),
    TURSO_URL_preview: url ? url.slice(0, 18) + '…' + url.slice(-14) : '(empty)',

    TURSO_TOKEN_present: !!token,
    TURSO_TOKEN_length: token.length,
    TURSO_TOKEN_hasWhitespace: /\s/.test(token),
    TURSO_TOKEN_startsWith: token ? token.slice(0, 6) + '…' : '(empty)',

    ADMIN_USER_present: !!process.env.ADMIN_USER,
    ADMIN_PASS_present: !!process.env.ADMIN_PASS,
    SESSION_SECRET_present: !!process.env.SESSION_SECRET,
  });
}
