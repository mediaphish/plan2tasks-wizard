// api/connections/refresh.js
// GET /api/connections/refresh?userEmail=... [&dryRun=1]
// Safely refreshes Google access_token using stored refresh_token.
// - dryRun=1: attempts refresh, but DOES NOT write to DB (returns what it WOULD write).
// - No dryRun: performs refresh and UPDATES user_connections row.
//
// Env needed: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Table: public.user_connections (columns: user_email, google_refresh_token, google_access_token,
//        google_token_type, google_scope, google_expires_at (timestamptz), google_token_expiry (int))
//
// Response never includes raw tokens for safety.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const userEmail = String(url.searchParams.get("userEmail") || "").trim().toLowerCase();
    const dryRun = !!(url.searchParams.get("dryRun") && url.searchParams.get("dryRun") !== "0" && url.searchParams.get("dryRun") !== "false");

    if (!userEmail) return res.status(400).json({ ok: false, error: "Missing userEmail" });

    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ ok: false, error: "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars" });
    }

    // Load latest connection row for this user
    let q = supabaseAdmin.from("user_connections").select("*").eq("user_email", userEmail);
    try { q = q.order("google_expires_at", { ascending: false }); } catch {}
    try { q = q.order("google_token_expiry", { ascending: false }); } catch {}
    const { data: rows, error: readErr } = await q.limit(1);

    if (readErr) return res.status(500).json({ ok: false, error: "Database error (read)" });
    if (!rows || !rows.length) {
      return res.status(404).json({ ok: false, error: "No user_connections row for this user" });
    }

    const row = rows[0];
    const refreshToken = row.google_refresh_token || null;
    if (!refreshToken) {
      return res.status(400).json({ ok: false, error: "No refresh_token stored for this user" });
    }

    // Attempt token refresh (non-destructive)
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Common failure: invalid_grant when refresh token was revoked/expired
      return res.status(400).json({
        ok: false,
        error: j?.error || `http_${resp.status}`,
        error_description: j?.error_description || null
      });
    }

    const newAccessToken = j.access_token || null;
    const tokenType = j.token_type || row.google_token_type || "Bearer";
    const scope = j.scope || row.google_scope || null;
    const expiresIn = Number(j.expires_in || 3600);
    const tokenExpiryUnix = Math.floor(Date.now() / 1000) + expiresIn;
    const expiresAtISO = new Date(tokenExpiryUnix * 1000).toISOString();

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        userEmail,
        wouldUpdate: {
          google_token_type: tokenType,
          google_scope: scope,
          google_token_expiry: tokenExpiryUnix,
          google_expires_at: expiresAtISO
        }
      });
    }

    // Commit: update the row with fresh token metadata (never echo raw access token)
    const { data: upd, error: updErr } = await supabaseAdmin
      .from("user_connections")
      .update({
        google_access_token: newAccessToken,
        google_token_type: tokenType,
        google_scope: scope,
        google_token_expiry: tokenExpiryUnix,
        google_expires_at: expiresAtISO
      })
      .eq("user_email", userEmail)
      .select("*")
      .maybeSingle();

    if (updErr) return res.status(500).json({ ok: false, error: "Database error (update)" });

    return res.status(200).json({
      ok: true,
      dryRun: false,
      userEmail,
      updated: {
        google_token_type: tokenType,
        google_scope: scope,
        google_token_expiry: tokenExpiryUnix,
        google_expires_at: expiresAtISO
      }
    });
  } catch (e) {
    console.error("GET /api/connections/refresh error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
