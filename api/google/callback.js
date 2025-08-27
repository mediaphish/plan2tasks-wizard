// /api/google/callback.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  (process.env.SITE_URL?.replace(/\/$/, "") + "/api/google/callback");

function htmlPage(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f7f8;margin:0;padding:20px}
  .card{max-width:560px;margin:40px auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px}</style>
  </head><body><div class="card"><h1 style="margin:0 0 8px;font-size:18px">${title}</h1>${bodyHtml}</div></body></html>`;
}

function parseState(raw) {
  if (!raw) return {};
  try {
    // try base64url
    const norm = String(raw).replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm + "===".slice((norm.length + 3) % 4);
    const json = Buffer.from(pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    try { return JSON.parse(raw); } catch { return {}; }
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).send("GET only");
    const { code } = req.query;
    const st = parseState(req.query.state);
    let { inviteId = null, planner: plannerEmail = null, user: userEmail = null } = st || {};

    if (!code) {
      return res.status(400).send(htmlPage("Authorization failed", "<p>Missing code.</p>"));
    }

    // Exchange code → tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
    const token = await tokenRes.json();
    if (!tokenRes.ok || token.error) {
      return res
        .status(400)
        .send(htmlPage("Token exchange failed", `<p>${token.error_description || token.error || "unknown"}</p>`));
    }

    // If userEmail wasn’t in state, fetch it
    if (!userEmail) {
      const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const profile = await who.json();
      if (profile?.email) userEmail = profile.email;
    }

    // If planner/user still missing but invite present, look them up
    if ((!plannerEmail || !userEmail) && inviteId) {
      const { data: inv } = await supabaseAdmin
        .from("invites")
        .select("planner_email,user_email")
        .eq("id", inviteId)
        .maybeSingle();
      if (inv) {
        plannerEmail = plannerEmail || inv.planner_email;
        userEmail = userEmail || inv.user_email;
      }
    }

    if (!plannerEmail || !userEmail) {
      return res
        .status(400)
        .send(htmlPage("Missing planner or user", "<p>We couldn’t determine the planner/user for this authorization.</p>"));
    }

    const expiresAt = new Date(Date.now() + (Number(token.expires_in || 3600) * 1000)).toISOString();

    const payload = {
      planner_email: plannerEmail,
      user_email: userEmail,
      google_access_token: token.access_token,
      google_refresh_token: token.refresh_token || null,
      google_expires_at: expiresAt,
      status: "connected",
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabaseAdmin
      .from("user_connections")
      .upsert(payload, { onConflict: "planner_email,user_email" });
    if (upErr) {
      return res.status(500).send(htmlPage("Database error", `<p>${upErr.message}</p>`));
    }

    if (inviteId) {
      await supabaseAdmin.from("invites").update({ used_at: new Date().toISOString() }).eq("id", inviteId);
    }

    const site = (process.env.SITE_URL || "").replace(/\/$/, "") || "https://www.plan2tasks.com";
    const body = `<p>Success! Your Google Tasks are now connected.</p>
      <p>You can close this tab.</p>
      <p><a href="${site}" style="display:inline-block;padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none">Return to Plan2Tasks</a></p>`;
    return res.status(200).send(htmlPage("Connected", body));
  } catch (e) {
    return res.status(500).send(htmlPage("Server error", `<p>${e?.message || "Unknown"}</p>`));
  }
}
