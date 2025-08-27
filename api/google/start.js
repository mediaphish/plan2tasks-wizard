// /api/google/start.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  (process.env.SITE_URL?.replace(/\/$/, "") + "/api/google/callback");

function siteBase(req) {
  const envSite = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (envSite) return envSite;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function b64url(obj) {
  const b64 = Buffer.from(JSON.stringify(obj)).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default async function handler(req, res) {
  try {
    const site = siteBase(req);
    if (!CLIENT_ID || !REDIRECT_URI) {
      return res.status(500).send("Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI");
    }

    const inviteId = (req.query.invite || "").trim();
    let planner = (req.query.plannerEmail || "").trim();
    let user = (req.query.userEmail || "").trim();

    if (inviteId && (!planner || !user)) {
      const { data: inv, error } = await supabaseAdmin
        .from("invites")
        .select("planner_email,user_email")
        .eq("id", inviteId)
        .maybeSingle();
      if (error) return res.status(500).send(error.message);
      if (inv) {
        planner = inv.planner_email;
        user = inv.user_email;
      }
    }

    if (!planner || !user) {
      return res.status(400).send("Missing plannerEmail or userEmail (or invalid invite)");
    }

    // Seed a pending connection row (handy for dashboards)
    await supabaseAdmin
      .from("user_connections")
      .upsert(
        { planner_email: planner, user_email: user, status: "pending", updated_at: new Date().toISOString() },
        { onConflict: "planner_email,user_email" }
      );

    const scope = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/tasks",
    ].join(" ");

    const state = b64url({ v: 1, inviteId: inviteId || null, planner, user });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("state", state);

    return res.redirect(302, authUrl.toString());
  } catch (e) {
    return res.status(500).send(e?.message || "Server error");
  }
}
