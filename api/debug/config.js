// /api/debug/config.js
export default function handler(req, res) {
  const site = (process.env.SITE_URL || "").replace(/\/$/, "") || "";
  const cfg = {
    ok: true,
    site,
    clientId: process.env.GOOGLE_CLIENT_ID || "(missing)",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      (site ? site + "/api/google/callback" : "(missing)"),
  };
  res.status(200).json(cfg);
}
