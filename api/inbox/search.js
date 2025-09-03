// api/inbox/search.js
// Minimal alias so the UI's /api/inbox/search?q=... works.
// We forward to /api/inbox with the same query string.

export default async function handler(req, res) {
  try {
    const host = req.headers.host || "www.plan2tasks.com";
    const qs = req.url.includes("?") ? req.url.split("?")[1] : "";
    const target = `https://${host}/api/inbox${qs ? "?" + qs : ""}`;

    // 307 preserves method + body (we only do GET here, but 307 is safest)
    res.writeHead(307, { Location: target });
    res.end();
  } catch (e) {
    res.status(500).json({ error: "search alias error" });
  }
}
