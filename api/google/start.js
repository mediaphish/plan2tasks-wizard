// /api/google/start.js
// Vercel serverless route: starts Google OAuth with the REQUIRED Tasks scope
// Stack: plain Node/JS (no Next.js / TS).
// Reads GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI from env (set REDIRECT to /api/google/callback).
// Usage: https://www.plan2tasks.com/api/google/start?userEmail=<email>

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const userEmail = url.searchParams.get("userEmail") || "";
    if (!userEmail) {
      res.status(400).json({ ok: false, error: "missing_userEmail" });
      return;
    }

    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const REDIRECT_URI =
      process.env.GOOGLE_REDIRECT_URI ||
      `https://${req.headers.host}/api/google/callback`;

    if (!CLIENT_ID) {
      res.status(500).json({ ok: false, error: "missing_GOOGLE_CLIENT_ID" });
      return;
    }

    // REQUIRED SCOPES: include Google Tasks explicitly.
    const scopes = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/tasks",
    ];

    // Persist who we’re authenticating for.
    const state = JSON.stringify({ userEmail });

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", CLIENT_ID);
    auth.searchParams.set("redirect_uri", REDIRECT_URI);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", scopes.join(" "));
    auth.searchParams.set("access_type", "offline"); // ensures refresh token
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("prompt", "consent"); // show scopes explicitly
    auth.searchParams.set("state", state);

    // Redirect to Google consent
    res.writeHead(302, { Location: auth.toString() });
    res.end();
  } catch (err) {
    res.status(500).json({ ok: false, error: "start_failed", detail: String(err?.message || err) });
  }
}
