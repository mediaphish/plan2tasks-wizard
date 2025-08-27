// api/google/callback.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

function successHTML(site = "https://www.plan2tasks.com") {
  const logo = `${site}/logo.svg`;
  const cta = `${site}/become-a-planner.html`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Plan2Tasks – Connected</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { --ink:#0f172a; --muted:#475569; --bg:#f8fafc; --card:#fff; --line:#e5e7eb; --brand:#06b6d4; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:var(--bg); color:var(--ink); }
    .card { max-width:560px; margin:12vh auto; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px;
            box-shadow:0 8px 24px rgba(15,23,42,.06); }
    .logo { height:28px; vertical-align:middle; }
    .btn { display:inline-block; padding:10px 14px; border-radius:10px; text-decoration:none; font-weight:700; }
    .btn-primary { background:var(--brand); color:#fff; }
    .muted { color:var(--muted); font-size:13px; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <img src="${logo}" alt="Plan2Tasks" class="logo" />
      <div style="font-weight:800">Plan2Tasks</div>
    </div>
    <h1 style="margin:0 0 10px">You're connected ✅</h1>
    <p>Your Google Tasks is now linked to <b>Plan2Tasks</b>. You can close this tab.</p>
    <div style="height:14px"></div>
    <p class="muted">Want to assign tasks to others with this same flow?</p>
    <p><a class="btn btn-primary" href="${cta}">Become a Planner</a></p>
    <div style="height:6px"></div>
    <p class="muted">This is only a confirmation page. No further action is needed.</p>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    const { code, state } = req.query || {};
    if (!code) return res.status(400).send("Missing code");

    const parsedState = (() => {
      try { return JSON.parse(Buffer.from(String(state || ""), "base64").toString("utf8")); }
      catch { return {}; }
    })();

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI, // https://www.plan2tasks.com/api/google/callback
        grant_type: "authorization_code",
      }),
    });
    const tok = await tokenResp.json();
    if (!tokenResp.ok || tok.error) {
      return res.status(400).send("OAuth error: " + (tok.error_description || tok.error || "unknown"));
    }

    // If this came from an invite, map it to planner/user
    const inviteId = parsedState?.inviteId || parsedState?.invite || null;
    let plannerEmail = null, userEmail = null;
    if (inviteId) {
      const { data } = await supabaseAdmin
        .from("invites")
        .select("planner_email,user_email")
        .eq("id", inviteId)
        .maybeSingle();
      if (data) {
        plannerEmail = data.planner_email;
        userEmail = data.user_email;
      }
    }

    // Save/refresh connection
    if (plannerEmail && userEmail) {
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

      await supabaseAdmin.from("invites").update({ used_at: new Date().toISOString() }).eq("id", inviteId);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const site = process.env.SITE_URL || `https://${req.headers.host}`;
    return res.status(200).send(successHTML(site));
  } catch (e) {
    return res.status(500).send("Server error: " + String(e?.message || e));
  }
}
