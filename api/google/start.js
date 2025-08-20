// api/google/start.js
export default async function handler(req, res) {
  const { invite } = req.query || {};
  if (!invite) return res.status(400).send("Missing invite");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirect = process.env.GOOGLE_REDIRECT_URI; // https://.../api/google/callback
  const scope = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/tasks",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirect);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline"); // request refresh_token
  authUrl.searchParams.set("prompt", "consent");       // force consent on first connect
  authUrl.searchParams.set("state", invite);           // carry invite code through

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}
