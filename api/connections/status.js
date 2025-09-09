// api/connections/status.js
// GET /api/connections/status?userEmail=...  -> { ok, userEmail, canCallTasks, googleError? }
// Non-destructive: reads current token via your existing helper, makes a tiny Google Tasks call.

import { getAccessTokenForUser } from "../lib/google-tasks.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });
  try {
    const userEmail = String(new URL(req.url, `https://${req.headers.host}`).searchParams.get("userEmail") || "").trim().toLowerCase();
    if (!userEmail) return res.status(400).json({ ok: false, error: "Missing userEmail" });

    let accessToken = null;
    try {
      accessToken = await getAccessTokenForUser(userEmail);
    } catch (e) {
      return res.status(200).json({ ok: true, userEmail, canCallTasks: false, googleError: String(e?.message || e) });
    }

    // Minimal, read-only call
    const r = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (r.ok) {
      return res.status(200).json({ ok: true, userEmail, canCallTasks: true });
    } else {
      const j = await r.json().catch(() => ({}));
      return res.status(200).json({ ok: true, userEmail, canCallTasks: false, googleError: j?.error?.message || j?.error || `http_${r.status}` });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
