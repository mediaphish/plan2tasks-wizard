// /api/invite/send.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

const SITE_URL = process.env.SITE_URL || "https://www.plan2tasks.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;

async function ensureInvite(plannerEmail, userEmail) {
  // Find invite case-insensitively
  let { data: row, error } = await supabaseAdmin
    .from("invites")
    .select("id, planner_email, user_email, used_at")
    .ilike("planner_email", plannerEmail)
    .ilike("user_email", userEmail)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;

  if (!row) {
    // Create the single invite row for this pair (unique on planner_email+user_email)
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("invites")
      .insert([{ planner_email: plannerEmail, user_email: userEmail }])
      .select("id, used_at")
      .single();
    if (insErr) throw insErr;
    row = ins;
  }

  return { id: row.id, used: !!row.used_at, url: `${SITE_URL}/api/google/start?invite=${row.id}` };
}

async function sendEmail({ to, url }) {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    throw new Error("Email not configured (missing RESEND_API_KEY or RESEND_FROM).");
  }
  const subject = "Connect your Google Tasks to Plan2Tasks";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Plan2Tasks Connection</h2>
      <p>Click the button below to connect your Google Tasks:</p>
      <p><a href="${url}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Connect Google Tasks</a></p>
      <p>If the button doesn't work, copy & paste this link:</p>
      <p><a href="${url}">${url}</a></p>
      <hr/>
      <p style="color:#666;font-size:12px">You received this because a planner invited you to Plan2Tasks.</p>
    </div>
  `;
  const payload = {
    from: RESEND_FROM,
    to: [to],
    subject,
    html,
  };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) {
    let msg = text;
    try { const j = JSON.parse(text); msg = j?.message || j?.error || text; } catch {}
    throw new Error(`Resend API error: ${msg}`);
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const { plannerEmail, userEmail } = req.body || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
    }

    const { id, used, url } = await ensureInvite(plannerEmail, userEmail);

    // Always send, even if previously used. The same link can start OAuth again.
    const emailed = await sendEmail({ to: userEmail, url });

    return res.json({ ok: true, emailed: !!emailed, inviteId: id, url, reused: true, used });
  } catch (e) {
    console.error("invite/send error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
