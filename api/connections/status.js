// api/connections/status.js
// GET /api/connections/status?userEmail=someone@example.com
// Non-destructive status check for a user's Google Tasks connection.
//
// What it does:
// 1) Tries to find a token row for the user in common tables.
// 2) If it finds an access_token, makes a tiny read-only call to Google Tasks.
// 3) Returns JSON with what it found. Never mutates your DB.

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

    // 1) Try to locate a token row in plausible tables/columns.
    const tablesToTry = [
      { table: "user_connections", emailCol: "user_email" },
      { table: "connections",      emailCol: "user_email" },
      { table: "google_tokens",    emailCol: "email" },
      { table: "oauth_tokens",     emailCol: "email" },
    ];

    let found = null;
    let tableUsed = null;

    for (const t of tablesToTry) {
      try {
        const sel =
          "*, access_token, refresh_token, expires_at, provider, revoked, deleted_at, user_email, email";
        const { data, error } = await supabaseAdmin
          .from(t.table)
          .select(sel)
          .eq(t.emailCol, userEmail)
          .maybeSingle();

        // If table doesn't exist or other PostgREST error, skip gracefully.
        if (error) continue;
        if (data) {
          found = data;
          tableUsed = t.table;
          break;
        }
      } catch {
        // Ignore and continue to next table
      }
    }

    if (!found) {
      return res.status(200).json({
        ok: true,
        userEmail,
        tableUsed: null,
        hasAccessToken: false,
        hasRefreshToken: false,
        canCallTasks: false,
        reason: "No token row found in known tables.",
      });
    }

    const accessToken =
      found.access_token ||
      found.google_access_token || // just in case
      null;

    const hasRefreshToken = !!(found.refresh_token);
    const hasAccessToken = !!accessToken;

    // 2) If we have an access token, try a tiny read-only Google Tasks call.
    let canCallTasks = false;
    let googleError = null;

    if (hasAccessToken) {
      try {
        const r = await fetch(
          "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
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
      tableUsed,
      hasAccessToken,
      hasRefreshToken,
      expiresAt: found.expires_at ?? null,
      provider: found.provider ?? null,
      revoked: found.revoked ?? null,
      deleted_at: found.deleted_at ?? null,
      canCallTasks,
      googleError,
    });
  } catch (e) {
    console.error("GET /api/connections/status error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
