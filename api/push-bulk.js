// api/push-bulk.js
// Bulk-push: loops over each user and forwards to existing /api/push endpoint.
// Body: { plannerEmail, userEmails: string[], planBlock: string, mode: "append"|"replace" }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { plannerEmail, userEmails, planBlock, mode } = req.body || {};
    if (!plannerEmail || !Array.isArray(userEmails) || !userEmails.length || !planBlock) {
      return res.status(400).json({ error: "Missing plannerEmail, userEmails[], or planBlock" });
    }
    const pushMode = mode === "replace" ? "replace" : "append";

    // Build base URL to call our own /api/push
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
    const proto = (req.headers["x-forwarded-proto"] || "https").toString();
    const baseUrl = host ? `${proto}://${host}` : (process.env.SITE_URL || "https://www.plan2tasks.com");

    // De-dupe emails just in case
    const emails = Array.from(new Set(userEmails.map(e => (e || "").trim()).filter(Boolean)));

    const results = [];
    for (const userEmail of emails) {
      try {
        const r = await fetch(`${baseUrl}/api/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plannerEmail, userEmail, planBlock, mode: pushMode })
        });

        const text = await r.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { error: text }; }

        if (!r.ok) {
          results.push({ userEmail, ok: false, error: data.error || `HTTP ${r.status}` });
        } else {
          results.push({
            userEmail,
            ok: true,
            created: data.created || 0,
            listTitle: data.listTitle || null,
          });
        }
      } catch (e) {
        results.push({ userEmail, ok: false, error: e.message || "Push failed" });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    return res.status(200).json({ ok: true, okCount, total: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Bulk push failed" });
  }
}
