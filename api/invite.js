// api/invite.js
import { randomBytes } from "crypto";
import { supabaseAdmin } from "../lib/supabase.js";

function absoluteBase(req) {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function sendEmail(to, inviteLink, plannerEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Plan2Tasks <noreply@example.com>";
  if (!apiKey) return { sent: false, reason: "email not configured" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "Authorize Plan2Tasks to deliver tasks",
      html: `<p>Hi,</p>
<p>${plannerEmail || "A planner"} invites you to authorize Plan2Tasks to create tasks in your Google Tasks.</p>
<p><a href="${inviteLink}">${inviteLink}</a></p>
<p>You can revoke at any time.</p>`
    })
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(text);
  return { sent: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { plannerEmail, userEmail } = req.body || {};
  if (!plannerEmail || !userEmail) {
    return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
  }

  const sb = supabaseAdmin();
  const invite_code = randomBytes(16).toString("hex");

  // Try upsert on (planner_email, user_email)
  const { data, error } = await sb
    .from("user_connections")
    .upsert(
      { planner_email: plannerEmail, user_email: userEmail, status: "invited", invite_code },
      { onConflict: "planner_email,user_email" }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const base = absoluteBase(req);
  const inviteLink = `${base}/api/google/start?invite=${invite_code}`;

  // Send email server-side (best-effort)
  let email = { sent: false };
  try { email = await sendEmail(userEmail, inviteLink, plannerEmail); } catch (e) { /* ignore */ }

  return res.status(200).json({ inviteLink, emailed: !!email.sent });
}
