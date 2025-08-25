// api/google/callback.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

const SITE =
  process.env.PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code"
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "Token exchange failed");
  return j;
}

function b64json(s) {
  try { return JSON.parse(Buffer.from(s, "base64url").toString("utf8")); }
  catch { return null; }
}

export default async function handler(req, res) {
  try {
    const url = new URL(`https://${req.headers.host}${req.url}`);
    const code = url.searchParams.get("code") || "";
    const stateRaw = url.searchParams.get("state") || "";
    const err = url.searchParams.get("error") || "";

    if (err) throw new Error(`Google error: ${err}`);
    if (!code) throw new Error("Missing code");
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      throw new Error("Missing Google env (client id/secret or redirect uri)");
    }

    const state = b64json(stateRaw);
    const inviteId = state?.inviteId || "";

    // Retrieve invite for context (planner/user)
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invites")
      .select("id, planner_email, user_email")
      .eq("id", inviteId)
      .single();
    if (invErr || !inv) throw new Error("Invite not found in callback");

    // Exchange code
    const tok = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString();

    // Upsert connection
    const row = {
      planner_email: inv.planner_email.toLowerCase(),
      user_email: inv.user_email.toLowerCase(),
      google_access_token: tok.access_token || null,
      google_refresh_token: tok.refresh_token || null,
      google_scope: tok.scope || null,
      google_token_type: tok.token_type || null,
      google_expires_at: expiresAt,
      updated_at: new Date().toISOString()
    };

    // Try upsert on composite key; if your schema differs, this still works on unique constraint if present.
    const up = await supabaseAdmin
      .from("user_connections")
      .upsert(row, { onConflict: "planner_email,user_email" })
      .select("*")
      .single();

    if (up.error) throw up.error;

    // Mark invite accepted
    await supabaseAdmin
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    // Friendly success page
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Connected</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px}</style>
</head><body>
<h2>You're connected!</h2>
<p>You can close this tab.</p>
<p><a href="${SITE}">Return to Plan2Tasks</a></p>
</body></html>`);
  } catch (e) {
    console.error("callback error", e);
    res.status(400).end(`Error: ${e.message}`);
  }
}
