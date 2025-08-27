// /api/invite/send.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const plannerEmail = (req.body?.plannerEmail || "").trim();
    const userEmail = (req.body?.userEmail || "").trim();
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }

    // Ensure we have an invite/link
    const preview = await fetch(
      `${process.env.SITE_URL.replace(/\/$/, "")}/api/invite/preview?plannerEmail=${encodeURIComponent(plannerEmail)}&userEmail=${encodeURIComponent(userEmail)}`
    );
    const j = await preview.json();
    if (!preview.ok || j.error) return res.status(500).json({ error: j.error || "Invite preview failed" });

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM = process.env.RESEND_FROM;
    if (!RESEND_API_KEY || !RESEND_FROM) {
      return res.status(200).json({
        ok: true,
        emailed: false,
        reason: "Email sending is not configured (missing RESEND_* env)",
        inviteUrl: j.inviteUrl,
      });
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [userEmail],
        subject: "Connect your Google Tasks to Plan2Tasks",
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
            <p>${plannerEmail} invited you to let Plan2Tasks add tasks to your Google Tasks list.</p>
            <p><a href="${j.inviteUrl}">Click here to connect</a></p>
            <p>If you didn’t expect this, you can ignore this email.</p>
          </div>`,
      }),
    });
    const sent = await r.json();
    if (!r.ok) return res.status(500).json({ error: sent?.message || "Send failed" });

    return res.json({ ok: true, emailed: true, info: sent, inviteUrl: j.inviteUrl });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
