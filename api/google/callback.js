// /api/google/callback.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (process.env.SITE_URL?.replace(/\/$/, "") + "/api/google/callback");

function htmlPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f7f8;margin:0;padding:20px}
.card{max-width:560px;margin:40px auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px}
h1{font-size:18px;margin:0 0 8px}p{margin:8px 0}</style>
</head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).send("GET only");

    const { code, state } = req.query;
    if (!code) {
      return res
        .status(400)
        .send(
          htmlPage(
            "Authorization failed",
            `<p>Missing authorization code.</p><p>State: ${state ? String(state) : "(none)"}.</p>`
          )
        );
    }

    // state carries: {"v":1,"inviteId":"..."} OR {"v":1,"inviteId":"...", "planner":"...", "user":"..."}
    let inviteId = null, planner = null, user = null;
    try {
      const s = JSON.parse(state);
      inviteId = s?.inviteId || null;
      planner = s?.planner || null;
      user = s?.user || null;
    } catch {}

    // 1) Exchange code for tokens
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        access_type: "offline",
      }),
    });
    const tokenJson = await tok.json();
    if (!tok.ok || tokenJson.error) {
      return res
        .status(400)
        .send(
          htmlPage(
            "Token exchange failed",
            `<p>${tokenJson.error_description || tokenJson.error || "Unknown error."}</p>`
          )
        );
    }

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token || null;
    const expiresIn = tokenJson.expires_in ? Number(tokenJson.expires_in) : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 2) If user email not known from invite, fetch profile email
    if (!user) {
      const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await who.json();
      user = profile?.email || user;
    }

    // Resolve planner/user from invite if needed
    if ((!planner || !user) && inviteId) {
      const { data: inv } = await supabaseAdmin
        .from("invites")
        .select("planner_email,user_email")
        .eq("id", inviteId)
        .maybeSingle();
      if (inv) {
        planner = planner || inv.planner_email;
        user = user || inv.user_email;
      }
    }

    if (!planner || !user) {
      return res
        .status(400)
        .send(
          htmlPage(
            "Missing planner or user",
            `<p>We couldn't determine the planner/user for this authorization.</p>`
          )
        );
    }

    // 3) Upsert user connection
    const payload = {
      planner_email: planner,
      user_email: user,
      google_access_token: accessToken,
      google_refresh_token: refreshToken,
      google_expires_at: expiresAt,
      status: "connected",
      updated_at: new Date().toISOString(),
    };

    // Upsert by composite (planner_email,user_email)
    const { error: upErr } = await supabaseAdmin
      .from("user_connections")
      .upsert(payload, { onConflict: "planner_email,user_email" });

    if (upErr) {
      return res
        .status(500)
        .send(
          htmlPage(
            "Database error",
            `<p>${upErr.message}</p><p>Invite: ${inviteId || "(none)"}; user: ${user}; planner: ${planner}</p>`
          )
        );
    }

    // 4) Success page
    const site = (process.env.SITE_URL || "").replace(/\/$/, "") || "https://www.plan2tasks.com";
    const justUser = `<p>Success! Your Google Tasks are now connected.</p>
<p>You can close this tab.</p>
<p><a href="${site}" style="display:inline-block;padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none">Return to Plan2Tasks</a></p>`;
    return res.status(200).send(htmlPage("Connected", justUser));
  } catch (e) {
    return res
      .status(500)
      .send(htmlPage("Server error", `<p>${e?.message || "Unknown"}</p>`));
  }
}
