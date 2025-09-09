// api/google/start.js
// GET /api/google/start?userEmail=someone@example.com
// Redirects to Google OAuth with the Tasks scope.
// NOTE: callback is intentionally /api/connections/google/callback to match your Google OAuth settings.

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

  // Use the /api/connections/google/callback route for the redirect
  const redirectUri = `https://${req.headers.host}/api/connections/google/callback`;
  const state = Buffer.from(JSON.stringify({ userEmail })).toString("base64url");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
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
