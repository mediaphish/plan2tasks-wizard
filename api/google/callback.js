// api/google/callback.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

// Simple HTML success page with marketing CTA
function successHTML() {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Plan2Tasks – Connected</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; color:#0f172a; }
    .card { max-width:560px; margin: 12vh auto; background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:24px; box-shadow: 0 8px 24px rgba(15, 23, 42, .06); }
    .btn { display:inline-block; padding:10px 14px; border-radius:10px; text-decoration:none; font-weight:600; }
    .btn-primary { background:#06b6d4; color:#fff; }
    .muted { color:#475569; font-size:13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin:0 0 10px">You're connected ✅</h1>
    <p>Your Google Tasks is now linked to <b>Plan2Tasks</b>. You can close this tab.</p>
    <div style="height:10px"></div>
    <p class="muted">Want to assign tasks to others?</p>
    <p><a class="btn btn-primary" href="https://www.plan2tasks.com/#become-a-planner">Become a Planner</a></p>
    <div style="height:6px"></div>
    <p class="muted">This page is just a confirmation. You don’t need to visit the app.</p>
  </div>
</body>
</html>
`;
}

export default async function handler(req, res) {
  try {
    const { code, state } = req.query || {};
    if (!code) {
      return res.status(400).send("Missing code");
    }
    const parsedState = (()=>{ try{ return JSON.parse(Buffer.from((state||"").toString(), "base64").toString("utf8")); }catch{ return {}; }})();

    // Exchange code for tokens
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type":"application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI, // should be https://www.plan2tasks.com/api/google/callback
        grant_type: "authorization_code",
      })
    });
    const tok = await r.json();
    if (!r.ok || tok.error) {
      return res.status(400).send("OAuth error: "+(tok.error_description || tok.error || "unknown"));
    }

    // Resolve invite → planner/user emails (your /start built state with inviteId)
    const inviteId = parsedState?.inviteId || parsedState?.invite || null;
    let plannerEmail = null, userEmail = null;
    if (inviteId) {
      const { data, error } = await supabaseAdmin
        .from("invites")
        .select("planner_email,user_email")
        .eq("id", inviteId)
        .maybeSingle();
      if (!error && data) {
        plannerEmail = data.planner_email;
        userEmail = data.user_email;
      }
    }

    // Upsert connection
    if (userEmail && plannerEmail) {
      await supabaseAdmin
        .from("user_connections")
        .upsert({
          planner_email: plannerEmail,
          user_email: userEmail,
          provider: "google",
          google_access_token: tok.access_token,
          google_refresh_token: tok.refresh_token || null,
          google_scope: tok.scope || null,
          google_expires_at: tok.expires_in ? Math.floor(Date.now()/1000) + Number(tok.expires_in) : null,
          updated_at: new Date().toISOString(),
          status: "connected",
        }, { onConflict: "planner_email,user_email" });

      // Mark invite as used (optional)
      await supabaseAdmin.from("invites").update({ used_at: new Date().toISOString() }).eq("id", inviteId);
    }

    // Show confirmation/marketing page (no app link)
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(200).send(successHTML());
  } catch (e) {
    return res.status(500).send("Server error: "+String(e?.message||e));
  }
}
