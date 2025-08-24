// api/invite.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const SITE =
  process.env.PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

async function sendEmail({ to, subject, html }) {
  if (!RESEND_KEY) return { ok: false, skipped: true, reason: "No RESEND_API_KEY" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Plan2Tasks <noreply@plan2tasks.com>",
        to: [to],
        subject,
        html
      })
    });
    const j = await r.json();
    return { ok: r.ok, id: j?.id || null, raw: j };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Use POST (or GET for quick preview)" });
  }
  try {
    const url = new URL(`https://${req.headers.host}${req.url}`);
    const plannerEmail = (req.method === "POST"
      ? (req.body?.plannerEmail || "")
      : (url.searchParams.get("plannerEmail") || "")).toLowerCase().trim();
    const userEmail = (req.method === "POST"
      ? (req.body?.userEmail || "")
      : (url.searchParams.get("userEmail") || "")).toLowerCase().trim();

    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }
    if (!SITE) {
      return res.status(500).json({ error: "PUBLIC_SITE_URL not set" });
    }

    // Upsert invite (create if not exists)
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("invites")
      .upsert({
        planner_email: plannerEmail,
        user_email: userEmail,
        accepted_at: null
      }, { onConflict: "planner_email,user_email" })
      .select()
      .single();

    if (inviteErr) throw inviteErr;

    // The link your user will click → goes to YOUR domain
    const inviteLink = `${SITE}/api/google/start?invite=${encodeURIComponent(invite.id || invite.invite_id || "")}`;

    // Compose email
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4">
        <h2>Connect your Google Tasks to Plan2Tasks</h2>
        <p>${plannerEmail} wants to send tasks to your Google Tasks list.</p>
        <p><a href="${inviteLink}" style="display:inline-block;background:#0891b2;color:#fff;padding:10px 14px;border-radius:10px;text-decoration:none">Authorize Planner</a></p>
        <p>If the button doesn’t work, copy and paste this URL:</p>
        <p style="font-size:12px;color:#555">${inviteLink}</p>
      </div>
    `;

    let emailed = false, emailInfo = null;
    if (req.method === "POST") {
      const sent = await sendEmail({ to: userEmail, subject: "Authorize Plan2Tasks", html });
      emailed = !!sent.ok;
      emailInfo = sent;
    }

    res.json({
      ok: true,
      emailed,
      inviteId: invite.id || invite.invite_id || null,
      inviteUrl: inviteLink,
      emailInfo
    });
  } catch (e) {
    console.error("invite error", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
