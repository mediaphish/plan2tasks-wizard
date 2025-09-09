// api/google/which-oauth.js
// GET /api/google/which-oauth?userEmail=someone@example.com
// Non-destructive: shows which client_id and redirect_uri your deployment is using.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("GET only");
  }

  const host = req.headers.host;
  const url = new URL(req.url, `https://${host}`);
  const userEmail = String(url.searchParams.get("userEmail") || "").trim().toLowerCase();

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
  const clientIdMasked = CLIENT_ID
    ? `${CLIENT_ID.slice(0, 8)}...${CLIENT_ID.slice(-6)}`
    : null;

  // This is the redirect URI your code is *actually* sending to Google
  const redirectUri = `https://${host}/api/connections/google/callback`;

  const state = Buffer.from(JSON.stringify({ userEmail })).toString("base64url");
  const params = new URLSearchParams({
    client_id: CLIENT_ID || "",
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

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return res.status(200).json({
    ok: true,
    userEmail,
    host,
    clientId_tail: clientIdMasked,     // masked for safety
    redirect_uri: redirectUri,         // EXACT value sent to Google
    authUrl                            // handy if you want to click it
  });
}
