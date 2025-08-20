// api/google/callback.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  try {
    const code = req.query.code;
    const invite = req.query.state; // we passed the invite code in 'state'
    if (!code || !invite) return res.status(400).send("Missing code/state");

    // Exchange the auth code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenResp.json();
    if (tokenJson.error) {
      return res.status(500).send("Token exchange failed: " + JSON.stringify(tokenJson));
    }

    const { access_token, refresh_token, expires_in } = tokenJson;
    if (!refresh_token) {
      // If no refresh_token, user may have previously consented. Ask to re-consent once.
      return res.status(400).send("No refresh token returned. Try again with prompt=consent.");
    }

    // Find the user's email so we know which account connected
    const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userinfo = await userinfoResp.json();
    const userEmail = userinfo?.email;
    if (!userEmail) return res.status(400).send("Could not fetch user email.");

    // Save to Supabase
    const supabase = supabaseAdmin();
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    const { error } = await supabase
      .from("user_connections")
      .update({
        user_email: userEmail,
        google_refresh_token: refresh_token,
        status: "connected",
        token_expiry: expiresAt.toISOString(),
      })
      .eq("invite_code", invite);

    if (error) return res.status(500).send("DB update failed: " + error.message);

    // Simple success page
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(`
      <html><body style="font-family:system-ui;padding:24px">
        <h2>You're connected ✅</h2>
        <p>Google Tasks access granted for <b>${userEmail}</b>.</p>
        <p>You can close this tab now.</p>
      </body></html>
    `);
  } catch (e) {
    return res.status(500).send("Unexpected error: " + e.message);
  }
}
