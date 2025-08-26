// api/invite/send.js
// Sends an invite email using Resend (if configured). Always returns JSON. No redirects.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { plannerEmail, userEmail } = req.body || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }

    // Figure out our site origin to call the preview endpoint
    const origin =
      process.env.SITE_URL ||
      (req.headers["x-forwarded-proto"] && req.headers.host
        ? `${req.headers["x-forwarded-proto"]}://${req.headers.host}`
        : `https://${req.headers.host}`);

    // Ask the existing preview endpoint to (a) create or (b) reuse an invite and give us the URL
    const previewUrl = `${origin}/api/invite/preview?plannerEmail=${encodeURIComponent(
      plannerEmail
    )}&userEmail=${encodeURIComponent(userEmail)}`;

    const pre = await fetch(previewUrl, { method: "GET" });
    const pj = await pre.json().catch(() => ({}));
    if (!pre.ok || pj.error || !pj.inviteUrl) {
      return res
        .status(500)
        .json({ error: pj.error || "Failed to prepare invite", details: pj });
    }

    const { inviteId, inviteUrl } = pj;

    // If Resend isn't configured, don't redirect — return JSON with the link.
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    const RESEND_FROM = process.env.RESEND_FROM || "";

    if (!RESEND_API_KEY || !RESEND_FROM) {
      return res.status(400).json({
        error:
          "Email sending is not configured (missing RESEND_API_KEY or RESEND_FROM). Use the link below or set up Resend.",
        inviteId,
        inviteUrl,
        emailed: false,
      });
    }

    // Lazy-import Resend so this function runs fine even without the package in dev
    const { Resend } = await import("resend");
    const resend = new Resend(RESEND_API_KEY);

    // Simple HTML email
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">You're invited to connect your Google Tasks</h2>
        <p>${escapeHtml(
          plannerEmail
        )} wants to create and manage tasks for you via <b>Plan2Tasks</b>.</p>
        <p>Click the button below to authorize with your Google account.</p>
        <p style="margin:16px 0">
          <a href="${inviteUrl}"
             style="display:inline-block;background:#06b6d4;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600">
             Authorize Plan2Tasks
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link:</p>
        <p style="word-break:break-all"><a href="${inviteUrl}">${inviteUrl}</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
        <p style="font-size:12px;color:#555">You received this because a planner invited you on Plan2Tasks.</p>
      </div>
    `;

    const text = [
      `You're invited to connect your Google Tasks`,
      ``,
      `${plannerEmail} wants to create and manage tasks for you via Plan2Tasks.`,
      ``,
      `Authorize here: ${inviteUrl}`,
    ].join("\n");

    const result = await resend.emails.send({
      from: RESEND_FROM,           // e.g. 'notices@plan2tasks.com' or 'onboarding@resend.dev'
      to: userEmail,               // recipient
      subject: "Authorize Plan2Tasks to manage your Google Tasks",
      html,
      text,
    });

    // If Resend errors, propagate as JSON
    if (result?.error) {
      return res.status(502).json({
        error: `Resend error: ${result.error.message || "Unknown"}`,
        inviteId,
        inviteUrl,
        emailed: false,
      });
    }

    return res.json({ ok: true, inviteId, inviteUrl, emailed: true });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

// tiny helper
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
