// /api/debug/config.js
export default function handler(req, res) {
  // Figure out your site URL (env first, else from request)
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const site = (process.env.SITE_URL || `${proto}://${host}`).replace(/\/$/, "");

  const clientId = process.env.GOOGLE_CLIENT_ID || null;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${site}/api/google/callback`;

  const emailEnabled = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;

  res.status(200).json({
    ok: true,
    site,
    clientId,
    redirectUri,
    email: {
      enabled: emailEnabled,
      from: process.env.RESEND_FROM || null,
    },
    // quick visibility into whether env vars are actually present
    envPresence: {
      SITE_URL: !!process.env.SITE_URL,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      RESEND_FROM: !!process.env.RESEND_FROM,
    },
  });
}
