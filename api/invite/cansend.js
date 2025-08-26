// api/invite/cansend.js
export default function handler(req, res) {
  // optional: only allow GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }

  const emailEnabled = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

  // tiny bit of caching to keep it snappy in the UI
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");

  return res.status(200).json({
    emailEnabled,
    from: process.env.RESEND_FROM || null,
  });
}
