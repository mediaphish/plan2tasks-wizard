// api/google/start.js
export const config = { runtime: "nodejs" };

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function absoluteBase(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  try {
    const invite = (req.query.invite || "").toString().trim();
    if (!invite) return res.status(400).send("Missing invite");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).send("Missing GOOGLE_CLIENT_ID");

    // Use env override if provided; otherwise build from the request host.
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${absoluteBase(req)}/api/google/callback`;

    // SCOPES: must include Tasks + basic profile/email so we can fetch the user email.
    const scopes = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/tasks"
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",     // needed for refresh_token
      prompt: "consent",          // force Google to show consent (and issue refresh_token)
      scope: scopes,
      state: invite               // we’ll use this to look up the invited user row
    });

    const url = `${AUTH_URL}?${params.toString()}`;
    res.setHeader("Location", url);
    return res.status(302).end();
  } catch (e) {
    return res.status(500).send(String(e.message || e));
  }
}
