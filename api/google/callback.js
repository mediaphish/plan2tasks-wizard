// api/connections/google/callback.js
// Exchanges the auth code for tokens and upserts into public.user_connections.
//
// ENV needed: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
// On success returns JSON { ok:true, userEmail, google_expires_at, scopes }
// (Plain JSON keeps this flow simple; you can add a redirect later if you like.)

import { supabaseAdmin } from "../../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return res.status(400).json({ ok: false, error });
    if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

    let userEmail = null;
    try {
      userEmail = JSON.parse(Buffer.from(String(state || ""), "base64url").toString("utf8"))?.userEmail || null;
    } catch { /* ignore */ }
    if (!userEmail) return res.status(400).json({ ok: false, error: "Missing userEmail in state" });

    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ ok: false, error: "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" });
    }

    const redirectUri = `https://${req.headers.host}/api/connections/google/callback`;

    // Exchange code for tokens
    const form = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(400).json({
        ok: false,
        error: j?.error || `http_${r.status}`,
        error_description: j?.error_description || null
      });
    }

    const accessToken  = j.access_token || null;
    const refreshToken = j.refresh_token || null; // should be present because we used prompt=consent + access_type=offline
    const tokenType    = j.token_type || "Bearer";
    const expiresIn    = Number(j.expires_in || 3600);
    const scope        = j.scope || ""; // Google returns a space-delimited string
    const expUnix      = Math.floor(Date.now() / 1000) + expiresIn;
    const expiresAtIso = new Date(expUnix * 1000).toISOString();

    // Basic safety: require that scopes include Google Tasks
    if (!scope.includes("https://www.googleapis.com/auth/tasks")) {
      return res.status(400).json({ ok: false, error: "missing_tasks_scope", detail: scope });
    }

    // Upsert into public.user_connections keyed by user_email
    const upsertRow = {
      user_email: userEmail,
      provider: "google",
      google_access_token: accessToken,
      google_refresh_token: refreshToken,          // may be null if Google decided not to return (e.g., very recent reconnection); usually present on first consent
      google_scope: scope,
      google_token_type: tokenType,
      google_token_expiry: expUnix,
      google_expires_at: expiresAtIso,
      google_tasklist_id: null                     // we can set when we first create/find a list
    };

    const { error: upErr } = await supabaseAdmin
      .from("user_connections")
      .upsert(upsertRow, { onConflict: "user_email" });

    if (upErr) {
      return res.status(500).json({ ok: false, error: "Database error (upsert)" });
    }

    return res.status(200).json({
      ok: true,
      userEmail,
      google_expires_at: expiresAtIso,
      scopes: scope.split(" ")
    });
  } catch (e) {
    console.error("GET /api/connections/google/callback error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
