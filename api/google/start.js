// api/google/start.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

const SITE =
  process.env.PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";

function b64url(json) {
  return Buffer.from(JSON.stringify(json)).toString("base64url");
}

export default async function handler(req, res) {
  try {
    const url = new URL(`https://${req.headers.host}${req.url}`);
    const inviteId = url.searchParams.get("invite") || "";
    const dry = url.searchParams.get("dry") === "1";

    if (!SITE || !CLIENT_ID || !REDIRECT_URI) {
      return res.status(500).json({
        error: "Missing env",
        needed: {
          PUBLIC_SITE_URL: !!SITE,
          GOOGLE_CLIENT_ID: !!CLIENT_ID,
          GOOGLE_REDIRECT_URI: !!REDIRECT_URI
        }
      });
    }
    if (!inviteId) return res.status(400).json({ error: "Missing invite" });

    // Ensure invite exists (so we know planner/user emails later)
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invites")
      .select("id, planner_email, user_email, accepted_at, deleted_at")
      .eq("id", inviteId)
      .single();
    if (invErr || !inv) return res.status(404).json({ error: "Invite not found" });
    if (inv.deleted_at) return res.status(410).json({ error: "Invite deleted" });

    const state = b64url({ v: 1, inviteId });
    const scope = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/tasks"
    ].join(" ");

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      scope,
      state
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    if (dry) {
      return res.json({
        ok: true,
        invite: { id: inv.id, planner: inv.planner_email, user: inv.user_email },
        using: { site: SITE, clientId: CLIENT_ID, redirectUri: REDIRECT_URI },
        authUrl
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.writeHead(302, { Location: authUrl });
    res.end();
  } catch (e) {
    console.error("start error", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
