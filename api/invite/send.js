// /api/invite/send.js
// POST: creates invite + emails it via Resend (JSON result).
// GET with ?debug=1: creates invite and returns the URL without sending (browser-friendly).
//
// ENV required by /api/debug/config: RESEND_API_KEY, RESEND_FROM, SITE_URL (optional; we fall back to Host)

import { supabaseAdmin } from "../../lib/supabase-admin.js";

function norm(v) { return (v ?? "").toString().trim(); }
function lowerEmail(v) { return norm(v).toLowerCase(); }
function siteBase(req) {
  const envSite = norm(process.env.SITE_URL);
  if (envSite) return envSite.replace(/\/+$/,"");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  return host ? `${proto}://${host}` : "https://www.plan2tasks.com";
}

async function createInvite(plannerEmail, userEmail) {
  return await supabaseAdmin
    .from("invites")
    .insert({ planner_email: plannerEmail, user_email: userEmail })
    .select("id")
    .single();
}

async function sendEmail({ to, from, subject, html, text, apiKey }) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ to, from, subject, html, text })
  });
  const ctype = resp.headers.get("content-type") || "";
  let payload = null;
  try {
    payload = ctype.includes("application/json") ? await resp.json() : await resp.text();
  } catch { /* ignore parse errors */ }

  if (!resp.ok) {
    const msg = typeof payload === "string" ? payload : (payload?.error || JSON.stringify(payload));
    throw new Error(msg || `Resend error (${resp.status})`);
  }
  return payload;
}

export default async function handler(req, res) {
  try {
    const method = req.method;

    if (method !== "POST" && method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok:false, error: "Method Not Allowed" });
    }

    // Accept both JSON body (POST) and query (GET debug)
    const isDebugGet = method === "GET" && String(req.query.debug || "") === "1";
    const src = isDebugGet ? req.query : (req.body || {});
    const plannerEmail = lowerEmail(src.plannerEmail);
    const userEmail = lowerEmail(src.userEmail);

    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok:false, error: "Missing plannerEmail or userEmail" });
    }

    // Create invite
    const ins = await createInvite(plannerEmail, userEmail);
    if (ins.error) {
      return res.status(500).json({
        ok:false,
        error: ins.error.message || "Failed to create invite",
        detail: ins.error.details || null,
        hint: ins.error.hint || null
      });
    }
    const id = ins.data?.id;
    if (!id) return res.status(500).json({ ok:false, error: "Invite created without id" });

    const base = siteBase(req);
    const inviteUrl = `${base}/api/google/start?invite=${encodeURIComponent(id)}`;

    // Debug GET path: don't send, just return JSON so you can click-test in a browser
    if (isDebugGet) {
      return res.status(200).json({
        ok: true,
        debug: true,
        inviteId: id,
        url: inviteUrl
      });
    }

    // POST: actually send via Resend
    const apiKey = norm(process.env.RESEND_API_KEY);
    const from = norm(process.env.RESEND_FROM || "notices@plan2tasks.com");
    if (!apiKey || !from) {
      return res.status(500).json({ ok:false, error: "Email disabled: missing RESEND_API_KEY or RESEND_FROM" });
    }

    const subject = "You're invited to connect Google Tasks to Plan2Tasks";
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111">
        <p>Hi there,</p>
        <p><strong>${plannerEmail}</strong> invited you to connect your Google Tasks to Plan2Tasks.</p>
        <p style="margin:16px 0;">
          <a href="${inviteUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;display:inline-block">
            Connect Google Tasks
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link:</p>
        <p style="word-break:break-all;color:#444">${inviteUrl}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
        <p style="font-size:12px;color:#666">After connecting, you'll see a “Connected” confirmation. There is no route back to the app.</p>
      </div>
    `;
    const text = `Hi,

${plannerEmail} invited you to connect your Google Tasks to Plan2Tasks.

Connect: ${inviteUrl}

After connecting, you'll see a "Connected" confirmation (no route back to the app).
`;

    await sendEmail({
      to: userEmail,
      from,
      subject,
      html,
      text,
      apiKey
    });

    return res.status(200).json({
      ok: true,
      sent: true,
      inviteId: id,
      url: inviteUrl
    });
  } catch (e) {
    console.error("invite/send error:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
