// api/connections/google/start.js
// Redirects to Google OAuth with the correct scopes for Tasks.
// Usage: GET /api/connections/google/start?userEmail=someone@example.com
//
// ENV needed: GOOGLE_CLIENT_ID
// Redirect URI is computed from the current host: https://<host>/api/connections/google/callback
// Make sure this exact URI is added to your Google Cloud "Authorized redirect URIs".

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("GET only");
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const userEmail = String(url.searchParams.get("userEmail") || "").trim().toLowerCase();
  if (!userEmail) return res.status(400).send("Missing userEmail");

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) return res.status(500).send("Missing GOOGLE_CLIENT_ID");

  const redirectUri = `https://${req.headers.host}/api/connections/google/callback`;
  const state = Buffer.from(JSON.stringify({ userEmail })).toString("base64url");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",              // get refresh token
    prompt: "consent",                   // force asking for consent to ensure refresh token
    include_granted_scopes: "true",
    scope: [
      "https://www.googleapis.com/auth/tasks",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid"
    ].join(" "),
    state
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
}
