// api/connections/status.js
// GET /api/connections/status?userEmail=someone@example.com
// Non-destructive status check for a user's Google Tasks connection.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const userEmail = String(url.searchParams.get("userEmail") || "").trim().toLowerCase();
    if (!userEmail) {
      return res.status(400).json({ ok: false, error: "Missing userEmail" });
    }

    // Read from the real token table you have: public.user_connections
    // Be tolerant of multiple rows; prefer the most recent by google_expires_at or token_expiry if present.
    let q = supabaseAdmin
      .from("user_connections")
      .select("*")
      .eq("user_email", userEmail);

    // Try to prefer most recent
    try { q = q.order("google_expires_at", { ascending: false }); } catch {}
    try { q = q.order("token_expiry", { ascending: false }); } catch {}

    const { data: rows, error } = await q.limit(1);
    if (error) {
      return res.status(500).json({ ok: false, error: "Database error (read)" });
    }

    if (!rows || !rows.length) {
      return res.status(200).json({
        ok: true,
        userEmail,
        tableUsed: "user_connections",
        hasAccessToken: false,
        hasRefreshToken: false,
        canCallTasks: false,
        reason: "No token row for this user.",
      });
    }

    const found = rows[0] || {};
    const accessToken  = found.google_access_token || null;
    const refreshToken = found.google_refresh_token || null;

    let canCallTasks = false;
    let googleError = null;

    if (accessToken) {
      try {
        const r = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (r.ok) {
          canCallTasks = true;
        } else {
          const j = await r.json().catch(() => ({}));
          googleError = j?.error?.message || j?.error || `http_${r.status}`;
        }
      } catch (e) {
        googleError = String(e?.message || e);
      }
    }

    return res.status(200).json({
      ok: true,
      userEmail,
      tableUsed: "user_connections",
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      provider: found.provider ?? null,
      google_scope: found.google_scope ?? null,
      google_token_type: found.google_token_type ?? null,
      google_token_expiry: found.google_token_expiry ?? null,
      google_expires_at: found.google_expires_at ?? null,
      google_tasklist_id: found.google_tasklist_id ?? null,
      canCallTasks,
      googleError,
    });
  } catch (e) {
    console.error("GET /api/connections/status error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
