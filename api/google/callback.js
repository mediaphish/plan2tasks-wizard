// api/google/callback.js
export const config = { runtime: "nodejs" };

import { supabaseAdmin } from "../../lib/supabase.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function absoluteBase(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  try {
    const code = (req.query.code || "").toString();
    const invite = (req.query.state || "").toString(); // we put invite code in state
    if (!code || !invite) return res.status(400).send("Missing code or state");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).send("Missing Google OAuth env");

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${absoluteBase(req)}/api/google/callback`;

    // Exchange the code for tokens
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });

    const tokResp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokenJson = await tokResp.json();
    if (!tokResp.ok) {
      const msg = tokenJson.error_description || tokenJson.error || "Token exchange failed";
      return res.status(400).send("Google OAuth error: " + msg);
    }

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token || ""; // may be empty if Google didn’t return new one
    const expiresIn = tokenJson.expires_in || 3600;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    // Get the user’s Google email (requires userinfo.email scope)
    let googleEmail = "";
    const uiResp = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (uiResp.ok) {
      const u = await uiResp.json();
      googleEmail = (u && (u.email || u.sub)) || "";
    }

    // Persist tokens to the invited row
    const sb = supabaseAdmin();
    const { data: row, error: rowErr } = await sb
      .from("user_connections")
      .select("*")
      .eq("invite_code", invite)
      .single();

    if (rowErr || !row) {
      return res.status(400).send("Invite not found. Ask your planner to resend.");
    }

    const update = {
      status: "connected",
      google_access_token: accessToken,
      google_token_expiry: expiresAt,
      updated_at: new Date().toISOString()
    };
    if (refreshToken) update.google_refresh_token = refreshToken;
    if (googleEmail && googleEmail !== row.user_email) {
      // Keep the display email in sync if Google returns a different one
      update.user_email = googleEmail;
    }

    const { error: upErr } = await sb
      .from("user_connections")
      .update(update)
      .eq("invite_code", invite);

    if (upErr) {
      return res.status(500).send("Failed to save connection: " + upErr.message);
    }

    // Success — send the user back to your app UI
    const doneUrl =
      process.env.APP_BASE_URL ||
      `${absoluteBase(req)}/?connected=1`;
    res.setHeader("Location", doneUrl);
    return res.status(302).end();
  } catch (e) {
    return res.status(500).send(String(e.message || e));
  }
}
