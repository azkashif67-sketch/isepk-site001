import { getSession, signToken, setSessionCookie } from './_lib.js';

// Cheap "am I still logged in?" check — no database call.
// Refreshes the cookie so the 10-min idle window slides forward.
export default function handler(req, res) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ authed: false });
  }
  const fresh = signToken(session.username);
  setSessionCookie(res, fresh);
  return res.status(200).json({ authed: true, username: session.username });
}
