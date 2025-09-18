// /api/google/start.js
// Vercel Serverless Function (plain Node.js, no frameworks)
// Starts Google OAuth with REQUIRED scopes and builds the state from ?userEmail=....
//
// Usage:
//   https://www.plan2tasks.com/api/google/start?userEmail=<email>
// Behavior:
//   - Validates userEmail
//   - Redirects to Google with scopes: openid, userinfo.email, tasks
//   - Sets access_type=offline (refresh token) and prompt=consent
//   - Encodes { userEmail } in state for /api/google/callback

module.exports = async (req, res) => {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const origin = `${proto}://${host}`;
    const url = new URL(req.url, origin);

    const userEmail = url.searchParams.get("userEmail") || "";
    if (!userEmail) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "missing_userEmail" }));
      return;
    }

    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const REDIRECT_URI =
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/callback`;

    if (!CLIENT_ID) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "missing_GOOGLE_CLIENT_ID" }));
      return;
    }

    // REQUIRED scopes (must include Google Tasks).
    const scopes = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/tasks",
    ];

    // Build state payload so callback knows which user we authorized.
    const state = JSON.stringify({ userEmail });

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", CLIENT_ID);
    auth.searchParams.set("redirect_uri", REDIRECT_URI);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", scopes.join(" "));
    auth.searchParams.set("access_type", "offline"); // ensure refresh token
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("prompt", "consent"); // show consent each time (clean testing)
    auth.searchParams.set("state", state);

    res.statusCode = 302;
    res.setHeader("Location", auth.toString());
    res.end();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "start_failed", detail: String(err && err.message || err) }));
  }
};
