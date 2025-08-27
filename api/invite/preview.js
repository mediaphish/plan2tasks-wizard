// /api/invite/preview.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function siteBase(req) {
  const envSite = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (envSite) return envSite;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  try {
    const plannerEmail = (req.query.plannerEmail || req.body?.plannerEmail || "").trim();
    const userEmail = (req.query.userEmail || req.body?.userEmail || "").trim();
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }

    // 1) Look for ANY existing invite for this pair (used or not)
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("invites")
      .select("id, used_at")
      .eq("planner_email", plannerEmail)
      .eq("user_email", userEmail)
      .maybeSingle();

    if (selErr) return res.status(500).json({ error: selErr.message });

    let inviteId;

    if (existing?.id) {
      // If it was already used, "reset" it so it's reusable
      if (existing.used_at) {
        const { data: upd, error: upErr } = await supabaseAdmin
          .from("invites")
          .update({ used_at: null })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (upErr) return res.status(500).json({ error: upErr.message });
        inviteId = upd.id;
      } else {
        inviteId = existing.id;
      }
    } else {
      // No row yet → create one
      const { data: created, error: insErr } = await supabaseAdmin
        .from("invites")
        .insert({ planner_email: plannerEmail, user_email: userEmail })
        .select("id")
        .single();
      if (insErr) return res.status(500).json({ error: insErr.message });
      inviteId = created.id;
    }

    const site = siteBase(req);
    const inviteUrl = `${site}/api/google/start?invite=${inviteId}`;

    return res.json({
      ok: true,
      emailed: false,
      inviteId,
      inviteUrl,
      emailInfo: null,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
