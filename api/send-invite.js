// api/send-invite.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { to, inviteLink, plannerEmail } = req.body || {};
  if (!to || !inviteLink) return res.status(400).json({ error: "Missing to or inviteLink" });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Plan2Tasks <noreply@example.com>";

  if (!apiKey) {
    // No email setup? Still succeed so the UI flows; planner can copy the link.
    return res.status(200).json({ sent: false, reason: "email not configured" });
  }

  try {
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
    return res.status(200).json({ sent: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
