// api/google/debug-config.js
export default async function handler(req, res) {
  const SITE =
    process.env.PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  res.json({
    site: SITE,
    clientId: process.env.GOOGLE_CLIENT_ID || "(missing)",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "(missing)",
    // NOTE: we DO NOT expose client secret
    ok: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REDIRECT_URI && SITE)
  });
}
